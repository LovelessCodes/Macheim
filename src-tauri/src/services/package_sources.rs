use std::collections::HashMap;

use tracing::warn;

use crate::error::AppResult;
use crate::models::thunderstore::ThunderstorePackage;
use crate::services::{hexium_client, thunderstore_client};

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

/// Merge `secondary` into `primary`. Packages present in both stores are
/// deduplicated: the newest version wins, and ties stay with the primary
/// (Thunderstore) listing. Secondary-only packages are appended.
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
                    merged[i] = pkg;
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
