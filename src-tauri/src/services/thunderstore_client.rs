use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Arc;

use tauri::Emitter;
use tracing::info;

use crate::error::{AppError, AppResult};
use crate::models::thunderstore::ThunderstorePackage;
use crate::services::app_settings::{self, CdnPreference};
use crate::services::package_cache;

const THUNDERSTORE_API_URL: &str = "https://thunderstore.io/c/valheim/api/v1/package/";

const THUNDERSTORE_HOST: &str = "thunderstore.io";
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

/// Host the auto preference resolved to this session (0 = unresolved).
static AUTO_CDN_CHOICE: AtomicU8 = AtomicU8::new(0);

fn cdn_choice_code(host: &str) -> u8 {
    if host == PRIMARY_CDN_HOST {
        1
    } else if host == FALLBACK_CDN_HOST {
        2
    } else {
        0
    }
}

/// Swap Thunderstore's primary CDN host for the backup CDN in place.
/// Returns true when a rewrite happened.
fn replace_primary_cdn(url: &mut reqwest::Url) -> bool {
    if url.host_str() == Some(PRIMARY_CDN_HOST) {
        return url.set_host(Some(FALLBACK_CDN_HOST)).is_ok();
    }
    false
}

/// Swap either known Thunderstore CDN host for the other one in place.
/// Returns true when a rewrite happened.
fn swap_cdn_host(url: &mut reqwest::Url) -> bool {
    let other = match url.host_str() {
        Some(PRIMARY_CDN_HOST) => FALLBACK_CDN_HOST,
        Some(FALLBACK_CDN_HOST) => PRIMARY_CDN_HOST,
        _ => return false,
    };
    url.set_host(Some(other)).is_ok()
}

/// Direct CDN URL for a Thunderstore package download, so the request does not
/// depend on the `thunderstore.io` redirect, which can be unreachable on its
/// own. Non-Thunderstore sources return `None` and keep their own URL.
fn direct_cdn_url(download_url: &str, host: &str) -> Option<reqwest::Url> {
    let url = reqwest::Url::parse(download_url).ok()?;
    if url.host_str() != Some(THUNDERSTORE_HOST) {
        return None;
    }

    let segments: Vec<&str> = url.path_segments()?.filter(|s| !s.is_empty()).collect();
    let ["package", "download", namespace, name, version] = segments.as_slice() else {
        return None;
    };

    let mut cdn = reqwest::Url::parse(&format!("https://{}/", host)).ok()?;
    {
        let mut path = cdn.path_segments_mut().ok()?;
        path.pop_if_empty();
        path.push("live");
        path.push("repository");
        path.push("packages");
        path.push(&format!("{}-{}-{}.zip", namespace, name, version));
    }
    Some(cdn)
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

/// Host to start from for the given preference. Auto probes both CDNs once per
/// session and remembers whichever one answers.
async fn resolve_preferred_host(
    client: &reqwest::Client,
    preference: CdnPreference,
) -> &'static str {
    match preference {
        CdnPreference::Main => PRIMARY_CDN_HOST,
        CdnPreference::Alternative => FALLBACK_CDN_HOST,
        CdnPreference::Auto => match AUTO_CDN_CHOICE.load(Ordering::Relaxed) {
            1 => PRIMARY_CDN_HOST,
            2 => FALLBACK_CDN_HOST,
            _ => {
                let host = probe_cdn(client).await;
                AUTO_CDN_CHOICE.store(cdn_choice_code(host), Ordering::Relaxed);
                host
            }
        },
    }
}

/// First CDN that answers its health check, primary first.
async fn probe_cdn(client: &reqwest::Client) -> &'static str {
    for host in [PRIMARY_CDN_HOST, FALLBACK_CDN_HOST] {
        let probe = client
            .get(format!("https://{}/healthz", host))
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await;
        if probe.is_ok_and(|response| response.status().is_success()) {
            return host;
        }
    }
    PRIMARY_CDN_HOST
}

/// Download a mod's ZIP with optional progress callback. No body timeout.
///
/// Thunderstore downloads normally follow the `thunderstore.io` redirect,
/// which lands on `gcdn.thunderstore.io`. With the backup CDN preferred (or in
/// auto mode when the primary one is unreachable) the request is sent straight
/// to `hcdn-1.hcdn.thunderstore.io`, so the redirect hop - which can be blocked
/// on its own - is skipped. A failed CDN request is retried once against the
/// other CDN, and the user is told when downloads end up on the backup one.
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

    let preference = app_settings::load().cdn_preference;
    let preferred_host = resolve_preferred_host(&client, preference).await;

    // Skipping the thunderstore.io redirect is what makes a direct CDN URL
    // worthwhile; the main preference keeps Thunderstore's own redirect.
    let preferred_direct = if preference == CdnPreference::Main {
        None
    } else {
        direct_cdn_url(download_url, preferred_host)
    };
    let mut url = preferred_direct
        .or_else(|| reqwest::Url::parse(download_url).ok())
        .ok_or_else(|| AppError::Network(format!("Invalid download URL: {}", download_url)))?;
    let mut tried_alternate = false;

    let mut redirects = 0;
    let response = loop {
        if aborted() {
            return Err(AppError::Cancelled);
        }

        if preferred_host == FALLBACK_CDN_HOST && !tried_alternate {
            replace_primary_cdn(&mut url);
        }

        let response = match client.get(url.clone()).send().await {
            Ok(response) => response,
            Err(error) => {
                if !tried_alternate && swap_cdn_host(&mut url) {
                    tried_alternate = true;
                    if url.host_str() == Some(FALLBACK_CDN_HOST) {
                        notify_cdn_fallback_once();
                    }
                    continue;
                }
                return Err(AppError::NetworkTransient(format!(
                    "Download failed: {}",
                    error
                )));
            }
        };

        if !matches!(response.status().as_u16(), 301 | 302 | 303 | 307 | 308) {
            if !response.status().is_success() && !tried_alternate && swap_cdn_host(&mut url) {
                tried_alternate = true;
                if url.host_str() == Some(FALLBACK_CDN_HOST) {
                    notify_cdn_fallback_once();
                }
                continue;
            }
            // Auto mode remembers the CDN that actually served a download, so
            // later installs skip the CDN that just failed.
            if response.status().is_success()
                && tried_alternate
                && preference == CdnPreference::Auto
            {
                if let Some(host) = url.host_str() {
                    AUTO_CDN_CHOICE.store(cdn_choice_code(host), Ordering::Relaxed);
                }
            }
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

    #[test]
    fn builds_direct_cdn_url_for_thunderstore_packages() {
        let url = direct_cdn_url(
            "https://thunderstore.io/package/download/denikson/BepInExPack_Valheim/5.4.2350/",
            FALLBACK_CDN_HOST,
        )
        .unwrap();

        assert_eq!(
            url.as_str(),
            "https://hcdn-1.hcdn.thunderstore.io/live/repository/packages/denikson-BepInExPack_Valheim-5.4.2350.zip"
        );
    }

    #[test]
    fn keeps_other_sources_on_their_own_url() {
        assert!(direct_cdn_url(
            "https://cdn.hexium.gg/upload/1277/1.0.4.zip",
            PRIMARY_CDN_HOST
        )
        .is_none());
        assert!(direct_cdn_url(
            "https://thunderstore.io/package/download/incomplete/",
            PRIMARY_CDN_HOST
        )
        .is_none());
    }

    #[test]
    fn swaps_known_cdn_hosts_in_both_directions() {
        let mut url = reqwest::Url::parse(
            "https://gcdn.thunderstore.io/live/repository/packages/denikson-BepInExPack_Valheim-5.4.2350.zip",
        )
        .unwrap();

        assert!(swap_cdn_host(&mut url));
        assert_eq!(url.host_str(), Some(FALLBACK_CDN_HOST));
        assert!(swap_cdn_host(&mut url));
        assert_eq!(url.host_str(), Some(PRIMARY_CDN_HOST));

        let mut other = reqwest::Url::parse("https://cdn.hexium.gg/upload/1277/1.0.4.zip").unwrap();
        assert!(!swap_cdn_host(&mut other));
        assert_eq!(other.host_str(), Some("cdn.hexium.gg"));
    }
}
