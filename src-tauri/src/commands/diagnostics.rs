use std::sync::Mutex;

use tauri::{AppHandle, State};
use tracing::info;

use crate::error::{AppError, AppResult};
use crate::services::crash_analyzer::{self, CrashReport};
use crate::services::safe_mode::{self, SafeModeState};
use crate::services::{
    compatibility, game_detector, launch_monitor, launcher, mod_installer, profile_manager,
    save_manager,
};
use crate::AppState;

/// Most recent crash report collected by the launch watcher.
#[tauri::command]
pub async fn get_last_crash_report(
    state: State<'_, Mutex<AppState>>,
) -> AppResult<Option<CrashReport>> {
    let report = state
        .lock()
        .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?
        .last_crash
        .clone();
    Ok(report)
}

/// Analyze the current Valheim log on demand. Works without a watched crash,
/// which makes the heuristics testable at any time.
#[tauri::command]
pub async fn analyze_crash_logs(state: State<'_, Mutex<AppState>>) -> AppResult<CrashReport> {
    info!("Command: analyze_crash_logs");

    let (game_root, active_profile) = {
        let state = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
        let game_path = state
            .game_path
            .clone()
            .ok_or_else(|| AppError::Mod("Game path not set".to_string()))?;
        (
            game_detector::get_valheim_root(&game_path),
            state.active_profile.clone(),
        )
    };

    let mods = profile_manager::load_profile(&active_profile)?.mods;
    let report = crash_analyzer::analyze(&game_root, &mods, true);

    let mut state = state
        .lock()
        .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
    state.last_crash = Some(report.clone());

    Ok(report)
}

/// Disable every enabled mod and launch, so the next run proves whether the
/// mods are involved at all. Returns the mods that were disabled.
#[tauri::command]
pub async fn launch_safe_mode(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> AppResult<Vec<String>> {
    info!("Command: launch_safe_mode");
    let _operation = crate::lock_operation(&state)?;
    launcher::ensure_game_stopped()?;

    let (game_path, active_profile, console_enabled, snapshot_saves) = {
        let state = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
        let game_path = state
            .game_path
            .clone()
            .ok_or_else(|| AppError::Mod("Game path not set".to_string()))?;
        (
            game_path,
            state.active_profile.clone(),
            state.settings.console_enabled,
            state.settings.snapshot_saves,
        )
    };

    let game_root = game_detector::get_valheim_root(&game_path);
    let profile = profile_manager::load_profile(&active_profile)?;

    let mut disabled = Vec::new();
    for module in profile.mods.iter().filter(|module| module.enabled) {
        if let Ok(false) = mod_installer::toggle_mod(&module.full_name, false, &game_root) {
            profile_manager::update_mod_enabled(&active_profile, &module.full_name, false)?;
            disabled.push(module.full_name.clone());
        }
    }

    safe_mode::save(&SafeModeState {
        disabled: disabled.clone(),
    })?;
    compatibility::reconcile(&profile_manager::load_profile(&active_profile)?, &game_root)?;

    if snapshot_saves {
        save_manager::snapshot_before_launch();
    }

    launcher::launch_modded(&game_path, &game_root, console_enabled)?;
    launch_monitor::watch_launch(app, true);

    info!("Safe mode launched with {} mod(s) disabled", disabled.len());
    Ok(disabled)
}

/// Re-enable the mods safe mode disabled.
#[tauri::command]
pub async fn restore_safe_mode_mods(state: State<'_, Mutex<AppState>>) -> AppResult<Vec<String>> {
    info!("Command: restore_safe_mode_mods");
    let _operation = crate::lock_operation(&state)?;
    launcher::ensure_game_stopped()?;

    let (game_path, active_profile) = {
        let state = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
        let game_path = state
            .game_path
            .clone()
            .ok_or_else(|| AppError::Mod("Game path not set".to_string()))?;
        (game_path, state.active_profile.clone())
    };

    let game_root = game_detector::get_valheim_root(&game_path);
    let saved = safe_mode::load();
    let profile = profile_manager::load_profile(&active_profile)?;

    let mut restored = Vec::new();
    for full_name in &saved.disabled {
        if !profile
            .mods
            .iter()
            .any(|module| &module.full_name == full_name)
        {
            continue;
        }
        if let Ok(true) = mod_installer::toggle_mod(full_name, true, &game_root) {
            profile_manager::update_mod_enabled(&active_profile, full_name, true)?;
            restored.push(full_name.clone());
        }
    }

    safe_mode::clear()?;
    compatibility::reconcile(&profile_manager::load_profile(&active_profile)?, &game_root)?;

    info!("Restored {} mod(s) from safe mode", restored.len());
    Ok(restored)
}

/// Mods currently disabled by safe mode (empty when it is not active).
#[tauri::command]
pub async fn get_safe_mode() -> AppResult<Vec<String>> {
    Ok(safe_mode::load().disabled)
}
