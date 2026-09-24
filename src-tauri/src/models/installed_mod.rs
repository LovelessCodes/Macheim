use serde::{Deserialize, Serialize};

/// Why a mod was installed. Records from before this was tracked, manual
/// scans and user-requested installs are all explicit, so they are never
/// swept as unused dependencies.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InstalledAs {
    #[default]
    Explicit,
    Dependency,
}

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
    /// Held at its installed version: excluded from updates. A pin follows the
    /// installed version, so switching versions while pinned moves the hold.
    #[serde(default)]
    pub pinned: bool,
    /// Whether the user asked for this mod or the installer pulled it in.
    #[serde(default)]
    pub installed_as: InstalledAs,
}

impl InstalledMod {
    /// Directory name used for storing mod files: "Author-ModName"
    pub fn dir_name(&self) -> String {
        self.full_name.clone()
    }
}
