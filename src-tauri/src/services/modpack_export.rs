use std::io::{Cursor, Write};
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::Profile;

/// BepInEx ships with every Valheim modpack so a one-click install in another
/// manager sets up the loader too.
const BEPINEX_PACKAGE: &str = "denikson-BepInExPack_Valheim";

/// Thunderstore's description limit, enforced so the zip is upload-ready.
pub const MAX_DESCRIPTION_CHARS: usize = 250;

/// The bundled app icon, used when the export does not supply one.
const DEFAULT_ICON: &[u8] = include_bytes!("../../icons/icon.png");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModpackMetadata {
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub website_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModpackExportResult {
    pub dependencies: Vec<String>,
    /// Enabled store mods left out because they are disabled.
    pub skipped_disabled: Vec<String>,
    /// Mods left out because they were installed by hand.
    pub skipped_manual: Vec<String>,
    pub bepinex_version: Option<String>,
    /// Set when a chosen icon is not a 256x256 PNG.
    pub icon_warning: Option<String>,
}

/// Thunderstore modpack manifest, written as `manifest.json` inside the zip.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModpackManifest {
    name: String,
    version_number: String,
    website_url: String,
    description: String,
    dependencies: Vec<String>,
}

/// Validate modpack metadata against Thunderstore's upload rules.
pub fn validate(metadata: &ModpackMetadata) -> AppResult<()> {
    let name = metadata.name.trim();
    if name.is_empty()
        || name.len() > 128
        || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(AppError::Profile(
            "Modpack names may only contain letters, numbers and underscores".to_string(),
        ));
    }

    if !is_semver(metadata.version.trim()) {
        return Err(AppError::Profile(
            "The version must look like 1.0.0".to_string(),
        ));
    }

    if metadata.description.chars().count() > MAX_DESCRIPTION_CHARS {
        return Err(AppError::Profile(format!(
            "The description must be at most {} characters",
            MAX_DESCRIPTION_CHARS
        )));
    }

    Ok(())
}

/// `major.minor.patch`, with an optional `-prerelease` or `+build` suffix.
fn is_semver(raw: &str) -> bool {
    let core = raw.split(['-', '+']).next().unwrap_or("");
    let parts: Vec<&str> = core.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
}

/// Width and height from a PNG's IHDR chunk, or `None` when it is not a PNG.
fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 24 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" || &bytes[12..16] != b"IHDR" {
        return None;
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
    let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
    Some((width, height))
}

/// Build the Thunderstore modpack zip and report what it contains.
pub fn build_modpack(
    profile: &Profile,
    metadata: &ModpackMetadata,
    icon: Option<&[u8]>,
    bepinex_version: Option<&str>,
) -> AppResult<(Vec<u8>, ModpackExportResult)> {
    validate(metadata)?;

    let mut dependencies = Vec::new();
    let mut skipped_disabled = Vec::new();
    let mut skipped_manual = Vec::new();

    for module in &profile.mods {
        if module.full_name.is_empty() {
            continue;
        }
        if module.manual {
            skipped_manual.push(module.full_name.clone());
            continue;
        }
        if !module.enabled {
            skipped_disabled.push(module.full_name.clone());
            continue;
        }
        dependencies.push(format!("{}-{}", module.full_name, module.version));
    }

    if let Some(version) = bepinex_version {
        dependencies.insert(0, format!("{}-{}", BEPINEX_PACKAGE, version));
    }

    let icon_bytes = icon.unwrap_or(DEFAULT_ICON);
    let icon_warning = match icon {
        Some(bytes) if png_dimensions(bytes) != Some((256, 256)) => {
            Some("The icon should be a 256x256 PNG so the modpack is upload-ready".to_string())
        }
        _ => None,
    };

    let manifest = ModpackManifest {
        name: metadata.name.trim().to_string(),
        version_number: metadata.version.trim().to_string(),
        website_url: metadata.website_url.trim().to_string(),
        description: metadata.description.trim().to_string(),
        dependencies: dependencies.clone(),
    };

    let readme = build_readme(
        profile,
        metadata,
        &dependencies,
        &skipped_disabled,
        &skipped_manual,
    );

    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("manifest.json", options)?;
    zip.write_all(serde_json::to_string_pretty(&manifest)?.as_bytes())?;
    zip.start_file("README.md", options)?;
    zip.write_all(readme.as_bytes())?;
    zip.start_file("icon.png", options)?;
    zip.write_all(icon_bytes)?;

    let bytes = zip.finish()?.into_inner();

    Ok((
        bytes,
        ModpackExportResult {
            dependencies,
            skipped_disabled,
            skipped_manual,
            bepinex_version: bepinex_version.map(str::to_string),
            icon_warning,
        },
    ))
}

fn build_readme(
    profile: &Profile,
    metadata: &ModpackMetadata,
    dependencies: &[String],
    skipped_disabled: &[String],
    skipped_manual: &[String],
) -> String {
    let mut readme = String::new();
    readme.push_str(&format!("# {}\n\n", metadata.name.trim()));
    let description = metadata.description.trim();
    readme.push_str(&format!(
        "{}\n\n",
        if description.is_empty() {
            profile.description.trim()
        } else {
            description
        }
    ));

    readme.push_str(&format!("## Mods ({})\n\n", dependencies.len()));
    for module in &profile.mods {
        if module.manual || !module.enabled || module.full_name.is_empty() {
            continue;
        }
        readme.push_str(&format!(
            "- {} v{} by {}\n",
            module.name, module.version, module.author
        ));
    }

    if !skipped_disabled.is_empty() {
        readme.push_str(&format!(
            "\n_Disabled mods not included: {}._\n",
            skipped_disabled.join(", ")
        ));
    }
    if !skipped_manual.is_empty() {
        readme.push_str(&format!(
            "\n_Manually installed mods not included: {}._\n",
            skipped_manual.join(", ")
        ));
    }

    readme.push_str("\n---\n\nGenerated by Macheim.\n");
    readme
}

/// Read an icon file for an export, rejecting anything that is not a PNG.
pub fn read_icon(path: &Path) -> AppResult<Vec<u8>> {
    let bytes = std::fs::read(path)?;
    if png_dimensions(&bytes).is_none() {
        return Err(AppError::Profile(format!(
            "{} is not a PNG image",
            path.display()
        )));
    }
    Ok(bytes)
}

/// The installed BepInEx version, when Macheim can find one. The loader lives
/// outside the profile, so this reads the game folder's BepInEx install.
pub fn detect_bepinex_version(game_path: &Path) -> Option<String> {
    let game_root = crate::services::game_detector::get_valheim_root(game_path);
    crate::services::bepinex_installer::check_bepinex_status(&game_root).version
}

/// The BepInExPack version to depend on in a modpack.
///
/// Thunderstore only accepts published versions, so the locally installed
/// version is used when it matches one and the newest published version
/// otherwise. Local file versions (Doorstop's, or the loader's own assembly
/// version) do not match the package numbering.
pub fn resolve_bepinex_version(
    detected: Option<&str>,
    packages: &[crate::models::ThunderstorePackage],
) -> Option<String> {
    let package = packages
        .iter()
        .find(|package| package.full_name == BEPINEX_PACKAGE)?;

    if let Some(detected) = detected {
        if package
            .versions
            .iter()
            .any(|version| version.version_number == detected)
        {
            return Some(detected.to_string());
        }
    }

    // Versions arrive newest-first.
    package
        .versions
        .first()
        .map(|version| version.version_number.clone())
}

/// Resolve the BepInEx dependency for an export or publish: the installed
/// version when it is published, the newest published version otherwise.
pub async fn resolve_installed_bepinex(game_path: Option<&Path>) -> Option<String> {
    let detected = game_path.and_then(detect_bepinex_version);

    let packages = match crate::services::package_sources::fetch_all_packages(false).await {
        Ok(packages) => packages,
        Err(error) => {
            tracing::warn!(
                "Could not refresh packages for the BepInEx version ({}); using the cache",
                error
            );
            crate::services::package_sources::cached_packages_any_age()
        }
    };

    resolve_bepinex_version(detected.as_deref(), &packages)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{InstalledAs, InstalledMod};

    fn module(full_name: &str, version: &str) -> InstalledMod {
        let (author, name) = full_name.split_once('-').unwrap_or((full_name, full_name));
        InstalledMod {
            full_name: full_name.to_string(),
            author: author.to_string(),
            name: name.to_string(),
            version: version.to_string(),
            description: String::new(),
            enabled: true,
            dependencies: Vec::new(),
            installed_at: String::new(),
            icon: String::new(),
            manual: false,
            pinned: false,
            installed_as: InstalledAs::Explicit,
        }
    }

    fn metadata() -> ModpackMetadata {
        ModpackMetadata {
            name: "My_Pack".to_string(),
            version: "1.0.0".to_string(),
            description: "A test pack".to_string(),
            website_url: String::new(),
        }
    }

    fn png(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
        bytes.extend_from_slice(&[0, 0, 0, 13]);
        bytes.extend_from_slice(b"IHDR");
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.extend_from_slice(&height.to_be_bytes());
        bytes.extend_from_slice(&[8, 6, 0, 0, 0]);
        bytes
    }

    fn bepinex_package(versions: &[&str]) -> crate::models::ThunderstorePackage {
        use crate::models::{PackageSource, PackageVersion, ThunderstorePackage};

        ThunderstorePackage {
            name: "BepInExPack_Valheim".to_string(),
            full_name: BEPINEX_PACKAGE.to_string(),
            owner: "denikson".to_string(),
            package_url: String::new(),
            date_updated: String::new(),
            is_deprecated: false,
            rating_score: 0,
            versions: versions
                .iter()
                .map(|version| PackageVersion {
                    name: "BepInExPack_Valheim".to_string(),
                    full_name: format!("{}-{}", BEPINEX_PACKAGE, version),
                    version_number: version.to_string(),
                    dependencies: Vec::new(),
                    download_url: String::new(),
                    downloads: 0,
                    description: String::new(),
                    icon: String::new(),
                    date_created: String::new(),
                    file_size: 0,
                    is_active: true,
                    uuid4: None,
                    sources: Vec::new(),
                })
                .collect(),
            categories: Vec::new(),
            is_pinned: false,
            source: PackageSource::Thunderstore,
            alternates: Vec::new(),
        }
    }

    fn manifest_from(zip_bytes: &[u8]) -> ModpackManifest {
        let mut archive = zip::ZipArchive::new(Cursor::new(zip_bytes.to_vec())).unwrap();
        let mut entry = archive.by_name("manifest.json").unwrap();
        let mut raw = String::new();
        std::io::Read::read_to_string(&mut entry, &mut raw).unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    fn read_entry(zip_bytes: &[u8], name: &str) -> Vec<u8> {
        let mut archive = zip::ZipArchive::new(Cursor::new(zip_bytes.to_vec())).unwrap();
        let mut entry = archive.by_name(name).unwrap();
        let mut bytes = Vec::new();
        std::io::Read::read_to_end(&mut entry, &mut bytes).unwrap();
        bytes
    }

    fn profile() -> Profile {
        let mut profile = Profile::new("Test".to_string(), "Profile description".to_string());
        profile.mods.push(module("Author-ModA", "1.2.3"));
        profile.mods.push(module("Author-ModB", "0.9.0"));
        profile.mods.push({
            let mut disabled = module("Author-Disabled", "1.0.0");
            disabled.enabled = false;
            disabled
        });
        profile.mods.push({
            let mut manual = module("Local-Handmade", "2.0.0");
            manual.manual = true;
            manual
        });
        profile
    }

    #[test]
    fn manifest_round_trips_with_exact_versions_and_bepinex_first() {
        let (bytes, result) =
            build_modpack(&profile(), &metadata(), None, Some("5.4.2350")).unwrap();

        let manifest = manifest_from(&bytes);
        assert_eq!(manifest.name, "My_Pack");
        assert_eq!(manifest.version_number, "1.0.0");
        assert_eq!(manifest.description, "A test pack");
        assert_eq!(
            manifest.dependencies,
            vec![
                "denikson-BepInExPack_Valheim-5.4.2350",
                "Author-ModA-1.2.3",
                "Author-ModB-0.9.0",
            ]
        );
        assert_eq!(result.bepinex_version.as_deref(), Some("5.4.2350"));
        assert_eq!(result.skipped_disabled, vec!["Author-Disabled"]);
        assert_eq!(result.skipped_manual, vec!["Local-Handmade"]);
    }

    #[test]
    fn bepinex_is_omitted_when_its_version_is_unknown() {
        let (bytes, result) = build_modpack(&profile(), &metadata(), None, None).unwrap();

        let manifest = manifest_from(&bytes);
        assert!(!manifest
            .dependencies
            .iter()
            .any(|dep| dep.starts_with("denikson-BepInExPack")));
        assert!(result.bepinex_version.is_none());
    }

    #[test]
    fn zip_carries_a_readme_and_the_default_icon() {
        let (bytes, result) = build_modpack(&profile(), &metadata(), None, None).unwrap();

        let readme = String::from_utf8(read_entry(&bytes, "README.md")).unwrap();
        assert!(readme.contains("# My_Pack"));
        assert!(readme.contains("ModA v1.2.3 by Author"));
        assert!(readme.contains("Generated by Macheim"));
        assert_eq!(read_entry(&bytes, "icon.png"), DEFAULT_ICON.to_vec());
        assert!(result.icon_warning.is_none());
    }

    #[test]
    fn a_non_256_icon_warns_but_still_exports() {
        let icon = png(512, 512);

        let (bytes, result) = build_modpack(&profile(), &metadata(), Some(&icon), None).unwrap();

        assert!(result.icon_warning.is_some());
        assert_eq!(read_entry(&bytes, "icon.png"), icon);
    }

    #[test]
    fn a_256_icon_does_not_warn() {
        let icon = png(256, 256);

        let (_, result) = build_modpack(&profile(), &metadata(), Some(&icon), None).unwrap();

        assert!(result.icon_warning.is_none());
    }

    #[test]
    fn validation_follows_store_rules() {
        let mut bad_name = metadata();
        bad_name.name = "Not Allowed!".to_string();
        assert!(validate(&bad_name).is_err());

        let mut bad_version = metadata();
        bad_version.version = "1.0".to_string();
        assert!(validate(&bad_version).is_err());

        let mut long_description = metadata();
        long_description.description = "x".repeat(MAX_DESCRIPTION_CHARS + 1);
        assert!(validate(&long_description).is_err());

        assert!(validate(&metadata()).is_ok());
    }

    #[test]
    fn bepinex_uses_the_installed_version_when_it_is_published() {
        let packages = vec![bepinex_package(&["5.4.2350", "5.4.2100"])];

        assert_eq!(
            resolve_bepinex_version(Some("5.4.2100"), &packages).as_deref(),
            Some("5.4.2100")
        );
    }

    #[test]
    fn bepinex_falls_back_to_the_newest_published_version() {
        let packages = vec![bepinex_package(&["5.4.2350", "5.4.2100"])];

        // A local file version (Doorstop's, or the loader's assembly version)
        // never matches the package numbering.
        assert_eq!(
            resolve_bepinex_version(Some("4.4.0"), &packages).as_deref(),
            Some("5.4.2350")
        );
        assert_eq!(
            resolve_bepinex_version(None, &packages).as_deref(),
            Some("5.4.2350")
        );
    }

    #[test]
    fn bepinex_is_omitted_without_a_published_package() {
        assert_eq!(resolve_bepinex_version(Some("5.4.2350"), &[]), None);
        assert_eq!(
            resolve_bepinex_version(Some("5.4.2350"), &[bepinex_package(&[])]),
            None
        );
    }

    #[test]
    fn read_icon_rejects_non_png_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("icon.txt");
        std::fs::write(&path, b"not an image").unwrap();

        assert!(read_icon(&path).is_err());

        let png_path = dir.path().join("icon.png");
        std::fs::write(&png_path, png(256, 256)).unwrap();
        assert!(read_icon(&png_path).is_ok());
    }
}
