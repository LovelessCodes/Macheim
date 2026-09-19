use serde::{Deserialize, Serialize};

/// Represents an installed mod in a profile
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledMod {
    /// Thunderstore full name: "Author-ModName"
    pub full_name: String,
    pub author: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub enabled: bool,
    pub dependencies: Vec<String>,
    pub installed_at: String,
    /// Icon URL from Thunderstore
    #[serde(default)]
    pub icon: String,
    /// Discovered on disk instead of installed by Macheim. Manual records are
    /// rebuilt on every profile scan and matched to store listings by name.
    #[serde(default)]
    pub manual: bool,
}

impl InstalledMod {
    /// Directory name used for storing mod files: "Author-ModName"
    pub fn dir_name(&self) -> String {
        self.full_name.clone()
    }
}
