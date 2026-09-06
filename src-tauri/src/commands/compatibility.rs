use crate::{
    error::{AppError, AppResult},
    services::{
        compatibility::{self, CompatibilitySettings, CompatibilityStatus},
        game_detector, profile_manager,
    },
    AppState,
};
use std::sync::Mutex;

#[tauri::command]
pub async fn get_compatibility(
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<CompatibilityStatus> {
    let state = state.lock().map_err(|e| AppError::Mod(e.to_string()))?;
    let game = state
        .game_path
        .as_ref()
        .ok_or_else(|| AppError::Mod("Game not set".into()))?;
    compatibility::status(
        &profile_manager::load_profile(&state.active_profile)?,
        &game_detector::get_valheim_root(game),
    )
}

#[tauri::command]
pub async fn apply_compatibility(
    profile_name: String,
    settings: CompatibilitySettings,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<CompatibilityStatus> {
    let _operation = crate::lock_operation(&state)?;
    compatibility::validate_settings(&settings)?;
    let state = state.lock().map_err(|e| AppError::Mod(e.to_string()))?;
    if state.active_profile != profile_name {
        return Err(AppError::Profile(
            "Profile changed. Refresh and try again.".into(),
        ));
    }
    let game = state
        .game_path
        .as_ref()
        .ok_or_else(|| AppError::Mod("Game not set".into()))?;
    let root = game_detector::get_valheim_root(game);
    let mut profile = profile_manager::load_profile(&profile_name)?;
    let previous = profile.clone();
    profile.compatibility = settings;
    compatibility::reconcile(&profile, &root)?;
    profile.touch();
    if let Err(e) = profile_manager::save_profile(&profile) {
        let _ = compatibility::reconcile(&previous, &root);
        return Err(e);
    }
    compatibility::status(&profile, &root)
}
