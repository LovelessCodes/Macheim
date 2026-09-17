use tracing::debug;

use crate::error::AppResult;
use crate::models::thunderstore::{PackageSource, ThunderstorePackage};
use crate::services::package_cache;

/// Hexium exposes a Thunderstore-compatible v1 package API for Valheim.
const HEXIUM_API_URL: &str = "https://hexium.gg/c/valheim/api/v1/package/";

/// Fetch all Valheim packages from the Hexium API.
/// Uses disk cache if available and fresh (< 30 minutes).
pub async fn fetch_packages(force_refresh: bool) -> AppResult<Vec<ThunderstorePackage>> {
    let packages = package_cache::fetch_cached_packages::<ThunderstorePackage>(
        HEXIUM_API_URL,
        &package_cache::cache_dir("hexium"),
        force_refresh,
    )
    .await?;

    debug!("Fetched {} packages from Hexium", packages.len());

    Ok(packages
        .into_iter()
        .map(|mut pkg| {
            pkg.source = PackageSource::Hexium;
            pkg
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_hexium_payload_as_thunderstore_package() {
        let raw = r#"[
            {
                "name": "TurretRevamped",
                "full_name": "blacks7ar-TurretRevamped",
                "owner": "blacks7ar",
                "package_url": "https://valheim.hexium.gg/mods/blacks7ar/TurretRevamped",
                "donation_link": null,
                "date_created": "2026-09-17T10:43:06.000000Z",
                "date_updated": "2026-09-17T10:43:07.000000Z",
                "uuid4": "a8aa985c-8d67-45cf-9f3f-d12cefa0cb70",
                "rating_score": 1,
                "is_pinned": false,
                "is_deprecated": false,
                "has_nsfw_content": false,
                "categories": ["Combat", "Quality of Life"],
                "versions": [
                    {
                        "name": "TurretRevamped",
                        "full_name": "blacks7ar-TurretRevamped-1.0.4",
                        "description": "Automates ammo feeding.",
                        "icon": "https://cdn.hexium.gg/upload/1277/icon.png",
                        "version_number": "1.0.4",
                        "dependencies": ["denikson-BepInExPack_Valheim-5.4.2350"],
                        "suggestions": [],
                        "download_url": "https://cdn.hexium.gg/upload/1277/1.0.4.zip",
                        "downloads": 24547,
                        "date_created": "2026-09-17T10:43:07.000000Z",
                        "website_url": "",
                        "is_active": true,
                        "uuid4": "00000eef-0000-4000-8000-000000000eef",
                        "file_size": 152293
                    }
                ]
            }
        ]"#;

        let packages: Vec<ThunderstorePackage> = serde_json::from_str(raw).unwrap();

        assert_eq!(packages.len(), 1);
        assert_eq!(packages[0].full_name, "blacks7ar-TurretRevamped");
        assert_eq!(packages[0].versions[0].version_number, "1.0.4");
        assert_eq!(
            packages[0].versions[0].download_url,
            "https://cdn.hexium.gg/upload/1277/1.0.4.zip"
        );
    }
}
