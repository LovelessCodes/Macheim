use serde::{Deserialize, Serialize};

/// Store a package was fetched from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum PackageSource {
    #[default]
    Thunderstore,
    Hexium,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThunderstorePackage {
    pub name: String,
    pub full_name: String,
    pub owner: String,
    pub package_url: String,
    pub date_updated: String,
    pub is_deprecated: bool,
    pub rating_score: u32,
    pub versions: Vec<PackageVersion>,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default)]
    pub source: PackageSource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageVersion {
    pub name: String,
    pub full_name: String,
    pub version_number: String,
    pub dependencies: Vec<String>,
    pub download_url: String,
    pub downloads: u64,
    pub description: String,
    pub icon: String,
    pub date_created: String,
    #[serde(default)]
    pub file_size: u64,
    #[serde(default)]
    pub is_active: bool,
    #[serde(default)]
    pub uuid4: Option<String>,
}

/// Lightweight package info for search results / listing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageListing {
    pub name: String,
    pub full_name: String,
    pub owner: String,
    pub package_url: String,
    pub description: String,
    pub version_number: String,
    pub rating_score: u32,
    pub downloads: u64,
    pub is_deprecated: bool,
    pub icon: String,
    pub categories: Vec<String>,
    pub date_updated: String,
    pub source: PackageSource,
}

impl From<&ThunderstorePackage> for PackageListing {
    fn from(pkg: &ThunderstorePackage) -> Self {
        let latest = pkg.versions.first();
        Self {
            name: pkg.name.clone(),
            full_name: pkg.full_name.clone(),
            owner: pkg.owner.clone(),
            package_url: pkg.package_url.clone(),
            description: latest.map(|v| v.description.clone()).unwrap_or_default(),
            version_number: latest.map(|v| v.version_number.clone()).unwrap_or_default(),
            rating_score: pkg.rating_score,
            // Cumulative across every published version, matching what the
            // store shows, so the "Downloads" sort is not biased by whichever
            // version happens to be the latest.
            downloads: pkg.versions.iter().map(|v| v.downloads).sum(),
            is_deprecated: pkg.is_deprecated,
            icon: latest.map(|v| v.icon.clone()).unwrap_or_default(),
            categories: pkg.categories.clone(),
            date_updated: pkg.date_updated.clone(),
            source: pkg.source,
        }
    }
}

/// Parsed dependency string: "Author-ModName-1.2.3"
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedDependency {
    pub author: String,
    pub name: String,
    pub full_name: String,
    pub version: String,
}

impl ParsedDependency {
    /// Parse a Thunderstore dependency string like "Author-ModName-1.2.3"
    pub fn parse(dep: &str) -> Option<Self> {
        // Format: "Author-Name-Major.Minor.Patch"
        // Split from the right to find the version part
        let parts: Vec<&str> = dep.split('-').collect();
        if parts.len() < 3 {
            return None;
        }

        // The version is always the last part and contains dots
        // Author is first, name is everything between
        let author = parts[0].to_string();

        // Find where version starts (last part that looks like a semver)
        // Walk backwards to find the version segment
        let mut version_idx = parts.len();
        for i in (1..parts.len()).rev() {
            if parts[i].contains('.') {
                version_idx = i;
                break;
            }
        }

        if version_idx >= parts.len() || version_idx < 2 {
            // Fallback: assume last part is version
            if parts.len() == 3 {
                return Some(Self {
                    author: parts[0].to_string(),
                    name: parts[1].to_string(),
                    full_name: format!("{}-{}", parts[0], parts[1]),
                    version: parts[2].to_string(),
                });
            }
            return None;
        }

        let name = parts[1..version_idx].join("-");
        let version = parts[version_idx..].join("-");
        let full_name = format!("{}-{}", author, name);

        Some(Self {
            author,
            name,
            full_name,
            version,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn version(version_number: &str, downloads: u64, description: &str) -> PackageVersion {
        PackageVersion {
            name: "Mod".to_string(),
            full_name: "Author-Mod".to_string(),
            version_number: version_number.to_string(),
            dependencies: Vec::new(),
            download_url: format!("https://example.com/{}.zip", version_number),
            downloads,
            description: description.to_string(),
            icon: String::new(),
            date_created: "2026-01-01T00:00:00Z".to_string(),
            file_size: 1,
            is_active: true,
            uuid4: None,
        }
    }

    fn package(versions: Vec<PackageVersion>) -> ThunderstorePackage {
        ThunderstorePackage {
            name: "Mod".to_string(),
            full_name: "Author-Mod".to_string(),
            owner: "Author".to_string(),
            package_url: "https://example.com/Author-Mod".to_string(),
            date_updated: "2026-01-01T00:00:00Z".to_string(),
            is_deprecated: false,
            rating_score: 1,
            versions,
            categories: Vec::new(),
            is_pinned: false,
            source: PackageSource::Thunderstore,
        }
    }

    #[test]
    fn listing_downloads_are_cumulative_across_versions() {
        let pkg = package(vec![
            version("2.0.0", 300, "latest"),
            version("1.0.0", 200, "older"),
            version("0.9.0", 50, "oldest"),
        ]);

        let listing = PackageListing::from(&pkg);

        assert_eq!(listing.downloads, 550);
    }

    #[test]
    fn listing_metadata_still_comes_from_latest_version() {
        let pkg = package(vec![
            version("2.0.0", 300, "latest"),
            version("1.0.0", 200, "older"),
        ]);

        let listing = PackageListing::from(&pkg);

        assert_eq!(listing.version_number, "2.0.0");
        assert_eq!(listing.description, "latest");
    }
}
