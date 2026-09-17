use std::sync::Mutex;

use tracing::info;

use crate::error::{AppError, AppResult};
use crate::models::thunderstore::{PackageListing, ThunderstorePackage};
use crate::services::{package_sources, thunderstore_client};
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
