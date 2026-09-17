use std::sync::Arc;

use tauri::{AppHandle, State};
use tracing::info;

use crate::error::AppResult;
use crate::services::download_queue::{
    self, DownloadItem, DownloadKind, DownloadQueue, DownloadQueueSnapshot,
};
use crate::services::profile_manager;

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
    let item = queue.enqueue(&full_name, &name, version, kind.unwrap_or(DownloadKind::Mod));
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
