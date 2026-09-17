use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Notify;
use tracing::{info, warn};

use crate::error::AppError;
use crate::services::install_pipeline::{self, InstallProgress};
use crate::services::launcher;
use crate::AppState;
/// Maximum number of finished items kept in the queue history.
const MAX_HISTORY: usize = 50;
/// How long to wait between checks while Valheim is running.
const GAME_POLL_INTERVAL: Duration = Duration::from_secs(3);
/// Retry delays for transient network failures, indexed by attempt.
const RETRY_BACKOFF_SECS: [u64; 5] = [5, 10, 20, 30, 60];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadKind {
    Mod,
    Modpack,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Installing,
    Paused,
    WaitingForGame,
    WaitingForNetwork,
    Completed,
    Failed,
    Cancelled,
}

impl DownloadStatus {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }

    pub fn is_active(self) -> bool {
        matches!(self, Self::Downloading | Self::Installing)
    }
}

/// A single queued install request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    pub id: u64,
    pub full_name: String,
    pub name: String,
    #[serde(default)]
    pub version: Option<String>,
    pub kind: DownloadKind,
    pub status: DownloadStatus,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub current: usize,
    #[serde(default)]
    pub total: usize,
    #[serde(default)]
    pub bytes_downloaded: u64,
    #[serde(default)]
    pub bytes_total: Option<u64>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub retry_count: u32,
    #[serde(default)]
    pub installed_count: usize,
    pub queued_at: String,
    #[serde(default)]
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadQueueSnapshot {
    pub paused: bool,
    pub items: Vec<DownloadItem>,
}

/// Payload for the "mod-progress" event; drives live download meters.
#[derive(Debug, Clone, Serialize)]
pub struct ModProgressEvent {
    /// Queue item this progress belongs to. Absent for non-queue downloads
    /// such as Sync & Clean.
    pub item_id: u64,
    pub stage: String,
    pub mod_name: String,
    pub current: usize,
    pub total: usize,
    pub bytes_downloaded: u64,
    pub bytes_total: Option<u64>,
    pub message: String,
}

impl ModProgressEvent {
    fn from_progress(item_id: u64, progress: &InstallProgress) -> Self {
        Self {
            item_id,
            stage: progress.stage.to_string(),
            mod_name: progress.mod_name.clone(),
            current: progress.current,
            total: progress.total,
            bytes_downloaded: progress.bytes_downloaded,
            bytes_total: progress.bytes_total,
            message: progress.message.clone(),
        }
    }
}

/// Flags the queue worker observes to stop an in-flight item.
#[derive(Default)]
pub struct InstallControl {
    pause: AtomicBool,
    cancel: AtomicBool,
}

impl InstallControl {
    pub fn request_pause(&self) {
        self.pause.store(true, Ordering::SeqCst);
    }

    pub fn request_cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    pub fn pause_requested(&self) -> bool {
        self.pause.load(Ordering::SeqCst)
    }

    pub fn cancel_requested(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    /// True when the item must stop at the next checkpoint.
    pub fn is_aborted(&self) -> bool {
        self.pause_requested() || self.cancel_requested()
    }
}

#[derive(Serialize, Deserialize)]
struct PersistedQueue {
    #[serde(default)]
    paused: bool,
    #[serde(default)]
    items: Vec<DownloadItem>,
}

struct Inner {
    items: Vec<DownloadItem>,
    paused: bool,
    next_id: u64,
}

/// Serialized install queue with pause/cancel support.
///
/// Queue state survives restarts: the worker rewrites `download-queue.json`
/// after every membership or status change. Items interrupted mid-install are
/// requeued on load.
pub struct DownloadQueue {
    inner: Mutex<Inner>,
    active: Mutex<Option<(u64, Arc<InstallControl>)>>,
    notify: Notify,
    store_path: PathBuf,
}

impl DownloadQueue {
    pub fn open(store_path: PathBuf) -> Self {
        let (items, paused, next_id) = load_persisted(&store_path);
        if !items.is_empty() {
            info!("Restored {} queued item(s) from disk", items.len());
        }
        Self {
            inner: Mutex::new(Inner {
                items,
                paused,
                next_id,
            }),
            active: Mutex::new(None),
            notify: Notify::new(),
            store_path,
        }
    }

    /// Build the queue at the default app-data location.
    pub fn open_default() -> Self {
        Self::open(
            crate::services::thunderstore_client::get_app_data_dir()
                .join("download-queue.json"),
        )
    }

    pub fn snapshot(&self) -> DownloadQueueSnapshot {
        let inner = self.lock_inner();
        DownloadQueueSnapshot {
            paused: inner.paused,
            items: inner.items.clone(),
        }
    }

    pub fn is_paused(&self) -> bool {
        self.lock_inner().paused
    }

    pub fn item(&self, id: u64) -> Option<DownloadItem> {
        self.lock_inner()
            .items
            .iter()
            .find(|item| item.id == id)
            .cloned()
    }

    /// Add a request, or refresh an existing pending one for the same mod.
    pub fn enqueue(
        &self,
        full_name: &str,
        name: &str,
        version: Option<String>,
        kind: DownloadKind,
    ) -> DownloadItem {
        let result = {
            let mut inner = self.lock_inner();

            let existing = inner.items.iter().position(|item| {
                item.full_name == full_name
                    && (!item.status.is_terminal() || item.status == DownloadStatus::Failed)
            });

            if let Some(index) = existing {
                let item = &mut inner.items[index];
                // A running install keeps its version; changing it mid-flight
                // would misreport what actually landed on disk.
                if item.status.is_active() {
                    return item.clone();
                }
                let retrying = item.status == DownloadStatus::Failed;
                if retrying || item.version != version {
                    item.version = version;
                    item.status = DownloadStatus::Queued;
                    item.error = None;
                    item.retry_count = 0;
                    item.installed_count = 0;
                    item.current = 0;
                    item.total = 0;
                    item.bytes_downloaded = 0;
                    item.bytes_total = None;
                    item.finished_at = None;
                    item.message = "Queued".to_string();
                }
                item.clone()
            } else {
                let id = inner.next_id;
                inner.next_id += 1;
                let item = DownloadItem {
                    id,
                    full_name: full_name.to_string(),
                    name: name.to_string(),
                    version,
                    kind,
                    status: DownloadStatus::Queued,
                    message: "Queued".to_string(),
                    current: 0,
                    total: 0,
                    bytes_downloaded: 0,
                    bytes_total: None,
                    error: None,
                    retry_count: 0,
                    installed_count: 0,
                    queued_at: chrono::Utc::now().to_rfc3339(),
                    finished_at: None,
                };
                inner.items.push(item.clone());
                item
            }
        };

        self.persist();
        self.notify.notify_one();
        result
    }

    /// Id of the next item the worker should process.
    pub fn next_queued(&self) -> Option<u64> {
        let inner = self.lock_inner();
        if inner.paused {
            return None;
        }
        inner
            .items
            .iter()
            .find(|item| item.status == DownloadStatus::Queued)
            .map(|item| item.id)
    }

    /// True when something is runnable or waiting for Valheim to close.
    pub fn has_work(&self) -> bool {
        self.lock_inner().items.iter().any(|item| {
            matches!(
                item.status,
                DownloadStatus::Queued | DownloadStatus::WaitingForGame
            )
        })
    }

    /// Mark an item as started and hand out its control flags. Returns None
    /// when the item is no longer queued (paused or cancelled meanwhile).
    pub fn begin(&self, id: u64) -> Option<Arc<InstallControl>> {
        {
            let mut inner = self.lock_inner();
            let item = inner.items.iter_mut().find(|item| item.id == id)?;
            if item.status != DownloadStatus::Queued {
                return None;
            }
            item.status = DownloadStatus::Downloading;
            item.message = "Preparing...".to_string();
            item.error = None;
            reset_progress(item);
        }

        let control = Arc::new(InstallControl::default());
        let mut active = self
            .active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *active = Some((id, Arc::clone(&control)));
        Some(control)
    }

    pub fn deactivate(&self, id: u64) {
        let mut active = self
            .active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if active.as_ref().is_some_and(|(active_id, _)| *active_id == id) {
            *active = None;
        }
    }

    fn active_control(&self, id: u64) -> Option<Arc<InstallControl>> {
        let active = self
            .active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        active
            .as_ref()
            .filter(|(active_id, _)| *active_id == id)
            .map(|(_, control)| Arc::clone(control))
    }

    fn any_active_control(&self) -> Option<Arc<InstallControl>> {
        let active = self
            .active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        active.as_ref().map(|(_, control)| Arc::clone(control))
    }

    /// Update live progress for an item. Returns true when the status changed.
    pub fn apply_progress(&self, id: u64, progress: &InstallProgress) -> bool {
        let mut inner = self.lock_inner();
        let Some(item) = inner.items.iter_mut().find(|item| item.id == id) else {
            return false;
        };
        // Only running items accept live updates; paused, waiting and finished
        // items keep the state the user sees.
        if !matches!(
            item.status,
            DownloadStatus::Queued | DownloadStatus::Downloading | DownloadStatus::Installing
        ) {
            return false;
        }
        let next_status = if progress.stage == "installing" {
            DownloadStatus::Installing
        } else {
            DownloadStatus::Downloading
        };
        let status_changed = item.status != next_status;
        item.status = next_status;
        item.message = progress.message.clone();
        item.current = progress.current;
        item.total = progress.total;
        if progress.bytes_downloaded > 0 || progress.bytes_total.is_some() {
            item.bytes_downloaded = progress.bytes_downloaded;
            item.bytes_total = progress.bytes_total;
        }
        status_changed
    }

    pub fn set_status(&self, id: u64, status: DownloadStatus, message: &str) -> bool {
        let mut inner = self.lock_inner();
        let Some(item) = inner.items.iter_mut().find(|item| item.id == id) else {
            return false;
        };
        item.status = status;
        item.message = message.to_string();
        if status.is_terminal() {
            item.finished_at = Some(chrono::Utc::now().to_rfc3339());
        } else {
            item.finished_at = None;
        }
        trim_history(&mut inner);
        true
    }

    pub fn complete(&self, id: u64, installed_count: usize) -> bool {
        let mut inner = self.lock_inner();
        let Some(item) = inner.items.iter_mut().find(|item| item.id == id) else {
            return false;
        };
        item.status = DownloadStatus::Completed;
        item.installed_count = installed_count;
        item.error = None;
        item.message = if installed_count > 0 {
            format!("Installed {} mod{}", installed_count, plural(installed_count))
        } else {
            "Already up to date".to_string()
        };
        item.finished_at = Some(chrono::Utc::now().to_rfc3339());
        trim_history(&mut inner);
        true
    }

    pub fn fail(&self, id: u64, error: &str) -> bool {
        let mut inner = self.lock_inner();
        let Some(item) = inner.items.iter_mut().find(|item| item.id == id) else {
            return false;
        };
        item.status = DownloadStatus::Failed;
        item.error = Some(error.to_string());
        item.message = "Failed".to_string();
        item.finished_at = Some(chrono::Utc::now().to_rfc3339());
        trim_history(&mut inner);
        true
    }

    /// Mark a transient network failure and return the retry attempt number.
    pub fn mark_waiting_network(&self, id: u64, error: &str) -> u32 {
        let mut inner = self.lock_inner();
        let Some(item) = inner.items.iter_mut().find(|item| item.id == id) else {
            return 1;
        };
        item.status = DownloadStatus::WaitingForNetwork;
        item.retry_count = item.retry_count.saturating_add(1);
        item.error = Some(error.to_string());
        item.message = "No connection — retrying automatically".to_string();
        item.retry_count
    }

    /// Return a waiting item to the queue after its backoff elapsed. Items the
    /// user paused or cancelled meanwhile keep their new status.
    pub fn requeue_after_wait(&self, id: u64) -> bool {
        let mut inner = self.lock_inner();
        let Some(item) = inner.items.iter_mut().find(|item| item.id == id) else {
            return false;
        };
        if item.status != DownloadStatus::WaitingForNetwork {
            return false;
        }
        item.status = DownloadStatus::Queued;
        item.message = "Queued".to_string();
        reset_progress(item);
        true
    }

    /// Return items deferred for Valheim to the queue once it closed.
    pub fn requeue_deferred_for_game(&self) -> bool {
        let mut inner = self.lock_inner();
        let mut changed = false;
        for item in inner.items.iter_mut() {
            if item.status == DownloadStatus::WaitingForGame {
                item.status = DownloadStatus::Queued;
                item.message = "Queued".to_string();
                reset_progress(item);
                changed = true;
            }
        }
        changed
    }

    /// Defer every queued item because Valheim is running.
    pub fn defer_all_for_game(&self) -> bool {
        let mut inner = self.lock_inner();
        let mut changed = false;
        for item in inner.items.iter_mut() {
            if item.status == DownloadStatus::Queued {
                item.status = DownloadStatus::WaitingForGame;
                item.message = "Waiting for Valheim to close".to_string();
                changed = true;
            }
        }
        changed
    }

    pub fn pause(&self, id: u64) -> bool {
        if let Some(control) = self.active_control(id) {
            control.request_pause();
        }
        self.set_status(id, DownloadStatus::Paused, "Paused")
    }

    pub fn resume(&self, id: u64) -> bool {
        let mut inner = self.lock_inner();
        let Some(item) = inner.items.iter_mut().find(|item| item.id == id) else {
            return false;
        };
        if item.status != DownloadStatus::Paused {
            return false;
        }
        item.status = DownloadStatus::Queued;
        item.message = "Queued".to_string();
        true
    }

    pub fn cancel(&self, id: u64) -> bool {
        if let Some(control) = self.active_control(id) {
            control.request_cancel();
        }
        self.set_status(id, DownloadStatus::Cancelled, "Cancelled")
    }

    pub fn retry(&self, id: u64) -> bool {
        let mut inner = self.lock_inner();
        let Some(item) = inner.items.iter_mut().find(|item| item.id == id) else {
            return false;
        };
        if !matches!(
            item.status,
            DownloadStatus::Failed
                | DownloadStatus::Cancelled
                | DownloadStatus::WaitingForNetwork
        ) {
            return false;
        }
        item.status = DownloadStatus::Queued;
        item.message = "Queued".to_string();
        item.error = None;
        item.retry_count = 0;
        item.installed_count = 0;
        item.finished_at = None;
        reset_progress(item);
        true
    }

    /// Remove an item. Active items must be cancelled first.
    pub fn remove(&self, id: u64) -> bool {
        let mut inner = self.lock_inner();
        let is_active = inner
            .items
            .iter()
            .find(|item| item.id == id)
            .is_some_and(|item| item.status.is_active());
        if is_active {
            return false;
        }
        let before = inner.items.len();
        inner.items.retain(|item| item.id != id);
        inner.items.len() != before
    }

    pub fn clear_finished(&self) -> bool {
        let mut inner = self.lock_inner();
        let before = inner.items.len();
        inner.items.retain(|item| !item.status.is_terminal());
        inner.items.len() != before
    }

    pub fn pause_all(&self) -> bool {
        if let Some(control) = self.any_active_control() {
            control.request_pause();
        }
        let mut inner = self.lock_inner();
        inner.paused = true;
        let mut changed = true;
        for item in inner.items.iter_mut() {
            if item.status == DownloadStatus::Queued {
                item.status = DownloadStatus::Paused;
                item.message = "Paused".to_string();
                changed = true;
            }
        }
        changed
    }

    pub fn resume_all(&self) -> bool {
        let mut inner = self.lock_inner();
        inner.paused = false;
        let mut changed = true;
        for item in inner.items.iter_mut() {
            if item.status == DownloadStatus::Paused {
                item.status = DownloadStatus::Queued;
                item.message = "Queued".to_string();
                changed = true;
            }
        }
        changed
    }

    pub fn cancel_all(&self) -> Vec<u64> {
        if let Some(control) = self.any_active_control() {
            control.request_cancel();
        }
        let mut inner = self.lock_inner();
        let now = chrono::Utc::now().to_rfc3339();
        let mut cancelled = Vec::new();
        for item in inner.items.iter_mut() {
            if !item.status.is_terminal() {
                item.status = DownloadStatus::Cancelled;
                item.message = "Cancelled".to_string();
                item.finished_at = Some(now.clone());
                cancelled.push(item.id);
            }
        }
        cancelled
    }

    /// Persist the current state to disk. Failures are logged, not returned:
    /// losing history must never abort an install.
    pub fn persist(&self) {
        let payload = {
            let inner = self.lock_inner();
            serde_json::to_string_pretty(&PersistedQueue {
                paused: inner.paused,
                items: inner.items.clone(),
            })
        };
        let Ok(json) = payload else {
            warn!("Failed to serialize download queue");
            return;
        };
        if let Some(parent) = self.store_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Err(e) = std::fs::write(&self.store_path, json) {
            warn!("Failed to persist download queue: {}", e);
        }
    }

    /// Wake the worker without changing state.
    pub fn wake(&self) {
        self.notify.notify_one();
    }

    pub async fn wait_for_signal(&self) {
        self.notify.notified().await;
    }

    /// Sleep, waking early only to re-check the remaining time.
    pub async fn sleep(&self, duration: Duration) {
        let deadline = tokio::time::Instant::now() + duration;
        loop {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                return;
            }
            let _ = tokio::time::timeout(remaining, self.notify.notified()).await;
        }
    }

    fn lock_inner(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn plural(count: usize) -> &'static str {
    if count == 1 {
        ""
    } else {
        "s"
    }
}

fn reset_progress(item: &mut DownloadItem) {
    item.current = 0;
    item.total = 0;
    item.bytes_downloaded = 0;
    item.bytes_total = None;
}

fn trim_history(inner: &mut Inner) {
    let terminal = inner
        .items
        .iter()
        .filter(|item| item.status.is_terminal())
        .count();
    if terminal <= MAX_HISTORY {
        return;
    }
    let mut to_drop = terminal - MAX_HISTORY;
    inner.items.retain(|item| {
        if to_drop > 0 && item.status.is_terminal() {
            to_drop -= 1;
            false
        } else {
            true
        }
    });
}

fn load_persisted(path: &Path) -> (Vec<DownloadItem>, bool, u64) {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return (Vec::new(), false, 1);
    };
    let Ok(mut persisted) = serde_json::from_str::<PersistedQueue>(&raw) else {
        warn!("Ignoring unreadable download queue at {}", path.display());
        return (Vec::new(), false, 1);
    };

    // Items interrupted by a restart (or still waiting on a condition that no
    // longer applies) restart from the queue. Downloads hold no resumable
    // state, so partial progress is discarded.
    for item in persisted.items.iter_mut() {
        if item.status.is_active()
            || matches!(
                item.status,
                DownloadStatus::WaitingForGame | DownloadStatus::WaitingForNetwork
            )
        {
            item.status = DownloadStatus::Queued;
            item.message = "Queued after restart".to_string();
            reset_progress(item);
        }
    }

    let next_id = persisted
        .items
        .iter()
        .map(|item| item.id)
        .max()
        .unwrap_or(0)
        + 1;

    (persisted.items, persisted.paused, next_id)
}

/// Fetch the queue from Tauri-managed state.
pub fn queue_of(app: &AppHandle) -> Arc<DownloadQueue> {
    Arc::clone(&app.state::<Arc<DownloadQueue>>())
}

pub fn emit_snapshot(app: &AppHandle, queue: &DownloadQueue) {
    let _ = app.emit("download-queue-changed", queue.snapshot());
}

fn emit_mod_progress(app: &AppHandle, item_id: u64, progress: &InstallProgress) {
    let _ = app.emit(
        "mod-progress",
        ModProgressEvent::from_progress(item_id, progress),
    );
}

/// Start the background worker that drains the queue. Safe to call once.
pub fn spawn_worker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        worker_loop(app).await;
    });
}

async fn worker_loop(app: AppHandle) {
    loop {
        let queue = queue_of(&app);

        if !queue.is_paused() && queue.has_work() {
            // Only poll for Valheim while there is actually something to run;
            // an idle queue sleeps on the notify signal instead.
            if game_is_running() {
                if queue.defer_all_for_game() {
                    emit_snapshot(&app, &queue);
                    queue.persist();
                }
                queue.sleep(GAME_POLL_INTERVAL).await;
                continue;
            }
            if queue.requeue_deferred_for_game() {
                emit_snapshot(&app, &queue);
                queue.persist();
            }
            if let Some(id) = queue.next_queued() {
                process_item(&app, &queue, id).await;
                continue;
            }
        }

        queue.wait_for_signal().await;
    }
}

/// Treat an unreadable game status as "not running" so downloads are not
/// blocked forever by a pgrep hiccup; the per-install check still guards writes.
fn game_is_running() -> bool {
    matches!(launcher::is_game_running(), Ok(true))
}

async fn process_item(app: &AppHandle, queue: &Arc<DownloadQueue>, id: u64) {
    let Some(control) = queue.begin(id) else {
        return;
    };
    let Some(item) = queue.item(id) else {
        queue.deactivate(id);
        return;
    };
    emit_snapshot(app, queue);

    let state = app.state::<Mutex<AppState>>();
    let reporter: install_pipeline::ProgressReporter = {
        let app = app.clone();
        let queue = Arc::clone(queue);
        Arc::new(move |progress: InstallProgress| {
            let status_changed = queue.apply_progress(id, &progress);
            emit_mod_progress(&app, id, &progress);
            if status_changed {
                emit_snapshot(&app, &queue);
            }
        })
    };

    let version = item.version.as_deref();
    info!("Queue: processing {} v{:?}", item.full_name, version);
    let result = install_pipeline::install_package(
        &item.full_name,
        version,
        &state,
        Some(&control),
        &reporter,
    )
    .await;

    match result {
        Ok(installed) => {
            queue.complete(id, installed.len());
        }
        Err(AppError::Cancelled) => {
            if control.cancel_requested() {
                queue.set_status(id, DownloadStatus::Cancelled, "Cancelled");
            } else if control.pause_requested() {
                queue.set_status(id, DownloadStatus::Paused, "Paused");
            } else {
                queue.set_status(id, DownloadStatus::Queued, "Queued");
            }
        }
        Err(AppError::GameRunning) => {
            queue.set_status(
                id,
                DownloadStatus::WaitingForGame,
                "Waiting for Valheim to close",
            );
        }
        Err(AppError::NetworkTransient(error)) => {
            let attempt = queue.mark_waiting_network(id, &error);
            warn!(
                "Queue: {} failed (attempt {}), retrying: {}",
                item.full_name, attempt, error
            );
            schedule_network_retry(app, queue, id, retry_delay(attempt));
        }
        Err(error) => {
            queue.fail(id, &error.to_string());
        }
    }

    queue.deactivate(id);
    emit_snapshot(app, queue);
    queue.persist();
}

/// Requeue an item once its backoff elapsed. Runs detached so other queued
/// items keep downloading while this one waits.
fn schedule_network_retry(
    app: &AppHandle,
    queue: &Arc<DownloadQueue>,
    id: u64,
    delay: Duration,
) {
    let queue = Arc::clone(queue);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        queue.sleep(delay).await;
        if queue.requeue_after_wait(id) {
            emit_snapshot(&app, &queue);
            queue.persist();
        }
    });
}

fn retry_delay(attempt: u32) -> Duration {
    let index = attempt.saturating_sub(1) as usize;
    let secs = RETRY_BACKOFF_SECS
        .get(index)
        .copied()
        .unwrap_or(*RETRY_BACKOFF_SECS.last().unwrap_or(&60));
    Duration::from_secs(secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_queue() -> (tempfile::TempDir, DownloadQueue) {
        let dir = tempfile::tempdir().unwrap();
        let queue = DownloadQueue::open(dir.path().join("queue.json"));
        (dir, queue)
    }

    fn progress(stage: &'static str) -> InstallProgress {
        InstallProgress {
            stage,
            mod_name: "Author-Mod".to_string(),
            current: 1,
            total: 2,
            bytes_downloaded: 10,
            bytes_total: Some(20),
            message: "working".to_string(),
        }
    }

    #[test]
    fn enqueue_dedupes_active_items_and_updates_version() {
        let (_dir, queue) = temp_queue();
        let first = queue.enqueue("Author-Mod", "Mod", Some("1.0.0".into()), DownloadKind::Mod);
        let second = queue.enqueue("Author-Mod", "Mod", Some("1.0.1".into()), DownloadKind::Mod);

        assert_eq!(first.id, second.id);
        assert_eq!(queue.snapshot().items.len(), 1);
        assert_eq!(second.version.as_deref(), Some("1.0.1"));
        assert_eq!(second.status, DownloadStatus::Queued);
    }

    #[test]
    fn enqueue_after_completion_creates_new_item() {
        let (_dir, queue) = temp_queue();
        let first = queue.enqueue("Author-Mod", "Mod", None, DownloadKind::Mod);
        queue.complete(first.id, 2);
        let second = queue.enqueue("Author-Mod", "Mod", None, DownloadKind::Mod);

        assert_ne!(first.id, second.id);
        assert_eq!(queue.snapshot().items.len(), 2);
    }

    #[test]
    fn enqueue_retries_a_failed_item_in_place() {
        let (_dir, queue) = temp_queue();
        let item = queue.enqueue("Author-Mod", "Mod", None, DownloadKind::Mod);
        queue.fail(item.id, "boom");
        let retried = queue.enqueue("Author-Mod", "Mod", None, DownloadKind::Mod);

        assert_eq!(item.id, retried.id);
        assert_eq!(retried.status, DownloadStatus::Queued);
        assert!(retried.error.is_none());
    }

    #[test]
    fn pause_aborts_the_active_item_and_resume_requeues_it() {
        let (_dir, queue) = temp_queue();
        let item = queue.enqueue("Author-Mod", "Mod", None, DownloadKind::Mod);
        let control = queue.begin(item.id).unwrap();
        assert_eq!(
            queue.item(item.id).unwrap().status,
            DownloadStatus::Downloading
        );

        assert!(queue.pause(item.id));
        assert!(control.is_aborted());
        assert!(control.pause_requested());
        assert!(!control.cancel_requested());
        assert_eq!(queue.item(item.id).unwrap().status, DownloadStatus::Paused);

        assert!(queue.resume(item.id));
        assert_eq!(queue.item(item.id).unwrap().status, DownloadStatus::Queued);
    }

    #[test]
    fn begin_refuses_items_that_are_not_queued() {
        let (_dir, queue) = temp_queue();
        let item = queue.enqueue("Author-Mod", "Mod", None, DownloadKind::Mod);
        queue.pause(item.id);
        assert!(queue.begin(item.id).is_none());
    }

    #[test]
    fn cancel_wins_over_pause() {
        let (_dir, queue) = temp_queue();
        let item = queue.enqueue("Author-Mod", "Mod", None, DownloadKind::Mod);
        let control = queue.begin(item.id).unwrap();
        queue.pause(item.id);
        queue.cancel(item.id);

        assert!(control.cancel_requested());
        assert_eq!(queue.item(item.id).unwrap().status, DownloadStatus::Cancelled);
        // A cancelled item is not requeued when the worker reports the abort.
        assert!(queue.set_status(item.id, DownloadStatus::Cancelled, "Cancelled"));
        assert_eq!(queue.next_queued(), None);
    }

    #[test]
    fn network_failures_retry_with_backoff_and_stop_when_paused() {
        let (_dir, queue) = temp_queue();
        let item = queue.enqueue("Author-Mod", "Mod", None, DownloadKind::Mod);
        queue.set_status(item.id, DownloadStatus::Downloading, "Preparing...");

        assert_eq!(queue.mark_waiting_network(item.id, "offline"), 1);
        assert_eq!(queue.next_queued(), None);
        assert!(queue.requeue_after_wait(item.id));
        assert_eq!(queue.next_queued(), Some(item.id));

        queue.mark_waiting_network(item.id, "offline");
        queue.pause(item.id);
        assert!(!queue.requeue_after_wait(item.id));
        assert_eq!(queue.item(item.id).unwrap().status, DownloadStatus::Paused);
    }

    #[test]
    fn pause_all_and_resume_all_move_queued_items() {
        let (_dir, queue) = temp_queue();
        let first = queue.enqueue("A-Mod", "Mod", None, DownloadKind::Mod);
        let second = queue.enqueue("B-Mod", "Mod", None, DownloadKind::Mod);

        assert!(queue.pause_all());
        assert!(queue.is_paused());
        assert_eq!(queue.next_queued(), None);
        assert_eq!(queue.item(first.id).unwrap().status, DownloadStatus::Paused);
        assert_eq!(queue.item(second.id).unwrap().status, DownloadStatus::Paused);

        assert!(queue.resume_all());
        assert!(!queue.is_paused());
        assert_eq!(queue.next_queued(), Some(first.id));
    }

    #[test]
    fn deferring_for_the_game_touches_only_queued_items() {
        let (_dir, queue) = temp_queue();
        let first = queue.enqueue("A-Mod", "Mod", None, DownloadKind::Mod);
        let second = queue.enqueue("B-Mod", "Mod", None, DownloadKind::Mod);
        queue.pause(second.id);

        assert!(queue.defer_all_for_game());
        assert_eq!(
            queue.item(first.id).unwrap().status,
            DownloadStatus::WaitingForGame
        );
        assert_eq!(queue.item(second.id).unwrap().status, DownloadStatus::Paused);
        assert!(!queue.defer_all_for_game());
    }

    #[test]
    fn has_work_tracks_queued_and_game_waiting_items() {
        let (_dir, queue) = temp_queue();
        assert!(!queue.has_work());

        let item = queue.enqueue("A-Mod", "Mod", None, DownloadKind::Mod);
        assert!(queue.has_work());

        queue.defer_all_for_game();
        assert!(queue.has_work());

        queue.pause(item.id);
        assert!(!queue.has_work());
    }

    #[test]
    fn progress_updates_do_not_override_paused_items() {
        let (_dir, queue) = temp_queue();
        let item = queue.enqueue("Author-Mod", "Mod", None, DownloadKind::Mod);
        queue.pause(item.id);

        assert!(!queue.apply_progress(item.id, &progress("downloading")));
        let stored = queue.item(item.id).unwrap();
        assert_eq!(stored.status, DownloadStatus::Paused);
        assert_eq!(stored.bytes_downloaded, 0);
    }

    #[test]
    fn history_is_trimmed_to_the_cap() {
        let (_dir, queue) = temp_queue();
        for index in 0..(MAX_HISTORY + 5) {
            let item = queue.enqueue(
                &format!("Author-Mod{}", index),
                "Mod",
                None,
                DownloadKind::Mod,
            );
            queue.complete(item.id, 1);
        }
        assert_eq!(queue.snapshot().items.len(), MAX_HISTORY);
    }

    #[test]
    fn interrupted_items_are_requeued_on_load() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("queue.json");
        {
            let queue = DownloadQueue::open(path.clone());
            let item = queue.enqueue("Author-Mod", "Mod", Some("1.2.3".into()), DownloadKind::Mod);
            queue.set_status(item.id, DownloadStatus::Downloading, "Preparing...");
            queue.persist();
        }

        let reloaded = DownloadQueue::open(path);
        let snapshot = reloaded.snapshot();
        assert_eq!(snapshot.items.len(), 1);
        assert_eq!(snapshot.items[0].status, DownloadStatus::Queued);
        assert_eq!(snapshot.items[0].version.as_deref(), Some("1.2.3"));
    }

    #[test]
    fn retry_clears_the_failure_and_requeues() {
        let (_dir, queue) = temp_queue();
        let item = queue.enqueue("Author-Mod", "Mod", None, DownloadKind::Mod);
        queue.fail(item.id, "network down");
        assert!(queue.retry(item.id));
        let stored = queue.item(item.id).unwrap();
        assert_eq!(stored.status, DownloadStatus::Queued);
        assert!(stored.error.is_none());
        assert_eq!(stored.retry_count, 0);
    }

    #[test]
    fn active_items_cannot_be_removed() {
        let (_dir, queue) = temp_queue();
        let item = queue.enqueue("Author-Mod", "Mod", None, DownloadKind::Mod);
        queue.set_status(item.id, DownloadStatus::Downloading, "Preparing...");
        assert!(!queue.remove(item.id));
        queue.cancel(item.id);
        assert!(queue.remove(item.id));
    }

    #[test]
    fn retry_delay_grows_and_caps() {
        assert_eq!(retry_delay(1), Duration::from_secs(5));
        assert_eq!(retry_delay(3), Duration::from_secs(20));
        assert_eq!(retry_delay(50), Duration::from_secs(60));
    }
}
