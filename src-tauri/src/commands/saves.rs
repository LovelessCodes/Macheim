use std::sync::Mutex;

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::services::save_manager::{self, SaveOverview};
use crate::AppState;

/// Worlds, characters and stored snapshots for the Valheim save folder.
#[tauri::command]
pub async fn get_save_overview() -> AppResult<SaveOverview> {
    save_manager::overview(save_manager::find_save_dir().as_deref())
}

/// Snapshot the current worlds and characters.
#[tauri::command]
pub async fn create_save_snapshot(
    label: Option<String>,
    state: State<'_, Mutex<AppState>>,
) -> AppResult<SaveOverview> {
    let label = label
        .filter(|label| !label.trim().is_empty())
        .unwrap_or_else(|| "Manual snapshot".to_string());
    tracing::info!("Command: create_save_snapshot({})", label);

    let _operation = crate::lock_operation(&state)?;
    crate::services::launcher::ensure_game_stopped()?;

    let save_dir = save_manager::find_save_dir()
        .ok_or_else(|| AppError::Mod("Valheim save folder not found".into()))?;
    save_manager::create_snapshot(&save_dir, &save_manager::snapshots_dir(), &label, false)?;
    save_manager::overview(Some(&save_dir))
}

/// Replace the live saves with a snapshot (a safety snapshot is taken first).
#[tauri::command]
pub async fn restore_save_snapshot(
    id: String,
    state: State<'_, Mutex<AppState>>,
) -> AppResult<SaveOverview> {
    tracing::info!("Command: restore_save_snapshot({})", id);

    let _operation = crate::lock_operation(&state)?;
    crate::services::launcher::ensure_game_stopped()?;

    let save_dir = save_manager::find_save_dir()
        .ok_or_else(|| AppError::Mod("Valheim save folder not found".into()))?;
    save_manager::restore_snapshot(&save_dir, &save_manager::snapshots_dir(), &id)?;
    save_manager::overview(Some(&save_dir))
}

/// Remove a stored snapshot.
#[tauri::command]
pub async fn delete_save_snapshot(id: String) -> AppResult<SaveOverview> {
    tracing::info!("Command: delete_save_snapshot({})", id);
    save_manager::delete_snapshot(&save_manager::snapshots_dir(), &id)?;
    save_manager::overview(save_manager::find_save_dir().as_deref())
}
