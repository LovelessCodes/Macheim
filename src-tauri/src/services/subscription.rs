use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tracing::warn;

use super::compatibility::{atomic_write, reject_symlink_ancestors};
use super::profile_manager;
use crate::error::{AppError, AppResult};
use crate::models::{PackageSource, PackageVersion, ParsedDependency, ThunderstorePackage};

/// Sidecar file stored next to a profile's `profile.json`. Keeping the link
/// out of the profile keeps the upstream profile format and its exports
/// untouched, while still travelling with the profile folder.
pub const SUBSCRIPTION_FILE: &str = "subscription.json";

/// The loader ships with every Valheim modpack but lives outside profiles, so
/// it is never part of a subscription's tracked mod set.
pub const BEPINEX_PACKAGE: &str = "denikson-BepInExPack_Valheim";

/// A profile's link to a published Thunderstore modpack.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Subscription {
    /// Thunderstore full name: "Author-PackName"
    pub modpack: String,
    /// The modpack version this profile was last synced to.
    pub version: String,
    /// The pack's dependency full names at the last sync, excluding BepInEx.
    /// Recorded so a sync can tell which mods the pack dropped.
    #[serde(default)]
    pub mods: Vec<String>,
    pub synced_at: String,
}

/// A subscription together with the profile it belongs to.
#[derive(Debug, Clone, Serialize)]
pub struct ProfileSubscription {
    pub profile: String,
    pub subscription: Subscription,
}

pub fn path_in(profile_dir: &Path) -> PathBuf {
    profile_dir.join(SUBSCRIPTION_FILE)
}

/// Read a profile's subscription. A missing or unreadable sidecar means "not
/// subscribed", never an error.
pub fn load(profile_dir: &Path) -> Option<Subscription> {
    let path = path_in(profile_dir);
    if reject_symlink_ancestors(&path).is_err() {
        warn!("Ignoring symlinked subscription at {}", path.display());
        return None;
    }
    let bytes = std::fs::read(&path).ok()?;
    match serde_json::from_slice::<Subscription>(&bytes) {
        Ok(subscription) => Some(subscription),
        Err(error) => {
            warn!(
                "Ignoring unreadable subscription at {}: {}",
                path.display(),
                error
            );
            None
        }
    }
}

pub fn load_for(profile: &str) -> AppResult<Option<Subscription>> {
    profile_manager::validate_name(profile)?;
    Ok(load(&profile_manager::get_profile_dir(profile)))
}

pub fn save(profile_dir: &Path, subscription: &Subscription) -> AppResult<()> {
    atomic_write(
        &path_in(profile_dir),
        &serde_json::to_vec_pretty(subscription)?,
    )
}

pub fn save_for(profile: &str, subscription: &Subscription) -> AppResult<()> {
    save(&profile_manager::get_profile_dir(profile), subscription)
}

/// Remove a profile's subscription. The profile itself is untouched.
pub fn clear(profile_dir: &Path) -> AppResult<()> {
    let path = path_in(profile_dir);
    reject_symlink_ancestors(&path)?;
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    Ok(())
}

pub fn clear_for(profile: &str) -> AppResult<()> {
    profile_manager::validate_name(profile)?;
    clear(&profile_manager::get_profile_dir(profile))
}

/// Every subscribed profile, sorted by profile name.
pub fn list() -> AppResult<Vec<ProfileSubscription>> {
    let dir = profile_manager::get_profiles_dir();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut subscriptions = Vec::new();
    for entry in entries.flatten() {
        if !entry.file_type().is_ok_and(|file_type| file_type.is_dir()) {
            continue;
        }
        let profile = entry.file_name().to_string_lossy().into_owned();
        if let Some(subscription) = load(&entry.path()) {
            subscriptions.push(ProfileSubscription {
                profile,
                subscription,
            });
        }
    }
    subscriptions.sort_by(|a, b| a.profile.cmp(&b.profile));
    Ok(subscriptions)
}

/// Build the subscription record for a modpack version.
pub fn build(modpack: &str, version: &PackageVersion) -> Subscription {
    Subscription {
        modpack: modpack.to_string(),
        version: version.version_number.clone(),
        mods: pack_mods(version),
        synced_at: chrono::Utc::now().to_rfc3339(),
    }
}

/// Dependency full names of a modpack version, BepInEx excluded and order kept.
pub fn pack_mods(version: &PackageVersion) -> Vec<String> {
    let mut mods = Vec::new();
    for dependency in parse_dependencies(&version.dependencies) {
        if dependency.full_name == BEPINEX_PACKAGE || mods.contains(&dependency.full_name) {
            continue;
        }
        mods.push(dependency.full_name);
    }
    mods
}

/// Parse dependency strings, dropping entries that are not really dependencies.
/// `ParsedDependency::parse` accepts anything with three dash-separated parts,
/// so a bare word like `not-a-dependency` would otherwise become a mod.
pub fn parse_dependencies(dependencies: &[String]) -> Vec<ParsedDependency> {
    dependencies
        .iter()
        .filter_map(|dependency| ParsedDependency::parse(dependency))
        .filter(|parsed| parsed.version.contains('.'))
        .collect()
}

/// Latest version of `modpack` from a package list, when that version is
/// carried by Thunderstore. Subscriptions are Thunderstore-only: Hexium
/// listings have no dependency data to diff against.
pub fn latest_thunderstore_version<'a>(
    packages: &'a [ThunderstorePackage],
    modpack: &str,
) -> Option<(&'a ThunderstorePackage, &'a PackageVersion)> {
    let package = packages
        .iter()
        .find(|package| package.full_name == modpack)?;
    let version = package.versions.first()?;
    if !thunderstore_carries(package, version) {
        return None;
    }
    Some((package, version))
}

/// A version with no explicit sources belongs to its package's own store.
fn thunderstore_carries(package: &ThunderstorePackage, version: &PackageVersion) -> bool {
    if version.sources.is_empty() {
        return package.source == PackageSource::Thunderstore;
    }
    version.sources.contains(&PackageSource::Thunderstore)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn version(version_number: &str, dependencies: &[&str]) -> PackageVersion {
        PackageVersion {
            name: "Pack".to_string(),
            full_name: "Author-Pack".to_string(),
            version_number: version_number.to_string(),
            dependencies: dependencies.iter().map(|dep| dep.to_string()).collect(),
            download_url: format!("https://example.com/{}.zip", version_number),
            downloads: 1,
            description: String::new(),
            icon: String::new(),
            date_created: "2026-01-01T00:00:00Z".to_string(),
            file_size: 1,
            is_active: true,
            uuid4: None,
            sources: Vec::new(),
        }
    }

    fn package(source: PackageSource, versions: Vec<PackageVersion>) -> ThunderstorePackage {
        ThunderstorePackage {
            name: "Pack".to_string(),
            full_name: "Author-Pack".to_string(),
            owner: "Author".to_string(),
            package_url: "https://example.com/Author-Pack".to_string(),
            date_updated: "2026-01-01T00:00:00Z".to_string(),
            is_deprecated: false,
            rating_score: 1,
            versions,
            categories: vec!["Modpacks".to_string()],
            is_pinned: false,
            source,
            alternates: Vec::new(),
        }
    }

    #[test]
    fn subscription_round_trips_and_clears() {
        let dir = tempfile::tempdir().unwrap();
        let subscription = build(
            "Author-Pack",
            &version(
                "1.2.3",
                &[
                    "Author-ModA-1.0.0",
                    "denikson-BepInExPack_Valheim-5.4.2350",
                ],
            ),
        );

        save(dir.path(), &subscription).unwrap();
        assert_eq!(load(dir.path()), Some(subscription));

        clear(dir.path()).unwrap();
        assert_eq!(load(dir.path()), None);
        // Clearing again is harmless.
        clear(dir.path()).unwrap();
    }

    #[test]
    fn missing_sidecar_reads_as_unsubscribed() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(dir.path()), None);
    }

    #[test]
    fn unreadable_sidecar_reads_as_unsubscribed() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(path_in(dir.path()), b"{not json").unwrap();
        assert_eq!(load(dir.path()), None);
    }

    #[test]
    fn pack_mods_exclude_bepinex_and_duplicates() {
        let mods = pack_mods(&version(
            "1.0.0",
            &[
                "Author-ModA-1.0.0",
                "denikson-BepInExPack_Valheim-5.4.2350",
                "Author-ModA-1.0.0",
                "Someone-Mod-B-2.0.1",
                "not-a-dependency",
            ],
        ));
        assert_eq!(mods, vec!["Author-ModA", "Someone-Mod-B"]);
    }

    #[test]
    fn latest_version_prefers_the_newest_and_requires_thunderstore() {
        let packages = vec![package(
            PackageSource::Thunderstore,
            vec![version("2.0.0", &[]), version("1.0.0", &[])],
        )];
        let (_, latest) = latest_thunderstore_version(&packages, "Author-Pack").unwrap();
        assert_eq!(latest.version_number, "2.0.0");

        // A Hexium-only listing is not subscribable.
        let hexium = vec![package(PackageSource::Hexium, vec![version("1.0.0", &[])])];
        assert!(latest_thunderstore_version(&hexium, "Author-Pack").is_none());

        // A merged listing whose newest version is on Thunderstore is fine.
        let mut merged = version("3.0.0", &[]);
        merged.sources = vec![PackageSource::Thunderstore, PackageSource::Hexium];
        let mixed = vec![package(PackageSource::Hexium, vec![merged])];
        assert!(latest_thunderstore_version(&mixed, "Author-Pack").is_some());

        assert!(latest_thunderstore_version(&[], "Author-Pack").is_none());
    }
}
