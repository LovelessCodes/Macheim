use std::path::PathBuf;
use std::sync::Mutex;

use tracing::info;

use crate::error::{AppError, AppResult};
use crate::services::config_editor::{self, ConfigFile, ConfigFileSummary};
use crate::services::game_detector;
use crate::AppState;

/// Get list of all .cfg files in BepInEx/config.
#[tauri::command]
pub async fn get_config_files(
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<Vec<ConfigFileSummary>> {
    let game_path = {
        let state = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
        state
            .game_path
            .clone()
            .ok_or_else(|| AppError::Mod("Game path not set".to_string()))?
    };

    let game_root = game_detector::get_valheim_root(&game_path);
    config_editor::list_config_files(&game_root)
}

/// Parse and return a specific .cfg file's contents.
#[tauri::command]
pub async fn get_config(
    path: String,
    _state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<ConfigFile> {
    let config_path = PathBuf::from(&path);

    if !config_path.exists() {
        return Err(AppError::Mod(format!("Config file not found: {}", path)));
    }

    config_editor::parse_config_file(&config_path)
}

/// Save changes to a .cfg file.
#[tauri::command]
pub async fn save_config(
    config: ConfigFile,
    _state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<()> {
    info!("Command: save_config({})", config.filename);

    let config_path = PathBuf::from(&config.path);

    if !config_path.exists() {
        return Err(AppError::Mod(format!(
            "Config file not found: {}",
            config.path
        )));
    }

    config_editor::save_config_file(&config_path, &config)
}
