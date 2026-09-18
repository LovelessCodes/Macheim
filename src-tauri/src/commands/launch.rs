use std::sync::Mutex;

use tracing::info;

use crate::error::{AppError, AppResult};
use crate::services::{game_detector, launcher};
use crate::AppState;

/// Launch Valheim with BepInEx (modded).
#[tauri::command]
pub async fn launch_modded(state: tauri::State<'_, Mutex<AppState>>) -> AppResult<()> {
    info!("Command: launch_modded");
    // Wait for an in-flight queued install step instead of failing; downloads
    // themselves do not hold the lock, so this stays responsive.
    let _operation = crate::lock_operation_wait(&state).await?;
    launcher::ensure_game_stopped()?;

    let (game_path, console_enabled) = {
        let state = state
            .lock()
            .map_err(|e| AppError::GameNotFound(format!("Failed to lock state: {}", e)))?;
        let game_path = state
            .game_path
            .clone()
            .ok_or_else(|| AppError::GameNotFound("Game path not set".to_string()))?;
        (game_path, state.settings.console_enabled)
    };

    let game_root = game_detector::get_valheim_root(&game_path);
    let name = state
        .lock()
        .map_err(|e| AppError::Profile(e.to_string()))?
        .active_profile
        .clone();
    let profile = crate::services::profile_manager::load_profile(&name)?;
    crate::services::compatibility::reconcile(&profile, &game_root)?;
    launcher::launch_modded(&game_path, &game_root, console_enabled)
}

/// Launch Valheim vanilla (via Steam, no mods).
#[tauri::command]
pub async fn launch_vanilla(_state: tauri::State<'_, Mutex<AppState>>) -> AppResult<()> {
    info!("Command: launch_vanilla");
    launcher::launch_vanilla()
}
