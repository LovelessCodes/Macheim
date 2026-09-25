use std::sync::Mutex;

use tracing::info;

use crate::error::{AppError, AppResult};
use crate::services::{package_sources, profile_manager, subscription};
use crate::AppState;

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

    let packages = {
        let cached = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?
            .package_cache
            .clone();
        cached.unwrap_or_else(package_sources::cached_packages_any_age)
    };
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
