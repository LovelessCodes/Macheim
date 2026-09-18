use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::error::AppResult;
use crate::services::thunderstore_client::get_app_data_dir;

/// Mods that safe mode moved to `plugins_disabled`, so they can be restored
/// with one click after a crash.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SafeModeState {
    #[serde(default)]
    pub disabled: Vec<String>,
}

pub fn state_path() -> PathBuf {
    get_app_data_dir().join("safe-mode.json")
}

pub fn load() -> SafeModeState {
    load_from(&state_path())
}

pub fn load_from(path: &Path) -> SafeModeState {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return SafeModeState::default();
    };
    serde_json::from_str(&raw).unwrap_or_else(|e| {
        warn!(
            "Ignoring unreadable safe mode state at {}: {}",
            path.display(),
            e
        );
        SafeModeState::default()
    })
}

pub fn save(state: &SafeModeState) -> AppResult<()> {
    save_to(&state_path(), state)
}

pub fn save_to(path: &Path, state: &SafeModeState) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, serde_json::to_string_pretty(state)?)?;
    Ok(())
}

pub fn clear() -> AppResult<()> {
    let path = state_path();
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_mode_state_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("safe-mode.json");

        assert_eq!(load_from(&path), SafeModeState::default());

        let state = SafeModeState {
            disabled: vec!["Zenox-BetterUI".into(), "Azumatt-AzuClock".into()],
        };
        save_to(&path, &state).unwrap();
        assert_eq!(load_from(&path), state);
    }

    #[test]
    fn unreadable_state_falls_back_to_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("safe-mode.json");
        std::fs::write(&path, "{oops").unwrap();

        assert_eq!(load_from(&path), SafeModeState::default());
    }
}
