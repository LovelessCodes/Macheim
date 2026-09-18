use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, State};
use tracing::info;

use crate::error::{AppError, AppResult};
use crate::services::download_queue::{
    self, DownloadItem, DownloadKind, DownloadQueue, DownloadQueueSnapshot, LocalArchiveMeta,
};
use crate::services::{mod_installer, package_sources, profile_manager};
use crate::AppState;

/// Current queue contents.
#[tauri::command]
pub async fn get_download_queue(
    queue: State<'_, Arc<DownloadQueue>>,
) -> AppResult<DownloadQueueSnapshot> {
    Ok(queue.snapshot())
}

/// Queue an install (or move an existing pending one to a new version).
#[tauri::command]
pub async fn enqueue_install(
    full_name: String,
    name: Option<String>,
    version: Option<String>,
    kind: Option<DownloadKind>,
    queue: State<'_, Arc<DownloadQueue>>,
    app: AppHandle,
) -> AppResult<DownloadItem> {
    info!("Command: enqueue_install({}, {:?})", full_name, version);
    profile_manager::validate_name(&full_name)?;

    let name = name.unwrap_or_else(|| full_name.clone());
    let item = queue.enqueue(
        &full_name,
        &name,
        version,
        kind.unwrap_or(DownloadKind::Mod),
    );
    broadcast(&app, &queue);
    Ok(item)
}

/// Queue an install from a local ZIP. Archives with a Thunderstore
/// `manifest.json` (or a Thunderstore-style file name) are attributed to
/// their store package when possible; otherwise they install as `Local-*`.
#[tauri::command]
pub async fn enqueue_local_install(
    path: String,
    state: State<'_, Mutex<AppState>>,
    queue: State<'_, Arc<DownloadQueue>>,
    app: AppHandle,
) -> AppResult<DownloadItem> {
    let path = PathBuf::from(path);
    info!("Command: enqueue_local_install({})", path.display());

    if !path.is_file() {
        return Err(AppError::Mod(format!("'{}' is not a file", path.display())));
    }
    if !path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("zip"))
    {
        return Err(AppError::Mod(format!(
            "'{}' is not a .zip archive",
            path.display()
        )));
    }

    let zip = std::fs::read(&path)
        .map_err(|e| AppError::Mod(format!("Could not read '{}': {}", path.display(), e)))?;

    // Attribution is best-effort: use whatever packages are already known
    // (in-memory list first, then fresh on-disk caches) so dropping an archive
    // never waits on the network.
    let known_packages = {
        let cached = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?
            .package_cache
            .clone();
        cached.unwrap_or_else(package_sources::cached_packages)
    };
    let info = mod_installer::describe_local_zip(&path, &zip, &known_packages)?;
    profile_manager::validate_name(&info.full_name)?;

    let item = queue.enqueue_with_source(
        &info.full_name,
        &info.name,
        info.version,
        DownloadKind::Mod,
        Some(path.to_string_lossy().to_string()),
        Some(LocalArchiveMeta {
            author: info.author,
            description: info.description,
            icon: info.icon,
            dependencies: info.dependencies,
        }),
    );
    broadcast(&app, &queue);
    Ok(item)
}

#[tauri::command]
pub async fn pause_download(
    id: u64,
    queue: State<'_, Arc<DownloadQueue>>,
    app: AppHandle,
) -> AppResult<DownloadQueueSnapshot> {
    if queue.pause(id) {
        broadcast(&app, &queue);
    }
    Ok(queue.snapshot())
}

#[tauri::command]
pub async fn resume_download(
    id: u64,
    queue: State<'_, Arc<DownloadQueue>>,
    app: AppHandle,
) -> AppResult<DownloadQueueSnapshot> {
    if queue.resume(id) {
        queue.wake();
        broadcast(&app, &queue);
    }
    Ok(queue.snapshot())
}

#[tauri::command]
pub async fn cancel_download(
    id: u64,
    queue: State<'_, Arc<DownloadQueue>>,
    app: AppHandle,
) -> AppResult<DownloadQueueSnapshot> {
    if queue.cancel(id) {
        broadcast(&app, &queue);
    }
    Ok(queue.snapshot())
}

#[tauri::command]
pub async fn retry_download(
    id: u64,
    queue: State<'_, Arc<DownloadQueue>>,
    app: AppHandle,
) -> AppResult<DownloadQueueSnapshot> {
    if queue.retry(id) {
        queue.wake();
        broadcast(&app, &queue);
    }
    Ok(queue.snapshot())
}

#[tauri::command]
pub async fn reinstall_download(
    id: u64,
    queue: State<'_, Arc<DownloadQueue>>,
    app: AppHandle,
) -> AppResult<DownloadQueueSnapshot> {
    if queue.reinstall(id) {
        queue.wake();
        broadcast(&app, &queue);
    }
    Ok(queue.snapshot())
}

#[tauri::command]
pub async fn remove_download(
    id: u64,
    queue: State<'_, Arc<DownloadQueue>>,
    app: AppHandle,
) -> AppResult<DownloadQueueSnapshot> {
    if queue.remove(id) {
        broadcast(&app, &queue);
    }
    Ok(queue.snapshot())
}

#[tauri::command]
pub async fn pause_all_downloads(
    queue: State<'_, Arc<DownloadQueue>>,
    app: AppHandle,
) -> AppResult<DownloadQueueSnapshot> {
    if queue.pause_all() {
        broadcast(&app, &queue);
    }
    Ok(queue.snapshot())
}

#[tauri::command]
pub async fn resume_all_downloads(
    queue: State<'_, Arc<DownloadQueue>>,
    app: AppHandle,
) -> AppResult<DownloadQueueSnapshot> {
    if queue.resume_all() {
        queue.wake();
        broadcast(&app, &queue);
    }
    Ok(queue.snapshot())
}

#[tauri::command]
pub async fn cancel_all_downloads(
    queue: State<'_, Arc<DownloadQueue>>,
    app: AppHandle,
) -> AppResult<DownloadQueueSnapshot> {
    if !queue.cancel_all().is_empty() {
        broadcast(&app, &queue);
    }
    Ok(queue.snapshot())
}

#[tauri::command]
pub async fn clear_finished_downloads(
    queue: State<'_, Arc<DownloadQueue>>,
    app: AppHandle,
) -> AppResult<DownloadQueueSnapshot> {
    if queue.clear_finished() {
        broadcast(&app, &queue);
    }
    Ok(queue.snapshot())
}

fn broadcast(app: &AppHandle, queue: &DownloadQueue) {
    download_queue::emit_snapshot(app, queue);
    queue.persist();
}
