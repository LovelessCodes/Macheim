use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::error::AppResult;
use crate::services::thunderstore_client::get_app_data_dir;

/// App-level preferences, persisted next to the queue and caches.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppSettings {
    /// Append `-console` to the modded launch command.
    #[serde(default = "default_true")]
    pub console_enabled: bool,
}

fn default_true() -> bool {
    true
}

impl Default for AppSettings {
    /// Console was always on before it became a setting.
    fn default() -> Self {
        Self {
            console_enabled: true,
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
