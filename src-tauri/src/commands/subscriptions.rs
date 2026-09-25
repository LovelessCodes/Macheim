use std::sync::Mutex;

use tracing::info;

use crate::error::{AppError, AppResult};
use crate::services::{
    bepinex_installer, game_detector, package_sources, profile_manager, subscription,
};
use crate::AppState;

/// Packages from the in-memory cache, falling back to the on-disk caches.
fn known_packages(
    state: &tauri::State<'_, Mutex<AppState>>,
) -> AppResult<Vec<crate::models::ThunderstorePackage>> {
    let cached = state
        .lock()
        .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?
        .package_cache
        .clone();
    Ok(cached.unwrap_or_else(package_sources::cached_packages_any_age))
}

/// Installed BepInEx version, when the game and loader can be located.
fn installed_bepinex_version(state: &tauri::State<'_, Mutex<AppState>>) -> Option<String> {
    let game_path = state.lock().ok()?.game_path.clone()?;
    let game_root = game_detector::get_valheim_root(&game_path);
    bepinex_installer::installed_version(&game_root)
}

/// Every profile linked to a published modpack.
#[tauri::command]
pub async fn list_subscriptions() -> AppResult<Vec<subscription::ProfileSubscription>> {
    subscription::list()
}

/// Link a profile to a Thunderstore modpack at its latest version.
#[tauri::command]
pub async fn subscribe_profile(
    profile: String,
    modpack: String,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<subscription::Subscription> {
    info!("Command: subscribe_profile({}, {})", profile, modpack);
    profile_manager::load_profile(&profile)?;
    if subscription::load_for(&profile)?.is_some() {
        return Err(AppError::Profile(format!(
            "\"{}\" already follows a modpack. Unlink it first.",
            profile
        )));
    }

    let packages = known_packages(&state)?;
    let (_, version) = subscription::latest_thunderstore_version(&packages, &modpack).ok_or_else(
        || {
            AppError::Mod(format!(
                "\"{}\" is not a Thunderstore modpack in the local catalog. Refresh the modpack list and try again.",
                modpack
            ))
        },
    )?;

    let subscription = subscription::build(&modpack, version);
    subscription::save_for(&profile, &subscription)?;
    Ok(subscription)
}

/// Remove a profile's modpack link. Mods are untouched.
#[tauri::command]
pub async fn unsubscribe_profile(profile: String) -> AppResult<()> {
    info!("Command: unsubscribe_profile({})", profile);
    profile_manager::load_profile(&profile)?;
    subscription::clear_for(&profile)
}

/// Diff a subscribed profile against the pack's latest published version.
#[tauri::command]
pub async fn get_sync_plan(
    profile: String,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<subscription::SyncPlan> {
    info!("Command: get_sync_plan({})", profile);
    let loaded = profile_manager::load_profile(&profile)?;
    let current = subscription::load_for(&profile)?
        .ok_or_else(|| AppError::Profile(format!("\"{}\" does not follow a modpack.", profile)))?;

    let packages = known_packages(&state)?;
    let (_, latest) = subscription::latest_thunderstore_version(&packages, &current.modpack)
        .ok_or_else(|| {
            AppError::Mod(format!(
                "\"{}\" is not available on Thunderstore right now. Refresh the modpack list and try again.",
                current.modpack
            ))
        })?;

    let installed_bepinex = installed_bepinex_version(&state);
    Ok(subscription::plan_sync(
        &current,
        &loaded.mods,
        latest,
        installed_bepinex,
    ))
}

/// Record a completed sync: the pack version and its dependency set.
#[tauri::command]
pub async fn complete_subscription_sync(
    profile: String,
    version: String,
    mods: Vec<String>,
) -> AppResult<subscription::Subscription> {
    info!(
        "Command: complete_subscription_sync({}, {})",
        profile, version
    );
    profile_manager::load_profile(&profile)?;
    for full_name in &mods {
        profile_manager::validate_name(full_name)?;
    }

    let mut current = subscription::load_for(&profile)?
        .ok_or_else(|| AppError::Profile(format!("\"{}\" does not follow a modpack.", profile)))?;
    current.version = version;
    current.mods = mods;
    current.synced_at = chrono::Utc::now().to_rfc3339();
    subscription::save_for(&profile, &current)?;
    Ok(current)
}
