use std::sync::Mutex;

use tracing::info;

use crate::error::{AppError, AppResult};
use crate::models::Profile;
use crate::services::backup_manager::{self, BackupInfo};
use crate::AppState;

/// Create a backup of the specified profile (or active profile if none specified).
#[tauri::command]
pub async fn create_backup(
    profile_name: Option<String>,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<BackupInfo> {
    let _operation = crate::lock_operation(&state)?;
    crate::services::launcher::ensure_game_stopped()?;
    let name = {
        let state = state
            .lock()
            .map_err(|e| AppError::Profile(format!("Failed to lock state: {}", e)))?;
        profile_name.unwrap_or_else(|| state.active_profile.clone())
    };

    info!("Command: create_backup({})", name);
    let s = state.lock().map_err(|e| AppError::Profile(e.to_string()))?;
    if s.active_profile == name {
        if let Some(game) = &s.game_path {
            crate::services::profile_manager::save_game_state_to_profile(
                &name,
                &crate::services::game_detector::get_valheim_root(game),
            )?;
        }
    }
    backup_manager::create_backup(&name)
}

/// List all available backups.
#[tauri::command]
pub async fn list_backups(_state: tauri::State<'_, Mutex<AppState>>) -> AppResult<Vec<BackupInfo>> {
    backup_manager::list_backups()
}

/// Restore a backup, creating a new profile.
#[tauri::command]
pub async fn restore_backup(
    filename: String,
    _state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<Profile> {
    info!("Command: restore_backup({})", filename);
    backup_manager::restore_backup(&filename)
}
