use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Game not found: {0}")]
    GameNotFound(String),
    #[error("BepInEx error: {0}")]
    BepInEx(String),
    #[error("Network error: {0}")]
    Network(String),
    /// Connection-level failure (offline, DNS, reset stream). Safe to retry.
    #[error("Connection error: {0}")]
    NetworkTransient(String),
    #[error("Quit Valheim before changing mods, profiles or compatibility patches.")]
    GameRunning,
    #[error("Cancelled")]
    Cancelled,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Zip error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("Reqwest error: {0}")]
    Reqwest(#[from] reqwest::Error),
    #[error("Dependency resolution error: {0}")]
    DependencyResolution(String),
    #[error("Profile error: {0}")]
    Profile(String),
    #[error("Mod error: {0}")]
    Mod(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
