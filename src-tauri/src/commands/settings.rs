use std::sync::Mutex;

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::services::app_settings::{self, AppSettings};
use crate::AppState;

/// Current app preferences.
#[tauri::command]
pub async fn get_app_settings(state: State<'_, Mutex<AppState>>) -> AppResult<AppSettings> {
    let settings = state
        .lock()
        .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?
        .settings
        .clone();
    Ok(settings)
}

/// Toggle Valheim's `-console` flag for modded launches.
#[tauri::command]
pub async fn set_console_enabled(
    enabled: bool,
    state: State<'_, Mutex<AppState>>,
) -> AppResult<AppSettings> {
    tracing::info!("Command: set_console_enabled({})", enabled);
    update_settings(state, |settings| settings.console_enabled = enabled)
}

/// Toggle automatic world/character snapshots before modded launches.
#[tauri::command]
pub async fn set_snapshot_saves(
    enabled: bool,
    state: State<'_, Mutex<AppState>>,
) -> AppResult<AppSettings> {
    tracing::info!("Command: set_snapshot_saves({})", enabled);
    update_settings(state, |settings| settings.snapshot_saves = enabled)
}

fn update_settings(
    state: State<'_, Mutex<AppState>>,
    update: impl FnOnce(&mut AppSettings),
) -> AppResult<AppSettings> {
    let settings = {
        let mut state = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
        update(&mut state.settings);
        state.settings.clone()
    };

    app_settings::save(&settings)?;
    Ok(settings)
}
