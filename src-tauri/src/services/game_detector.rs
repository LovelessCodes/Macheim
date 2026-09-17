use std::path::{Path, PathBuf};

use regex::Regex;
use tracing::{debug, info, warn};

use crate::error::{AppError, AppResult};

const VALHEIM_APP_ID: &str = "892970";
const VALHEIM_BUNDLE_ID: &str = "com.coffeestain.valheim-steam";

/// Detect the Valheim installation on macOS by scanning Steam library folders.
pub fn detect_valheim() -> AppResult<PathBuf> {
    info!("Detecting Valheim installation...");

    // 1. Try parsing Steam libraryfolders.vdf for all library paths
    let library_paths = get_steam_library_paths();

    for lib_path in &library_paths {
        debug!("Checking Steam library: {}", lib_path.display());

        // Check for Valheim app manifest
        let manifest = lib_path
            .join("steamapps")
            .join(format!("appmanifest_{}.acf", VALHEIM_APP_ID));
        if manifest.exists() {
            let valheim_path = lib_path
                .join("steamapps")
                .join("common")
                .join("Valheim")
                .join("valheim.app");

            if valheim_path.exists() {
                if validate_valheim_app(&valheim_path) {
                    info!("Found Valheim at: {}", valheim_path.display());
                    return Ok(valheim_path);
                } else {
                    warn!(
                        "Found valheim.app at {} but bundle ID doesn't match",
                        valheim_path.display()
                    );
                }
            }
        }
    }

    // 2. Try default Steam location directly
    let default_path = get_default_valheim_path();
    if default_path.exists() && validate_valheim_app(&default_path) {
        info!("Found Valheim at default path: {}", default_path.display());
        return Ok(default_path);
    }

    // 3. Try without .app extension (some installs have just the directory)
    for lib_path in &library_paths {
        let valheim_dir = lib_path.join("steamapps").join("common").join("Valheim");
        if valheim_dir.exists() && valheim_dir.is_dir() {
            // Check if there's a valheim.app inside
            let app_path = valheim_dir.join("valheim.app");
            if app_path.exists() {
                info!("Found Valheim app bundle at: {}", app_path.display());
                return Ok(app_path);
            }
            // If no .app but directory exists, return the directory
            info!("Found Valheim directory at: {}", valheim_dir.display());
            return Ok(valheim_dir);
        }
    }

    Err(AppError::GameNotFound(
        "Could not find Valheim installation. Please ensure Valheim is installed via Steam."
            .to_string(),
    ))
}

/// Get the root directory containing the valheim.app (or the game dir itself).
/// This is where BepInEx files go.
pub fn get_valheim_root(game_path: &Path) -> PathBuf {
    if game_path.extension().map(|e| e == "app").unwrap_or(false) {
        // game_path is valheim.app, parent is the Valheim root
        game_path.parent().unwrap_or(game_path).to_path_buf()
    } else {
        game_path.to_path_buf()
    }
}

/// Parse Steam's libraryfolders.vdf to find all Steam library paths.
fn get_steam_library_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // Default Steam path
    if let Some(home) = dirs::home_dir() {
        let default_steam = home.join("Library/Application Support/Steam");
        if default_steam.exists() {
            paths.push(default_steam.clone());
        }

        let vdf_path = default_steam.join("steamapps/libraryfolders.vdf");
        if vdf_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&vdf_path) {
                let parsed = parse_vdf_paths(&content);
                for p in parsed {
                    let path = PathBuf::from(p);
                    if path.exists() && !paths.contains(&path) {
                        paths.push(path);
                    }
                }
            }
        }
    }

    paths
}

/// Simple regex-based parser for Valve's VDF format to extract "path" values.
fn parse_vdf_paths(content: &str) -> Vec<String> {
    let mut result = Vec::new();

    // Match lines like: "path"		"/path/to/library"
    let re = Regex::new(r#""path"\s+"([^"]+)""#).unwrap();
    for cap in re.captures_iter(content) {
        if let Some(m) = cap.get(1) {
            result.push(m.as_str().to_string());
        }
    }

    result
}

/// Default Valheim path on macOS
fn get_default_valheim_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/Users"));
    home.join("Library/Application Support/Steam/steamapps/common/Valheim/valheim.app")
}

/// Validate the app bundle by checking Info.plist for the correct CFBundleIdentifier.
fn validate_valheim_app(app_path: &Path) -> bool {
    let info_plist = app_path.join("Contents/Info.plist");
    if !info_plist.exists() {
        debug!("Info.plist not found at {}", info_plist.display());
        // Still return true if .app exists -- some builds may not have the expected bundle ID
        return app_path.exists();
    }

    match plist::Value::from_file(&info_plist) {
        Ok(plist::Value::Dictionary(dict)) => {
            if let Some(plist::Value::String(bundle_id)) = dict.get("CFBundleIdentifier") {
                let matches = bundle_id == VALHEIM_BUNDLE_ID;
                if !matches {
                    debug!(
                        "Bundle ID mismatch: expected {}, got {}",
                        VALHEIM_BUNDLE_ID, bundle_id
                    );
                }
                matches
            } else {
                warn!("CFBundleIdentifier not found in Info.plist");
                true // Be lenient
            }
        }
        Ok(_) => {
            warn!("Info.plist is not a dictionary");
            true
        }
        Err(e) => {
            warn!("Failed to parse Info.plist: {}", e);
            true // Be lenient -- plist format might differ
        }
    }
}

/// Get the game status information for the frontend.
#[derive(Debug, Clone, serde::Serialize)]
pub struct GameStatus {
    pub installed: bool,
    pub game_path: Option<String>,
    pub bepinex_installed: bool,
    pub active_profile: String,
}

pub fn get_game_status_info(
    game_path: &Option<PathBuf>,
    bepinex_installed: bool,
    active_profile: &str,
) -> GameStatus {
    match game_path {
        Some(path) => GameStatus {
            installed: true,
            game_path: Some(path.display().to_string()),
            bepinex_installed,
            active_profile: active_profile.to_string(),
        },
        None => GameStatus {
            installed: false,
            game_path: None,
            bepinex_installed: false,
            active_profile: "Default".to_string(),
        },
    }
}
