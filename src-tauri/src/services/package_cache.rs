use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{de::DeserializeOwned, Serialize};
use tracing::{debug, info};

use crate::error::{AppError, AppResult};
use crate::services::thunderstore_client::get_app_data_dir;

const CACHE_MAX_AGE_MINUTES: i64 = 30;
const USER_AGENT: &str = "Macheim/1.0.1";

/// Get the cache directory for a package source (e.g. "thunderstore", "hexium").
pub fn cache_dir(source: &str) -> PathBuf {
    get_app_data_dir().join("cache").join(source)
}

fn cache_file(dir: &Path) -> PathBuf {
    dir.join("packages.json")
}

/// Check if the cache is still valid (less than 30 minutes old).
fn is_cache_valid(dir: &Path) -> bool {
    let path = cache_file(dir);
    if !path.exists() {
        return false;
    }

    match std::fs::metadata(&path) {
        Ok(meta) => {
            if let Ok(modified) = meta.modified() {
                let modified_dt: DateTime<Utc> = modified.into();
                let age = Utc::now() - modified_dt;
                age.num_minutes() < CACHE_MAX_AGE_MINUTES
            } else {
                false
            }
        }
        Err(_) => false,
    }
}

fn load_cache<T: DeserializeOwned>(dir: &Path) -> AppResult<Vec<T>> {
    let content = std::fs::read_to_string(cache_file(dir))?;
    let packages: Vec<T> = serde_json::from_str(&content)?;
    debug!("Loaded {} packages from cache", packages.len());
    Ok(packages)
}

fn save_cache<T: Serialize>(dir: &Path, packages: &[T]) -> AppResult<()> {
    std::fs::create_dir_all(dir)?;
    let content = serde_json::to_string(packages)?;
    std::fs::write(cache_file(dir), content)?;
    debug!("Saved {} packages to cache", packages.len());
    Ok(())
}

/// Load a package list from disk without touching the network. Returns None
/// when the cache is missing, stale or unreadable.
pub fn load_fresh_cache<T: DeserializeOwned>(dir: &Path) -> Option<Vec<T>> {
    if !is_cache_valid(dir) {
        return None;
    }
    load_cache(dir).ok()
}

/// Fetch a package list from a Thunderstore-compatible API, using the disk
/// cache when it is fresh (< 30 minutes).
pub async fn fetch_cached_packages<T: DeserializeOwned + Serialize>(
    url: &str,
    dir: &Path,
    force_refresh: bool,
) -> AppResult<Vec<T>> {
    if !force_refresh && is_cache_valid(dir) {
        info!("Using cached package data from {}", url);
        match load_cache(dir) {
            Ok(packages) => return Ok(packages),
            Err(e) => {
                debug!("Cache load failed, fetching fresh: {}", e);
            }
        }
    }

    info!("Fetching packages from {}...", url);
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::Network(format!("Failed to create HTTP client: {}", e)))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::NetworkTransient(format!("Failed to fetch packages: {}", e)))?;

    if !response.status().is_success() {
        return Err(AppError::Network(format!(
            "Package API returned status: {}",
            response.status()
        )));
    }

    let packages: Vec<T> = response
        .json()
        .await
        .map_err(|e| AppError::Network(format!("Failed to parse response: {}", e)))?;

    info!("Fetched {} packages from {}", packages.len(), url);

    if let Err(e) = save_cache(dir, &packages) {
        debug!("Failed to save cache: {}", e);
    }

    Ok(packages)
}
