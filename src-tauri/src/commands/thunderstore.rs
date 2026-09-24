use std::path::Path;
use std::sync::Mutex;

use tauri::Emitter;
use tracing::info;

use crate::error::{AppError, AppResult};
use crate::models::thunderstore::{PackageListing, ThunderstorePackage};
use crate::services::modpack_export::{self, ModpackMetadata};
use crate::services::thunderstore_publish::{
    self, AuthStatus, Category, PublishOutcome, PublishProgress,
};
use crate::services::{package_sources, profile_manager, thunderstore_client};
use crate::AppState;

/// Fetch all packages from every supported store (uses cache if fresh).
#[tauri::command]
pub async fn fetch_packages(
    force_refresh: Option<bool>,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<Vec<PackageListing>> {
    info!(
        "Command: fetch_packages (force={})",
        force_refresh.unwrap_or(false)
    );

    let packages = package_sources::fetch_all_packages(force_refresh.unwrap_or(false)).await?;

    // Create listings for the frontend (lightweight)
    let listings: Vec<PackageListing> = packages.iter().map(PackageListing::from).collect();

    // Cache in state
    let mut state = state
        .lock()
        .map_err(|e| AppError::Network(format!("Failed to lock state: {}", e)))?;
    state.package_cache = Some(packages);
    state.cache_updated_at = Some(chrono::Utc::now());

    info!("Cached {} packages in state", listings.len());
    Ok(listings)
}

/// Get full details for a specific package by full_name.
#[tauri::command]
pub async fn get_package_details(
    full_name: String,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<ThunderstorePackage> {
    // The frontend can serve listings from its persisted query cache without
    // calling fetch_packages this session, so the in-memory cache may be unset.
    {
        let state = state
            .lock()
            .map_err(|e| AppError::Network(format!("Failed to lock state: {}", e)))?;

        if let Some(packages) = state.package_cache.as_ref() {
            return thunderstore_client::find_package(packages, &full_name)
                .cloned()
                .ok_or_else(|| AppError::Network(format!("Package '{}' not found", full_name)));
        }
    }

    // Fall back to the disk cache (any age) before the network: the listing the
    // user just clicked on came from that cache, so its details are almost
    // always there and load instantly even when the cache is cold.
    let disk_packages = package_sources::cached_packages_any_age();
    if let Some(found) = thunderstore_client::find_package(&disk_packages, &full_name).cloned() {
        let mut state = state
            .lock()
            .map_err(|e| AppError::Network(format!("Failed to lock state: {}", e)))?;
        if state.package_cache.is_none() {
            state.package_cache = Some(disk_packages);
            state.cache_updated_at = Some(chrono::Utc::now());
        }
        return Ok(found);
    }

    info!("Package cache not loaded, fetching packages first...");
    let packages = package_sources::fetch_all_packages(false).await?;
    let found = thunderstore_client::find_package(&packages, &full_name).cloned();

    let mut state = state
        .lock()
        .map_err(|e| AppError::Network(format!("Failed to lock state: {}", e)))?;
    state.package_cache = Some(packages);
    state.cache_updated_at = Some(chrono::Utc::now());

    found.ok_or_else(|| AppError::Network(format!("Package '{}' not found", full_name)))
}

// ── Publishing ──────────────────────────────────────────────────

/// The saved Thunderstore sign-in, validated against the API.
#[tauri::command]
pub async fn thunderstore_auth_status() -> AppResult<AuthStatus> {
    let Some(token) = thunderstore_publish::stored_token()? else {
        return Ok(signed_out());
    };

    match thunderstore_publish::probe_token(&token).await? {
        thunderstore_publish::TokenState::Valid(user) => Ok(AuthStatus {
            signed_in: true,
            username: user.username,
            teams: user.teams,
        }),
        // Only a 401 means the token itself is bad; drop it so the user is
        // asked to sign in again.
        thunderstore_publish::TokenState::Refused { status: 401, .. } => {
            tracing::warn!("Saved Thunderstore token was rejected (401); clearing it");
            thunderstore_publish::clear_token()?;
            Ok(signed_out())
        }
        // Anything else (403, edge blocks) keeps the token and says why.
        thunderstore_publish::TokenState::Refused { status, message } => {
            Err(AppError::Thunderstore(format!(
                "Thunderstore refused the saved token ({}): {}",
                status, message
            )))
        }
    }
}

fn signed_out() -> AuthStatus {
    AuthStatus {
        signed_in: false,
        username: None,
        teams: Vec::new(),
    }
}

/// Save a service-account token after Thunderstore accepts it.
#[tauri::command]
pub async fn thunderstore_sign_in(token: String) -> AppResult<AuthStatus> {
    info!("Command: thunderstore_sign_in");

    let token = token.trim().to_string();
    if token.is_empty() {
        return Err(AppError::Thunderstore(
            "Paste a service-account token first".to_string(),
        ));
    }

    match thunderstore_publish::probe_token(&token).await? {
        thunderstore_publish::TokenState::Valid(user) => {
            thunderstore_publish::store_token(&token)?;
            Ok(AuthStatus {
                signed_in: true,
                username: user.username,
                teams: user.teams,
            })
        }
        thunderstore_publish::TokenState::Refused { status: 401, .. } => Err(
            AppError::Thunderstore("Thunderstore rejected that token".to_string()),
        ),
        thunderstore_publish::TokenState::Refused { status, message } => {
            Err(AppError::Thunderstore(format!(
                "Thunderstore refused the token ({}): {}",
                status, message
            )))
        }
    }
}

/// Forget the saved token.
#[tauri::command]
pub async fn thunderstore_sign_out() -> AppResult<()> {
    info!("Command: thunderstore_sign_out");
    thunderstore_publish::clear_token()
}

/// The Valheim community's publish categories.
#[tauri::command]
pub async fn valheim_categories() -> AppResult<Vec<Category>> {
    thunderstore_publish::fetch_valheim_categories().await
}

/// Build the profile's modpack and publish it under `team`, emitting
/// `modpack-publish` progress events while it uploads.
#[tauri::command]
pub async fn publish_modpack(
    app: tauri::AppHandle,
    profile_name: String,
    metadata: ModpackMetadata,
    icon_path: Option<String>,
    team: String,
    categories: Vec<String>,
    has_nsfw_content: bool,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<PublishOutcome> {
    info!("Command: publish_modpack({})", profile_name);

    let team = team.trim().to_string();
    if team.is_empty() {
        return Err(AppError::Thunderstore(
            "Choose a team to publish under".to_string(),
        ));
    }

    let token = thunderstore_publish::stored_token()?
        .ok_or_else(|| AppError::Thunderstore("Sign in to Thunderstore first".to_string()))?;

    let profile = profile_manager::load_profile(&profile_name)?;
    let icon = match icon_path {
        Some(icon_path) => Some(modpack_export::read_icon(Path::new(&icon_path))?),
        None => None,
    };

    let game_path = {
        let state = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
        state.game_path.clone()
    };
    let bepinex_version = modpack_export::resolve_installed_bepinex(game_path.as_deref()).await;

    let (zip, _) = modpack_export::build_modpack(
        &profile,
        &metadata,
        icon.as_deref(),
        bepinex_version.as_deref(),
    )?;
    let filename = format!("{}-{}.zip", metadata.name.trim(), metadata.version.trim());

    let progress = move |event: PublishProgress| {
        let _ = app.emit("modpack-publish", &event);
    };

    thunderstore_publish::publish(
        &token,
        &zip,
        &filename,
        &team,
        &categories,
        has_nsfw_content,
        &progress,
    )
    .await
}
