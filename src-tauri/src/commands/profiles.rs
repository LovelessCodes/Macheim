use std::sync::Mutex;

use tracing::info;

use crate::error::{AppError, AppResult};
use crate::models::Profile;
use crate::services::{game_detector, package_sources, profile_manager, profile_transfer};
use crate::AppState;

/// List all profiles.
#[tauri::command]
pub async fn list_profiles(_state: tauri::State<'_, Mutex<AppState>>) -> AppResult<Vec<Profile>> {
    let profiles = profile_manager::list_profiles()?;
    Ok(profiles)
}

/// Create a new profile.
#[tauri::command]
pub async fn create_profile(
    name: String,
    description: Option<String>,
    _state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<Profile> {
    info!("Command: create_profile({})", name);

    let desc = description.unwrap_or_default();
    let profile = profile_manager::create_profile(&name, &desc)?;
    Ok(profile)
}

/// Switch to a different profile.
#[tauri::command]
pub async fn switch_profile(
    name: String,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<Profile> {
    info!("Command: switch_profile({})", name);
    let _operation = crate::lock_operation(&state)?;
    crate::services::launcher::ensure_game_stopped()?;
    profile_manager::load_profile(&name)?;
    let current_profile = state
        .lock()
        .map_err(|e| AppError::Profile(e.to_string()))?
        .active_profile
        .clone();
    if current_profile == name {
        return profile_manager::load_profile(&name);
    }

    let game_path = {
        let state = state
            .lock()
            .map_err(|e| AppError::Profile(format!("Failed to lock state: {}", e)))?;
        state.game_path.clone()
    };

    if let Some(game_path) = &game_path {
        let game_root = game_detector::get_valheim_root(game_path);

        // Save current profile state first
        {
            let state = state
                .lock()
                .map_err(|e| AppError::Profile(format!("Failed to lock state: {}", e)))?;
            let current_profile = state.active_profile.clone();
            profile_manager::save_game_state_to_profile(&current_profile, &game_root)?;
        }

        // Switch to new profile
        profile_manager::switch_profile(&name, &game_root)?;
        let result = (|| {
            crate::services::compatibility::reconcile(
                &profile_manager::load_profile(&name)?,
                &game_root,
            )?;
            profile_manager::set_active_profile(&name, &game_root)
        })();
        if let Err(error) = result {
            profile_manager::switch_profile(&current_profile, &game_root)?;
            profile_manager::set_active_profile(&current_profile, &game_root)?;
            return Err(error);
        }
    }

    let profile = profile_manager::load_profile(&name)?;

    // Update state
    let mut state = state
        .lock()
        .map_err(|e| AppError::Profile(format!("Failed to lock state: {}", e)))?;
    state.active_profile = name;

    Ok(profile)
}

/// Delete a profile. The archive stays in the deleted-profiles folder, so the
/// frontend can offer undo or restore it later.
#[tauri::command]
pub async fn delete_profile(
    name: String,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<profile_manager::DeletedProfile> {
    info!("Command: delete_profile({})", name);

    {
        let state = state
            .lock()
            .map_err(|e| AppError::Profile(format!("Failed to lock state: {}", e)))?;
        if state.active_profile == name {
            return Err(AppError::Profile(
                "Cannot delete the currently active profile. Switch to another profile first."
                    .to_string(),
            ));
        }
    }

    profile_manager::delete_profile(&name)
}

/// Archived profiles that can be restored or purged.
#[tauri::command]
pub async fn list_deleted_profiles(
    _state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<Vec<profile_manager::DeletedProfile>> {
    profile_manager::list_deleted_profiles()
}

/// Move an archived profile back into the profile list, optionally renamed.
#[tauri::command]
pub async fn restore_deleted_profile(
    archive_name: String,
    new_name: Option<String>,
    _state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<Profile> {
    info!("Command: restore_deleted_profile({})", archive_name);
    profile_manager::restore_deleted_profile(&archive_name, new_name.as_deref())
}

/// Permanently remove an archived profile. Not recoverable.
#[tauri::command]
pub async fn purge_deleted_profile(
    archive_name: String,
    _state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<()> {
    info!("Command: purge_deleted_profile({})", archive_name);
    profile_manager::purge_deleted_profile(&archive_name)
}

/// Permanently remove every archived profile. Returns how many were purged.
#[tauri::command]
pub async fn purge_deleted_profiles(_state: tauri::State<'_, Mutex<AppState>>) -> AppResult<usize> {
    info!("Command: purge_deleted_profiles");
    profile_manager::purge_deleted_profiles()
}

/// Clone a profile.
#[tauri::command]
pub async fn clone_profile(
    source_name: String,
    new_name: String,
    _state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<Profile> {
    info!("Command: clone_profile({} -> {})", source_name, new_name);
    let profile = profile_manager::clone_profile(&source_name, &new_name)?;
    Ok(profile)
}

/// Export a profile to JSON string (for saving to a file via the frontend).
#[tauri::command]
pub async fn export_profile(
    name: String,
    _state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<String> {
    info!("Command: export_profile({})", name);
    let json = profile_manager::export_profile(&name)?;
    Ok(json)
}

/// Import a profile from a JSON string.
#[tauri::command]
pub async fn import_profile(
    json: String,
    new_name: Option<String>,
    _state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<Profile> {
    info!("Command: import_profile");
    let profile = profile_manager::import_profile(&json, new_name.as_deref())?;
    Ok(profile)
}

/// Export a profile as an r2modman-compatible `.r2z` file that Macheim,
/// r2modman, Gale and Thunderstore Mod Manager can all import.
#[tauri::command]
pub async fn export_profile_file(
    name: String,
    path: String,
    _state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<()> {
    info!("Command: export_profile_file({})", name);
    let profile = profile_manager::load_profile(&name)?;
    let bytes =
        profile_transfer::build_share_payload(&profile, &profile_manager::get_profile_dir(&name))?;
    crate::services::compatibility::atomic_write(std::path::Path::new(&path), &bytes)?;
    Ok(())
}

/// Share a profile as a short-lived Thunderstore profile code. Codes expire
/// after about an hour; file exports are the durable option.
#[tauri::command]
pub async fn export_profile_code(
    name: String,
    _state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<String> {
    info!("Command: export_profile_code({})", name);
    let profile = profile_manager::load_profile(&name)?;
    profile_transfer::create_profile_code(&profile, &profile_manager::get_profile_dir(&name)).await
}

/// Import a shared profile from an `.r2z` file or a Macheim profile JSON.
#[tauri::command]
pub async fn import_profile_file(
    path: String,
    new_name: Option<String>,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<Profile> {
    info!("Command: import_profile_file({})", path);
    let bytes = std::fs::read(&path)
        .map_err(|e| AppError::Profile(format!("Could not read '{}': {}", path, e)))?;

    if profile_transfer::looks_like_share_payload(&bytes) {
        let parsed = profile_transfer::parse_share_payload(&bytes)?;
        return create_imported_profile(
            parsed,
            new_name,
            &state,
            "Imported from a shared profile file",
        );
    }

    let json = String::from_utf8(bytes).map_err(|_| {
        AppError::Profile(
            "This file is not a Macheim or r2modman profile. Use an .r2z export or a Macheim JSON export."
                .into(),
        )
    })?;
    profile_manager::import_profile(&json, new_name.as_deref())
}

/// Import a shared profile by its Thunderstore profile code. Codes are
/// short-lived; file exports are the durable way to share a profile.
#[tauri::command]
pub async fn import_profile_code(
    code: String,
    new_name: Option<String>,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<Profile> {
    info!("Command: import_profile_code");
    let bytes = profile_transfer::fetch_profile_code(&code).await?;
    let parsed = profile_transfer::parse_share_payload(&bytes)?;
    create_imported_profile(
        parsed,
        new_name,
        &state,
        "Imported from a Thunderstore profile code",
    )
}

fn create_imported_profile(
    parsed: profile_transfer::ParsedProfile,
    new_name: Option<String>,
    state: &tauri::State<'_, Mutex<AppState>>,
    description: &str,
) -> AppResult<Profile> {
    let name = match new_name
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
    {
        Some(name) => name,
        None if profile_manager::validate_name(&parsed.name).is_ok() => parsed.name.clone(),
        None => format!("Imported-{}", chrono::Utc::now().format("%Y%m%d-%H%M%S")),
    };
    profile_manager::validate_name(&name)?;

    let packages = state
        .lock()
        .ok()
        .and_then(|state| state.package_cache.clone())
        .unwrap_or_else(package_sources::cached_packages_any_age);

    let mut profile = profile_manager::create_profile(&name, description)?;
    let result = (|| -> AppResult<()> {
        let config_root = profile_manager::get_profile_dir(&name).join("BepInEx/config");
        for (relative, bytes) in &parsed.configs {
            crate::services::compatibility::atomic_write(&config_root.join(relative), bytes)?;
        }
        profile.mods = parsed
            .mods
            .iter()
            .map(|m| profile_transfer::to_installed_mod(m, &packages))
            .collect();
        profile.touch();
        profile_manager::save_profile(&profile)
    })();
    if let Err(error) = result {
        let _ = std::fs::remove_dir_all(profile_manager::get_profile_dir(&name));
        return Err(error);
    }
    Ok(profile)
}

/// Get the currently active profile name.
#[tauri::command]
pub async fn get_active_profile(state: tauri::State<'_, Mutex<AppState>>) -> AppResult<String> {
    let state = state
        .lock()
        .map_err(|e| AppError::Profile(format!("Failed to lock state: {}", e)))?;
    Ok(state.active_profile.clone())
}
