use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tracing::warn;

use super::compatibility::{atomic_write, reject_symlink_ancestors};
use super::profile_manager;
use crate::error::AppResult;
use crate::models::{
    InstalledMod, PackageSource, PackageVersion, ParsedDependency, ThunderstorePackage,
};

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

/// One mod the sync plan adds, updates or removes. `from_version` is the
/// installed version, `to_version` the pack's version; removals have no target.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SyncItem {
    pub full_name: String,
    pub name: String,
    pub from_version: Option<String>,
    pub to_version: Option<String>,
}

/// What the pack expects of the loader, against what is installed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BepInExStatus {
    pub expected: String,
    pub installed: Option<String>,
    pub outdated: bool,
}

/// The difference between a subscribed profile and the pack's latest version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SyncPlan {
    pub modpack: String,
    pub from_version: String,
    pub to_version: String,
    pub add: Vec<SyncItem>,
    pub update: Vec<SyncItem>,
    /// Mods recorded at the last sync that the pack has since dropped.
    pub remove: Vec<SyncItem>,
    /// Profile mods that are not part of the pack; never touched.
    pub kept: Vec<String>,
    /// Pack members held by a pin, skipped by the sync.
    pub pinned_skips: Vec<SyncItem>,
    /// Manually installed mods whose name matches a pack dependency.
    pub manual_conflicts: Vec<SyncItem>,
    /// The pack's dependency full names at its latest version.
    pub pack_mods: Vec<String>,
    pub bepinex: Option<BepInExStatus>,
    pub up_to_date: bool,
}

/// Diff a subscribed profile against the pack's latest version. Pure: the
/// caller resolves the pack and the installed loader version.
pub fn plan_sync(
    subscription: &Subscription,
    mods: &[InstalledMod],
    latest: &PackageVersion,
    installed_bepinex: Option<String>,
) -> SyncPlan {
    let dependencies = parse_dependencies(&latest.dependencies);
    let pack: Vec<&ParsedDependency> = dependencies
        .iter()
        .filter(|dependency| dependency.full_name != BEPINEX_PACKAGE)
        .collect();

    let bepinex = dependencies
        .iter()
        .find(|dependency| dependency.full_name == BEPINEX_PACKAGE)
        .map(|dependency| BepInExStatus {
            expected: dependency.version.clone(),
            installed: installed_bepinex.clone(),
            outdated: installed_bepinex
                .as_deref()
                .is_some_and(|installed| version_is_older(installed, &dependency.version)),
        });

    let installed: HashMap<&str, &InstalledMod> = mods
        .iter()
        .map(|module| (module.full_name.as_str(), module))
        .collect();

    let mut add = Vec::new();
    let mut update = Vec::new();
    let mut pinned_skips = Vec::new();
    let mut manual_conflicts = Vec::new();
    for dependency in &pack {
        let Some(module) = installed.get(dependency.full_name.as_str()) else {
            add.push(SyncItem {
                full_name: dependency.full_name.clone(),
                name: dependency.name.clone(),
                from_version: None,
                to_version: Some(dependency.version.clone()),
            });
            continue;
        };
        let item = SyncItem {
            full_name: dependency.full_name.clone(),
            name: dependency.name.clone(),
            from_version: Some(module.version.clone()),
            to_version: Some(dependency.version.clone()),
        };
        if profile_manager::is_manual_placeholder(module) {
            manual_conflicts.push(item);
        } else if module.version != dependency.version {
            if module.pinned {
                pinned_skips.push(item);
            } else {
                update.push(item);
            }
        }
    }

    let pack_names: HashSet<&str> = pack
        .iter()
        .map(|dependency| dependency.full_name.as_str())
        .collect();
    let mut remove = Vec::new();
    for full_name in &subscription.mods {
        if pack_names.contains(full_name.as_str()) {
            continue;
        }
        let Some(module) = installed.get(full_name.as_str()) else {
            continue;
        };
        if profile_manager::is_manual_placeholder(module) {
            continue;
        }
        let item = SyncItem {
            full_name: full_name.clone(),
            name: module.name.clone(),
            from_version: Some(module.version.clone()),
            to_version: None,
        };
        if module.pinned {
            pinned_skips.push(item);
        } else {
            remove.push(item);
        }
    }

    let removed: HashSet<&str> = remove.iter().map(|item| item.full_name.as_str()).collect();
    let skipped: HashSet<&str> = pinned_skips
        .iter()
        .map(|item| item.full_name.as_str())
        .collect();
    let conflicting: HashSet<&str> = manual_conflicts
        .iter()
        .map(|item| item.full_name.as_str())
        .collect();
    let kept = mods
        .iter()
        .filter(|module| {
            !pack_names.contains(module.full_name.as_str())
                && !removed.contains(module.full_name.as_str())
                && !skipped.contains(module.full_name.as_str())
                && !conflicting.contains(module.full_name.as_str())
        })
        .map(|module| module.full_name.clone())
        .collect();

    SyncPlan {
        modpack: subscription.modpack.clone(),
        from_version: subscription.version.clone(),
        to_version: latest.version_number.clone(),
        up_to_date: add.is_empty() && update.is_empty() && remove.is_empty(),
        add,
        update,
        remove,
        kept,
        pinned_skips,
        manual_conflicts,
        pack_mods: pack
            .iter()
            .map(|dependency| dependency.full_name.clone())
            .collect(),
        bepinex,
    }
}

/// Strictly older by semver; unparsable versions are treated as unknown.
fn version_is_older(installed: &str, expected: &str) -> bool {
    match (
        semver::Version::parse(installed),
        semver::Version::parse(expected),
    ) {
        (Ok(installed), Ok(expected)) => installed < expected,
        _ => false,
    }
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
                &["Author-ModA-1.0.0", "denikson-BepInExPack_Valheim-5.4.2350"],
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

    fn installed(full_name: &str, version: &str) -> crate::models::InstalledMod {
        crate::models::InstalledMod {
            full_name: full_name.to_string(),
            author: full_name.split('-').next().unwrap_or(full_name).to_string(),
            name: full_name
                .rsplit('-')
                .next()
                .unwrap_or(full_name)
                .to_string(),
            version: version.to_string(),
            description: String::new(),
            enabled: true,
            dependencies: Vec::new(),
            installed_at: "2026-01-01T00:00:00Z".to_string(),
            icon: String::new(),
            manual: false,
            pinned: false,
            installed_as: crate::models::InstalledAs::Explicit,
        }
    }

    fn subscription(version: &str, mods: &[&str]) -> Subscription {
        Subscription {
            modpack: "Author-Pack".to_string(),
            version: version.to_string(),
            mods: mods.iter().map(|name| name.to_string()).collect(),
            synced_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn plan_classifies_add_update_remove_and_kept() {
        let subscription = subscription("1.0.0", &["Author-ModA", "Author-ModB", "Author-Old"]);
        let mods = vec![
            installed("Author-ModA", "0.9.0"),
            installed("Author-ModB", "1.0.0"),
            installed("Author-Old", "1.0.0"),
            installed("Author-Extra", "1.0.0"),
        ];
        let latest = version(
            "2.0.0",
            &[
                "Author-ModA-1.0.0",
                "Author-ModB-1.0.0",
                "Author-New-2.0.0",
                "denikson-BepInExPack_Valheim-5.4.2350",
            ],
        );

        let plan = plan_sync(&subscription, &mods, &latest, Some("5.4.2350".to_string()));

        assert_eq!(plan.to_version, "2.0.0");
        assert_eq!(
            plan.add,
            vec![SyncItem {
                full_name: "Author-New".to_string(),
                name: "New".to_string(),
                from_version: None,
                to_version: Some("2.0.0".to_string()),
            }]
        );
        assert_eq!(
            plan.update,
            vec![SyncItem {
                full_name: "Author-ModA".to_string(),
                name: "ModA".to_string(),
                from_version: Some("0.9.0".to_string()),
                to_version: Some("1.0.0".to_string()),
            }]
        );
        assert_eq!(
            plan.remove,
            vec![SyncItem {
                full_name: "Author-Old".to_string(),
                name: "Old".to_string(),
                from_version: Some("1.0.0".to_string()),
                to_version: None,
            }]
        );
        assert_eq!(plan.kept, vec!["Author-Extra"]);
        assert_eq!(
            plan.pack_mods,
            vec!["Author-ModA", "Author-ModB", "Author-New"]
        );
        assert_eq!(
            plan.bepinex,
            Some(BepInExStatus {
                expected: "5.4.2350".to_string(),
                installed: Some("5.4.2350".to_string()),
                outdated: false,
            })
        );
        assert!(!plan.up_to_date);
    }

    #[test]
    fn pinned_pack_members_are_skipped_for_updates_and_removals() {
        let subscription = subscription("1.0.0", &["Author-ModA", "Author-Old"]);
        let mut pinned_update = installed("Author-ModA", "0.9.0");
        pinned_update.pinned = true;
        let mut pinned_remove = installed("Author-Old", "1.0.0");
        pinned_remove.pinned = true;
        let mods = vec![pinned_update, pinned_remove];
        let latest = version("2.0.0", &["Author-ModA-1.0.0"]);

        let plan = plan_sync(&subscription, &mods, &latest, None);

        assert!(plan.update.is_empty());
        assert!(plan.remove.is_empty());
        assert_eq!(plan.pinned_skips.len(), 2);
        assert_eq!(plan.pinned_skips[0].full_name, "Author-ModA");
        assert_eq!(plan.pinned_skips[1].full_name, "Author-Old");
        // Pinned entries are not reported as kept extras either.
        assert!(plan.kept.is_empty());
    }

    #[test]
    fn manually_installed_pack_members_are_conflicts_not_updates() {
        let subscription = subscription("1.0.0", &["Author-ModA"]);
        let mut manual = installed("Author-ModA", "0.9.0");
        manual.manual = true;
        let mods = vec![manual];
        let latest = version("2.0.0", &["Author-ModA-1.0.0"]);

        let plan = plan_sync(&subscription, &mods, &latest, None);

        assert!(plan.update.is_empty());
        assert!(plan.kept.is_empty());
        assert_eq!(plan.manual_conflicts.len(), 1);
        assert_eq!(plan.manual_conflicts[0].full_name, "Author-ModA");
    }

    #[test]
    fn a_profile_matching_the_pack_is_up_to_date() {
        let subscription = subscription("2.0.0", &["Author-ModA"]);
        let mods = vec![installed("Author-ModA", "1.0.0")];
        let latest = version("2.0.0", &["Author-ModA-1.0.0"]);

        let plan = plan_sync(&subscription, &mods, &latest, None);

        assert!(plan.up_to_date);
        assert!(plan.bepinex.is_none());
    }

    #[test]
    fn an_older_installed_loader_is_reported_outdated() {
        let subscription = subscription("1.0.0", &[]);
        let latest = version("2.0.0", &["denikson-BepInExPack_Valheim-5.4.2350"]);

        let older = plan_sync(&subscription, &[], &latest, Some("5.4.2200".to_string()));
        assert!(older.bepinex.as_ref().unwrap().outdated);

        let newer = plan_sync(&subscription, &[], &latest, Some("5.5.0".to_string()));
        assert!(!newer.bepinex.as_ref().unwrap().outdated);

        // Unknown installed version: report the expectation, do not claim outdated.
        let unknown = plan_sync(&subscription, &[], &latest, None);
        let bepinex = unknown.bepinex.unwrap();
        assert_eq!(bepinex.installed, None);
        assert!(!bepinex.outdated);
    }
}
