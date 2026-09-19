use std::collections::HashMap;

use tracing::warn;

use crate::error::AppResult;
use crate::models::thunderstore::{PackageSource, ThunderstorePackage};
use crate::services::{hexium_client, package_cache, thunderstore_client};

/// Fetch packages from every supported store and merge them into one list.
/// Hexium is best-effort: when it is unreachable the Thunderstore list is
/// still returned.
pub async fn fetch_all_packages(force_refresh: bool) -> AppResult<Vec<ThunderstorePackage>> {
    let (thunderstore, hexium) = futures_util::future::join(
        thunderstore_client::fetch_packages(force_refresh),
        hexium_client::fetch_packages(force_refresh),
    )
    .await;

    let thunderstore = thunderstore?;
    let hexium = match hexium {
        Ok(packages) => packages,
        Err(e) => {
            warn!("Failed to fetch Hexium packages: {}", e);
            Vec::new()
        }
    };

    Ok(merge_packages(thunderstore, hexium))
}

/// Package list from the on-disk caches only, never the network. Used for
/// best-effort work such as attributing a local archive to a store package.
pub fn cached_packages() -> Vec<ThunderstorePackage> {
    merge_cached(
        package_cache::load_fresh_cache(&package_cache::cache_dir("thunderstore")),
        package_cache::load_fresh_cache(&package_cache::cache_dir("hexium")),
    )
}

/// Same as [`cached_packages`] but ignoring the freshness window. Detail views
/// use this so a cold in-memory cache does not stall on the network when the
/// UI already has a (possibly older) listing to show.
pub fn cached_packages_any_age() -> Vec<ThunderstorePackage> {
    merge_cached(
        package_cache::load_disk_cache(&package_cache::cache_dir("thunderstore")),
        package_cache::load_disk_cache(&package_cache::cache_dir("hexium")),
    )
}

fn merge_cached(
    thunderstore: Option<Vec<ThunderstorePackage>>,
    hexium: Option<Vec<ThunderstorePackage>>,
) -> Vec<ThunderstorePackage> {
    let hexium = hexium
        .unwrap_or_default()
        .into_iter()
        .map(|mut pkg: ThunderstorePackage| {
            pkg.source = PackageSource::Hexium;
            pkg
        })
        .collect();

    merge_packages(thunderstore.unwrap_or_default(), hexium)
}

/// Merge `secondary` into `primary`. Packages present in both stores are
/// deduplicated: the newest version wins, and ties stay with the primary
/// (Thunderstore) listing. Either way the loser's versions and listing are
/// absorbed, so version history can disclose its store and the UI can link
/// to both pages. Secondary-only packages are appended.
pub fn merge_packages(
    primary: Vec<ThunderstorePackage>,
    secondary: Vec<ThunderstorePackage>,
) -> Vec<ThunderstorePackage> {
    let mut merged = primary;
    let mut index: HashMap<String, usize> = merged
        .iter()
        .enumerate()
        .map(|(i, pkg)| (pkg.full_name.clone(), i))
        .collect();

    for pkg in secondary {
        match index.get(&pkg.full_name) {
            Some(&i) => {
                if is_newer(&pkg, &merged[i]) {
                    let mut winner = pkg;
                    winner.absorb(&merged[i]);
                    merged[i] = winner;
                } else {
                    let mut winner = merged[i].clone();
                    winner.absorb(&pkg);
                    merged[i] = winner;
                }
            }
            None => {
                index.insert(pkg.full_name.clone(), merged.len());
                merged.push(pkg);
            }
        }
    }

    merged
}

/// True when `candidate` carries a strictly newer latest version than `current`.
/// Unparseable or missing versions never win, so ties favor the current entry.
fn is_newer(candidate: &ThunderstorePackage, current: &ThunderstorePackage) -> bool {
    match (latest_version(candidate), latest_version(current)) {
        (Some(candidate), Some(current)) => candidate > current,
        _ => false,
    }
}

fn latest_version(pkg: &ThunderstorePackage) -> Option<semver::Version> {
    pkg.versions
        .first()
        .and_then(|v| semver::Version::parse(&v.version_number).ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::thunderstore::{PackageSource, PackageVersion};

    fn version(version_number: &str) -> PackageVersion {
        PackageVersion {
            name: "Mod".to_string(),
            full_name: "Author-Mod".to_string(),
            version_number: version_number.to_string(),
            dependencies: Vec::new(),
            download_url: format!("https://example.com/{}.zip", version_number),
            downloads: 1,
            description: "desc".to_string(),
            icon: String::new(),
            date_created: "2026-01-01T00:00:00Z".to_string(),
            file_size: 1,
            is_active: true,
            uuid4: None,
            source: PackageSource::Thunderstore,
        }
    }

    fn pkg(full_name: &str, version_number: &str, source: PackageSource) -> ThunderstorePackage {
        ThunderstorePackage {
            name: full_name.rsplit('-').next().unwrap().to_string(),
            full_name: full_name.to_string(),
            owner: full_name.split('-').next().unwrap().to_string(),
            package_url: format!("https://example.com/{}", full_name),
            date_updated: "2026-01-01T00:00:00Z".to_string(),
            is_deprecated: false,
            rating_score: 1,
            versions: vec![version(version_number)],
            categories: Vec::new(),
            is_pinned: false,
            source,
            alternates: Vec::new(),
        }
    }

    #[test]
    fn newest_version_wins_dedupe() {
        let primary = vec![pkg("Author-Mod", "1.0.0", PackageSource::Thunderstore)];
        let secondary = vec![pkg("Author-Mod", "1.0.1", PackageSource::Hexium)];

        let merged = merge_packages(primary, secondary);

        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].source, PackageSource::Hexium);
        assert_eq!(merged[0].versions[0].version_number, "1.0.1");
    }

    #[test]
    fn ties_keep_primary_listing() {
        let primary = vec![pkg("Author-Mod", "1.0.0", PackageSource::Thunderstore)];
        let secondary = vec![pkg("Author-Mod", "1.0.0", PackageSource::Hexium)];

        let merged = merge_packages(primary, secondary);

        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].source, PackageSource::Thunderstore);
    }

    #[test]
    fn older_secondary_versions_do_not_override() {
        let primary = vec![pkg("Author-Mod", "2.0.0", PackageSource::Thunderstore)];
        let secondary = vec![pkg("Author-Mod", "1.9.9", PackageSource::Hexium)];

        let merged = merge_packages(primary, secondary);

        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].source, PackageSource::Thunderstore);
    }

    #[test]
    fn duplicate_listings_absorb_versions_and_alternates() {
        let primary = vec![pkg("Author-Mod", "1.0.0", PackageSource::Thunderstore)];
        let mut hexium = pkg("Author-Mod", "1.1.0", PackageSource::Hexium);
        hexium.versions[0].source = PackageSource::Hexium;
        hexium.package_url = "https://hexium.example/mods/Author/Mod".to_string();

        let merged = merge_packages(primary, vec![hexium]);

        assert_eq!(merged.len(), 1);
        let package = &merged[0];
        // The newer Hexium listing wins...
        assert_eq!(package.source, PackageSource::Hexium);
        // ...but both versions survive, newest first and store-tagged.
        assert_eq!(package.versions.len(), 2);
        assert_eq!(package.versions[0].version_number, "1.1.0");
        assert_eq!(package.versions[0].source, PackageSource::Hexium);
        assert_eq!(package.versions[1].version_number, "1.0.0");
        assert_eq!(package.versions[1].source, PackageSource::Thunderstore);
        // ...and the store it displaced is still linked.
        assert_eq!(package.alternates.len(), 1);
        assert_eq!(package.alternates[0].source, PackageSource::Thunderstore);
    }

    #[test]
    fn secondary_only_packages_are_appended() {
        let primary = vec![pkg("Author-One", "1.0.0", PackageSource::Thunderstore)];
        let secondary = vec![
            pkg("Author-One", "1.0.0", PackageSource::Hexium),
            pkg("Other-Exclusive", "0.1.0", PackageSource::Hexium),
        ];

        let merged = merge_packages(primary, secondary);

        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].full_name, "Author-One");
        assert_eq!(merged[1].full_name, "Other-Exclusive");
        assert_eq!(merged[1].source, PackageSource::Hexium);
    }

    #[test]
    fn unparseable_versions_keep_primary_listing() {
        let primary = vec![pkg("Author-Mod", "1.0.0", PackageSource::Thunderstore)];
        let secondary = vec![pkg("Author-Mod", "not-a-version", PackageSource::Hexium)];

        let merged = merge_packages(primary, secondary);

        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].source, PackageSource::Thunderstore);
    }
}
