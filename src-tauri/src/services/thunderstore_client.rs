use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::Emitter;
use tracing::info;

use crate::error::{AppError, AppResult};
use crate::models::thunderstore::ThunderstorePackage;
use crate::services::package_cache;

const THUNDERSTORE_API_URL: &str = "https://thunderstore.io/c/valheim/api/v1/package/";

/// Thunderstore's primary CDN, blocked by some antivirus tools (e.g. Malwarebytes).
const PRIMARY_CDN_HOST: &str = "gcdn.thunderstore.io";
/// Thunderstore's backup CDN, used when the primary one is unreachable.
const FALLBACK_CDN_HOST: &str = "hcdn-1.hcdn.thunderstore.io";
const MAX_REDIRECTS: usize = 1;

/// Get the application data directory for cache and config storage.
pub fn get_app_data_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    home.join("Library/Application Support/com.macheim")
}

/// Fetch all Valheim packages from Thunderstore API.
/// Uses disk cache if available and fresh (< 30 minutes).
pub async fn fetch_packages(force_refresh: bool) -> AppResult<Vec<ThunderstorePackage>> {
    package_cache::fetch_cached_packages(
        THUNDERSTORE_API_URL,
        &package_cache::cache_dir("thunderstore"),
        force_refresh,
    )
    .await
}

/// Find a specific package by full name (e.g., "denikson-BepInExPack_Valheim").
pub fn find_package<'a>(
    packages: &'a [ThunderstorePackage],
    full_name: &str,
) -> Option<&'a ThunderstorePackage> {
    packages.iter().find(|p| p.full_name == full_name)
}

/// Download a mod's ZIP file and return the bytes. No timeout on download body.
pub async fn download_mod(download_url: &str) -> AppResult<Vec<u8>> {
    download_mod_with_progress(download_url, None, None).await
}

/// Progress callback type: (downloaded_bytes, total_bytes_option)
pub type ProgressFn = Box<dyn Fn(u64, Option<u64>) + Send>;

/// Returns true when the caller wants the download to stop (pause or cancel).
pub type AbortFn = Arc<dyn Fn() -> bool + Send + Sync>;

/// Payload for the one-time "we switched CDNs" notification.
#[derive(Clone, serde::Serialize)]
pub struct CdnFallbackEvent {
    pub from: String,
    pub to: String,
}

static CDN_FALLBACK_NOTIFIED: AtomicBool = AtomicBool::new(false);

/// Swap Thunderstore's primary CDN host for the backup CDN in place.
/// Returns true when a rewrite happened.
fn replace_primary_cdn(url: &mut reqwest::Url) -> bool {
    if url.host_str() == Some(PRIMARY_CDN_HOST) {
        return url.set_host(Some(FALLBACK_CDN_HOST)).is_ok();
    }
    false
}

/// Tell the user, once per session, that downloads use the backup CDN.
fn notify_cdn_fallback_once() {
    if CDN_FALLBACK_NOTIFIED.swap(true, Ordering::Relaxed) {
        return;
    }

    tracing::warn!(
        "{} is blocked; switched downloads to backup CDN {}",
        PRIMARY_CDN_HOST,
        FALLBACK_CDN_HOST
    );

    if let Some(app) = crate::APP_HANDLE.get() {
        let _ = app.emit(
            "cdn-fallback",
            CdnFallbackEvent {
                from: PRIMARY_CDN_HOST.to_string(),
                to: FALLBACK_CDN_HOST.to_string(),
            },
        );
    }
}

/// Download a mod's ZIP with optional progress callback. No body timeout.
///
/// Thunderstore redirects package downloads to `gcdn.thunderstore.io`, which
/// some antivirus tools block. Redirects are followed manually so the primary
/// CDN host can be swapped for Thunderstore's backup CDN before it is contacted.
///
/// `abort` is polled before the request and between stream chunks; when it
/// returns true the download stops with `AppError::Cancelled`.
pub async fn download_mod_with_progress(
    download_url: &str,
    progress: Option<ProgressFn>,
    abort: Option<AbortFn>,
) -> AppResult<Vec<u8>> {
    info!("Downloading mod from: {}", download_url);

    let aborted = || abort.as_ref().is_some_and(|check| check());

    let client = reqwest::Client::builder()
        .user_agent("Macheim/1.0.1")
        .connect_timeout(std::time::Duration::from_secs(30))
        // No overall timeout - large mods can be 200MB+
        // Redirects are resolved manually to rewrite the CDN host.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| AppError::Network(format!("Failed to create HTTP client: {}", e)))?;

    let mut url = reqwest::Url::parse(download_url)
        .map_err(|e| AppError::Network(format!("Invalid download URL: {}", e)))?;

    let mut redirects = 0;
    let response = loop {
        if aborted() {
            return Err(AppError::Cancelled);
        }

        if replace_primary_cdn(&mut url) {
            notify_cdn_fallback_once();
        }

        let response = client.get(url.clone()).send().await.map_err(|e| {
            AppError::NetworkTransient(format!("Download failed: {}", e))
        })?;

        if !matches!(response.status().as_u16(), 301 | 302 | 303 | 307 | 308) {
            break response;
        }

        if redirects >= MAX_REDIRECTS {
            return Err(AppError::Network(format!(
                "Too many redirects downloading from {}",
                download_url
            )));
        }
        redirects += 1;

        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| {
                AppError::Network(format!("Redirect from {} had no Location header", url))
            })?;

        url = url.join(location).map_err(|e| {
            AppError::Network(format!("Invalid redirect URL '{}': {}", location, e))
        })?;
    };

    if !response.status().is_success() {
        return Err(AppError::Network(format!(
            "Download returned status: {}",
            response.status()
        )));
    }

    let total_size = response.content_length();

    // Stream the response body
    let mut bytes = Vec::with_capacity(total_size.unwrap_or(1024 * 1024) as usize);
    let mut stream = response.bytes_stream();

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        if aborted() {
            return Err(AppError::Cancelled);
        }
        let chunk = chunk
            .map_err(|e| AppError::NetworkTransient(format!("Download stream error: {}", e)))?;
        bytes.extend_from_slice(&chunk);
        if let Some(ref cb) = progress {
            cb(bytes.len() as u64, total_size);
        }
    }

    info!("Downloaded {} bytes", bytes.len());
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn swaps_primary_cdn_host() {
        let mut url = reqwest::Url::parse(
            "https://gcdn.thunderstore.io/live/repository/packages/denikson-BepInExPack_Valheim-5.4.2350.zip",
        )
        .unwrap();

        assert!(replace_primary_cdn(&mut url));
        assert_eq!(
            url.as_str(),
            "https://hcdn-1.hcdn.thunderstore.io/live/repository/packages/denikson-BepInExPack_Valheim-5.4.2350.zip"
        );
    }

    #[test]
    fn leaves_other_hosts_untouched() {
        let mut url = reqwest::Url::parse(
            "https://thunderstore.io/package/download/denikson/BepInExPack_Valheim/5.4.2350/",
        )
        .unwrap();

        assert!(!replace_primary_cdn(&mut url));
        assert_eq!(url.host_str(), Some("thunderstore.io"));
    }
}
