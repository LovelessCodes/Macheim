use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::error::AppResult;
use crate::services::thunderstore_client::get_app_data_dir;

/// Which Thunderstore CDN mods download from.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CdnPreference {
    /// Use whichever CDN is reachable, switching to the other one when a
    /// download falls back.
    #[default]
    Auto,
    /// Always start from Thunderstore's primary CDN (`gcdn.thunderstore.io`).
    Main,
    /// Always start from Thunderstore's backup CDN
    /// (`hcdn-1.hcdn.thunderstore.io`), for networks that block the primary.
    Alternative,
}

/// App-level preferences, persisted next to the queue and caches.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppSettings {
    /// Append `-console` to the modded launch command.
    #[serde(default = "default_true")]
    pub console_enabled: bool,
    /// Snapshot worlds and characters before every modded launch.
    #[serde(default = "default_true")]
    pub snapshot_saves: bool,
    /// Thunderstore CDN selection for mod downloads.
    #[serde(default)]
    pub cdn_preference: CdnPreference,
}

fn default_true() -> bool {
    true
}

impl Default for AppSettings {
    /// Console and pre-launch snapshots were always on before they became
    /// settings.
    fn default() -> Self {
        Self {
            console_enabled: true,
            snapshot_saves: true,
            cdn_preference: CdnPreference::default(),
        }
    }
}

pub fn settings_path() -> PathBuf {
    get_app_data_dir().join("settings.json")
}

pub fn load() -> AppSettings {
    load_from(&settings_path())
}

/// Missing or unreadable settings fall back to defaults.
pub fn load_from(path: &Path) -> AppSettings {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return AppSettings::default();
    };
    match serde_json::from_str(&raw) {
        Ok(settings) => settings,
        Err(e) => {
            warn!("Ignoring unreadable settings at {}: {}", path.display(), e);
            AppSettings::default()
        }
    }
}

pub fn save(settings: &AppSettings) -> AppResult<()> {
    save_to(&settings_path(), settings)
}

pub fn save_to(path: &Path, settings: &AppSettings) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(settings)?;
    std::fs::write(path, json)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_round_trip_and_default_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");

        assert_eq!(load_from(&path), AppSettings::default());

        let settings = AppSettings {
            console_enabled: false,
            snapshot_saves: false,
            cdn_preference: CdnPreference::Alternative,
        };
        save_to(&path, &settings).unwrap();
        assert_eq!(load_from(&path), settings);
    }

    #[test]
    fn unreadable_settings_fall_back_to_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, "{not json").unwrap();

        assert_eq!(load_from(&path), AppSettings::default());
    }
}
