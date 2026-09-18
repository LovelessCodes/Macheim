use std::sync::Mutex;

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::services::conflict_detector::{self, ConflictReport};
use crate::services::{game_detector, package_sources, profile_manager};
use crate::AppState;

/// Potential conflicts in the active profile: duplicate plugin files,
/// conflicting dependency versions and installed-version mismatches.
#[tauri::command]
pub async fn detect_mod_conflicts(state: State<'_, Mutex<AppState>>) -> AppResult<ConflictReport> {
    let (game_path, active_profile, cached_packages) = {
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
            state.package_cache.clone(),
        )
    };

    let game_root = game_detector::get_valheim_root(&game_path);
    let profile = profile_manager::load_profile(&active_profile)?;

    // Dependency checks need package metadata. If the cache is cold (the
    // Installed page may mount before the package list finishes loading), try
    // a fetch once; offline falls back to whatever is on disk.
    let packages = match cached_packages {
        Some(packages) => packages,
        None => match package_sources::fetch_all_packages(false).await {
            Ok(packages) => {
                let mut state = state
                    .lock()
                    .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
                if state.package_cache.is_none() {
                    state.package_cache = Some(packages.clone());
                    state.cache_updated_at = Some(chrono::Utc::now());
                }
                packages
            }
            Err(_) => package_sources::cached_packages(),
        },
    };

    Ok(conflict_detector::detect_conflicts(
        &game_root,
        &profile.mods,
        &packages,
    ))
}
