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

    let settings = {
        let mut state = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
        state.settings.console_enabled = enabled;
        state.settings.clone()
    };

    app_settings::save(&settings)?;
    Ok(settings)
}
