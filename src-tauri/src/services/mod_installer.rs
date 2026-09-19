use std::ffi::OsStr;
use std::io::Read;
use std::path::Path;

use tracing::{debug, info, warn};

use crate::error::{AppError, AppResult};
use crate::models::{
    InstalledMod, Manifest, PackageVersion, ParsedDependency, ThunderstorePackage,
};
use crate::services::gatekeeper;
use crate::services::thunderstore_client;

/// Metadata derived from a local ZIP, used when installing from file.
#[derive(Debug, Clone, PartialEq)]
pub struct LocalModInfo {
    pub author: String,
    pub name: String,
    pub full_name: String,
    pub version: Option<String>,
    pub description: String,
    /// Store icon, when the archive could be matched to a package.
    pub icon: Option<String>,
    pub dependencies: Vec<String>,
}

/// Describe a local mod archive without storing it.
///
/// Thunderstore's `manifest.json` has no author field, so identity comes from
/// matching the archive against the known package list (name + version, and
/// the dependency list when several owners share a name). When there is no
/// match or no package list, the file name (`Owner-Name-Version.zip`, the
/// shape Thunderstore serves) supplies the owner. Raw plugin zips with no
/// usable hints install as `Local-<file name>`.
pub fn describe_local_zip(
    path: &Path,
    zip_bytes: &[u8],
    packages: &[ThunderstorePackage],
) -> AppResult<LocalModInfo> {
    let manifest = read_manifest(zip_bytes)?;
    let parsed = parse_file_identity(path);

    // Name/version hints used to look the archive up in the store.
    let (hint_name, hint_version, manifest_description, manifest_dependencies) = match &manifest {
        Some(manifest) => (
            Some(manifest.name.clone()),
            Some(manifest.version_number.clone()),
            manifest.description.clone(),
            manifest.dependencies.clone(),
        ),
        None => match &parsed {
            Some(parsed) => (
                Some(parsed.name.clone()),
                Some(parsed.version.clone()),
                String::new(),
                Vec::new(),
            ),
            None => (None, None, String::new(), Vec::new()),
        },
    };

    if let (Some(name), Some(version)) = (&hint_name, &hint_version) {
        if let Some((pkg, ver)) = find_store_match(packages, name, version, &manifest_dependencies)
        {
            debug!("Local archive matches store package {}", pkg.full_name);
            return Ok(LocalModInfo {
                author: pkg.owner.clone(),
                name: pkg.name.clone(),
                full_name: pkg.full_name.clone(),
                version: Some(ver.version_number.clone()),
                description: if manifest_description.trim().is_empty() {
                    ver.description.clone()
                } else {
                    manifest_description
                },
                icon: (!ver.icon.is_empty()).then(|| ver.icon.clone()),
                dependencies: if manifest_dependencies.is_empty() {
                    ver.dependencies.clone()
                } else {
                    manifest_dependencies
                },
            });
        }
    }

    // No store match. Prefer manifest identity, borrowed author from the file
    // name when the manifest omits it (Thunderstore never writes one).
    if let Some(manifest) = manifest {
        let author = sanitize_component(&manifest.author.unwrap_or_default())
            .or_else(|| parsed.as_ref().and_then(|p| sanitize_component(&p.author)))
            .unwrap_or_else(|| "Local".to_string());
        let name = sanitize_component(&manifest.name).unwrap_or_else(|| fallback_name(path));
        return Ok(LocalModInfo {
            full_name: format!("{}-{}", author, name),
            author,
            name,
            version: Some(manifest.version_number),
            description: manifest.description,
            icon: None,
            dependencies: manifest.dependencies,
        });
    }

    // Raw zip: the file name is the only identity we have.
    if let Some(parsed) = parsed {
        let author = sanitize_component(&parsed.author).unwrap_or_else(|| "Local".to_string());
        let name = sanitize_component(&parsed.name).unwrap_or_else(|| fallback_name(path));
        return Ok(LocalModInfo {
            full_name: format!("{}-{}", author, name),
            author,
            name,
            version: Some(parsed.version),
            description: "Installed from a local archive".to_string(),
            icon: None,
            dependencies: Vec::new(),
        });
    }

    let name = fallback_name(path);
    Ok(LocalModInfo {
        full_name: format!("Local-{}", name),
        author: "Local".to_string(),
        name,
        version: None,
        description: "Installed from a local archive".to_string(),
        icon: None,
        dependencies: Vec::new(),
    })
}

/// Find the store package an archive belongs to. Exact name + version always
/// match; when several owners publish the same name, the dependency list has
/// to agree as well, otherwise the archive stays unattributed.
fn find_store_match<'a>(
    packages: &'a [ThunderstorePackage],
    name: &str,
    version: &str,
    dependencies: &[String],
) -> Option<(&'a ThunderstorePackage, &'a PackageVersion)> {
    let matches: Vec<(&ThunderstorePackage, &PackageVersion)> = packages
        .iter()
        .filter(|pkg| pkg.name == name)
        .filter_map(|pkg| {
            pkg.versions
                .iter()
                .find(|v| v.version_number == version)
                .map(|ver| (pkg, ver))
        })
        .collect();

    match matches.len() {
        0 => None,
        1 => Some(matches[0]),
        _ => {
            let exact: Vec<_> = matches
                .iter()
                .copied()
                .filter(|(_, ver)| same_dependencies(&ver.dependencies, dependencies))
                .collect();
            (exact.len() == 1).then(|| exact[0])
        }
    }
}

fn same_dependencies(a: &[String], b: &[String]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut a: Vec<&String> = a.iter().collect();
    let mut b: Vec<&String> = b.iter().collect();
    a.sort();
    b.sort();
    a == b
}

/// Read `manifest.json` from a mod ZIP. Thunderstore packages put it at the
/// root; some repacks wrap the payload in a single top-level folder.
pub fn read_manifest(zip_bytes: &[u8]) -> AppResult<Option<Manifest>> {
    let cursor = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(cursor)?;

    let mut found: Option<(usize, Manifest)> = None;
    for index in 0..archive.len() {
        let mut file = archive.by_index(index)?;
        let path = file.mangled_name();
        if path.file_name() != Some(OsStr::new("manifest.json")) {
            continue;
        }
        let depth = path.components().count().saturating_sub(1);
        if depth > 1 {
            continue;
        }

        let mut raw = String::new();
        if file.read_to_string(&mut raw).is_err() {
            continue;
        }
        match serde_json::from_str::<Manifest>(&raw) {
            Ok(manifest) => {
                if found.as_ref().is_none_or(|(best, _)| depth < *best) {
                    found = Some((depth, manifest));
                }
            }
            Err(e) => warn!("Ignoring unreadable manifest.json in local archive: {}", e),
        }
    }

    Ok(found.map(|(_, manifest)| manifest))
}

/// Parse `Owner-Name-Version.zip` (the download shape Thunderstore serves).
fn parse_file_identity(path: &Path) -> Option<ParsedDependency> {
    let stem = path.file_stem()?.to_string_lossy();
    let stem = strip_copy_suffix(&stem);
    ParsedDependency::parse(&stem)
}

/// Browsers append ` (1)`, ` (2)`, ... to repeated downloads.
fn strip_copy_suffix(stem: &str) -> String {
    let trimmed = stem.trim();
    if let Some(without_close) = trimmed.strip_suffix(')') {
        if let Some(open) = without_close.rfind(" (") {
            let counter = &without_close[open + 2..];
            if !counter.is_empty() && counter.chars().all(|c| c.is_ascii_digit()) {
                return trimmed[..open].to_string();
            }
        }
    }
    trimmed.to_string()
}

/// Turn a manifest field into a safe file-name component. Returns None when
/// nothing usable remains.
fn sanitize_component(raw: &str) -> Option<String> {
    let cleaned: String = raw
        .trim()
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, '/' | '\\' | ':') {
                '_'
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned.trim_matches([' ', '.']).trim().to_string();
    if cleaned.is_empty() || cleaned.len() > 120 {
        return None;
    }
    Some(cleaned)
}

fn fallback_name(path: &Path) -> String {
    path.file_stem()
        .and_then(|stem| sanitize_component(&strip_copy_suffix(&stem.to_string_lossy())))
        .unwrap_or_else(|| "LocalMod".to_string())
}

/// Install a mod from a ZIP downloaded from Thunderstore.
/// Returns the InstalledMod metadata.
pub async fn install_mod(
    author: &str,
    name: &str,
    version: &str,
    download_url: &str,
    description: &str,
    icon: &str,
    dependencies: &[String],
    game_root: &Path,
) -> AppResult<InstalledMod> {
    let full_name = format!("{}-{}", author, name);
    info!("Installing mod: {} v{}", full_name, version);

    // Download the mod ZIP
    let zip_bytes = thunderstore_client::download_mod(download_url).await?;

    // Install from bytes
    install_mod_from_bytes(
        author,
        name,
        version,
        description,
        icon,
        dependencies,
        &zip_bytes,
        game_root,
    )
}

/// Install a mod from ZIP bytes (used by both direct install and dependency install).
pub fn install_mod_from_bytes(
    author: &str,
    name: &str,
    version: &str,
    description: &str,
    icon: &str,
    dependencies: &[String],
    zip_bytes: &[u8],
    game_root: &Path,
) -> AppResult<InstalledMod> {
    let full_name = format!("{}-{}", author, name);
    crate::services::profile_manager::validate_name(&full_name)?;
    crate::services::compatibility::reject_symlink_ancestors(&game_root.join("BepInEx"))?;

    // Extract ZIP to temp directory for analysis
    let temp_dir = tempfile::tempdir()?;
    extract_zip(zip_bytes, temp_dir.path())?;

    // Analyze the mod structure and copy to appropriate locations
    let bepinex_dir = game_root.join("BepInEx");
    install_mod_files(temp_dir.path(), &full_name, &bepinex_dir)?;

    // Remove quarantine from any .dylib files
    let plugins_dir = bepinex_dir.join("plugins").join(&full_name);
    if plugins_dir.exists() {
        gatekeeper::remove_quarantine_from_dylibs(&plugins_dir)?;
    }

    let installed = InstalledMod {
        full_name,
        author: author.to_string(),
        name: name.to_string(),
        version: version.to_string(),
        description: description.to_string(),
        enabled: true,
        dependencies: dependencies.to_vec(),
        installed_at: chrono::Utc::now().to_rfc3339(),
        icon: icon.to_string(),
        manual: false,
    };

    info!(
        "Mod installed: {} v{}",
        installed.full_name, installed.version
    );
    Ok(installed)
}

/// Analyze mod structure and copy files to the correct BepInEx directories.
fn install_mod_files(extracted_dir: &Path, mod_name: &str, bepinex_dir: &Path) -> AppResult<()> {
    let plugins_dir = bepinex_dir.join("plugins").join(mod_name);
    let patchers_dir = bepinex_dir.join("patchers");
    let config_dir = bepinex_dir.join("config");

    // Check for standard mod structure
    let has_plugins = extracted_dir.join("plugins").exists();
    let has_patchers = extracted_dir.join("patchers").exists();
    let has_config = extracted_dir.join("config").exists();

    if has_plugins || has_patchers || has_config {
        // Standard Thunderstore mod structure
        if has_plugins {
            std::fs::create_dir_all(&plugins_dir)?;
            copy_dir_contents(&extracted_dir.join("plugins"), &plugins_dir)?;
            debug!("Copied plugins/ to {}", plugins_dir.display());
        }

        if has_patchers {
            std::fs::create_dir_all(&patchers_dir)?;
            copy_dir_contents(&extracted_dir.join("patchers"), &patchers_dir)?;
            debug!("Copied patchers/ to {}", patchers_dir.display());
        }

        if has_config {
            std::fs::create_dir_all(&config_dir)?;
            copy_config_defaults(&extracted_dir.join("config"), &config_dir)?;
            debug!("Copied config/ to {}", config_dir.display());
        }
    }

    // Some packages (including Therzie's mods) combine config/ with root DLLs.
    // Route those files independently of the standard directories above.
    let has_root_dlls = has_dll_files(extracted_dir);

    if has_root_dlls {
        // Treat root DLLs as plugins
        std::fs::create_dir_all(&plugins_dir)?;
        copy_files_by_extension(extracted_dir, &plugins_dir, &["dll", "dylib", "so"])?;
        debug!("Copied root DLLs to {}", plugins_dir.display());
    }

    // Standard directories are excluded by this helper; keep root assets too.
    copy_non_metadata_files(extracted_dir, &plugins_dir)?;

    Ok(())
}

/// Uninstall a mod by removing its files.
pub fn uninstall_mod(mod_full_name: &str, game_root: &Path) -> AppResult<()> {
    crate::services::profile_manager::validate_name(mod_full_name)?;
    info!("Uninstalling mod: {}", mod_full_name);

    let bepinex_dir = game_root.join("BepInEx");

    // Remove from plugins
    let plugins_dir = bepinex_dir.join("plugins").join(mod_full_name);
    if plugins_dir.exists() {
        crate::services::compatibility::reject_symlink_ancestors(&plugins_dir)?;
        if plugins_dir.is_file() {
            std::fs::remove_file(&plugins_dir)?;
        } else {
            std::fs::remove_dir_all(&plugins_dir)?;
        }
        debug!("Removed plugins: {}", plugins_dir.display());
    }

    // Also check plugins_disabled
    let disabled_dir = bepinex_dir.join("plugins_disabled").join(mod_full_name);
    if disabled_dir.exists() {
        crate::services::compatibility::reject_symlink_ancestors(&disabled_dir)?;
        if disabled_dir.is_file() {
            std::fs::remove_file(&disabled_dir)?;
        } else {
            std::fs::remove_dir_all(&disabled_dir)?;
        }
        debug!("Removed disabled plugins: {}", disabled_dir.display());
    }

    info!("Mod uninstalled: {}", mod_full_name);
    Ok(())
}

/// Enable or disable a mod by moving it between plugins/ and plugins_disabled/.
pub fn toggle_mod(mod_full_name: &str, enable: bool, game_root: &Path) -> AppResult<bool> {
    crate::services::profile_manager::validate_name(mod_full_name)?;
    let bepinex_dir = game_root.join("BepInEx");
    let plugins_dir = bepinex_dir.join("plugins").join(mod_full_name);
    let disabled_dir = bepinex_dir.join("plugins_disabled").join(mod_full_name);

    if enable {
        // Move from disabled to plugins
        if disabled_dir.exists() {
            std::fs::create_dir_all(bepinex_dir.join("plugins"))?;
            move_dir(&disabled_dir, &plugins_dir)?;
            info!("Enabled mod: {}", mod_full_name);
            Ok(true)
        } else if plugins_dir.exists() {
            // Already enabled
            Ok(true)
        } else {
            Err(AppError::Mod(format!(
                "Mod '{}' files not found",
                mod_full_name
            )))
        }
    } else {
        // Move from plugins to disabled
        if plugins_dir.exists() {
            std::fs::create_dir_all(bepinex_dir.join("plugins_disabled"))?;
            move_dir(&plugins_dir, &disabled_dir)?;
            info!("Disabled mod: {}", mod_full_name);
            Ok(false)
        } else if disabled_dir.exists() {
            // Already disabled
            Ok(false)
        } else {
            Err(AppError::Mod(format!(
                "Mod '{}' files not found",
                mod_full_name
            )))
        }
    }
}

/// Get list of installed mods by scanning the BepInEx/plugins directory.
pub fn scan_installed_mods(game_root: &Path) -> AppResult<Vec<String>> {
    let plugins_dir = game_root.join("BepInEx").join("plugins");
    let mut mods = Vec::new();

    if plugins_dir.exists() {
        for entry in std::fs::read_dir(&plugins_dir)? {
            let entry = entry?;
            if entry.path().is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                // Skip internal BepInEx directories
                if !name.starts_with('.') {
                    mods.push(name);
                }
            }
        }
    }

    Ok(mods)
}

// --- Helper functions ---

fn extract_zip(zip_bytes: &[u8], target: &Path) -> AppResult<()> {
    let cursor = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(cursor)?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let outpath = target.join(file.mangled_name());

        if file.is_dir() {
            std::fs::create_dir_all(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;
        }
    }

    Ok(())
}

fn copy_dir_contents(src: &Path, dst: &Path) -> AppResult<()> {
    crate::services::compatibility::reject_symlink_ancestors(dst)?;
    if !src.is_dir() {
        return Ok(());
    }

    std::fs::create_dir_all(dst)?;

    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        crate::services::compatibility::reject_symlink_ancestors(&dst_path)?;

        if src_path.is_dir() {
            copy_dir_contents(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}

fn move_dir(src: &Path, dst: &Path) -> AppResult<()> {
    crate::services::compatibility::reject_symlink_ancestors(src)?;
    crate::services::compatibility::reject_symlink_ancestors(dst)?;
    if dst.exists() {
        return Err(AppError::Mod(
            "Both enabled and disabled copies exist. Back them up and resolve the conflict first."
                .into(),
        ));
    }
    // Try rename first (fast, same filesystem)
    if std::fs::rename(src, dst).is_ok() {
        return Ok(());
    }

    // Fallback: copy then remove
    if src.is_file() {
        std::fs::copy(src, dst)?;
        std::fs::remove_file(src)?;
    } else {
        copy_dir_contents(src, dst)?;
        std::fs::remove_dir_all(src)?;
    }
    Ok(())
}

fn copy_config_defaults(src: &Path, dst: &Path) -> AppResult<()> {
    crate::services::compatibility::reject_symlink_ancestors(dst)?;
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let dest = dst.join(entry.file_name());
        crate::services::compatibility::reject_symlink_ancestors(&dest)?;
        if entry.path().is_dir() {
            copy_config_defaults(&entry.path(), &dest)?;
        } else if !dest.exists() {
            std::fs::copy(entry.path(), dest)?;
        }
    }
    Ok(())
}

fn has_dll_files(dir: &Path) -> bool {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Some(ext) = entry.path().extension() {
                if ext == "dll" || ext == "dylib" || ext == "so" {
                    return true;
                }
            }
        }
    }
    false
}

fn copy_files_by_extension(src: &Path, dst: &Path, extensions: &[&str]) -> AppResult<()> {
    std::fs::create_dir_all(dst)?;

    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if extensions.iter().any(|e| ext == *e) {
                    let dst_file = dst.join(entry.file_name());
                    crate::services::compatibility::reject_symlink_ancestors(&dst_file)?;
                    std::fs::copy(&path, &dst_file)?;
                }
            }
        }
    }

    Ok(())
}

fn copy_non_metadata_files(src: &Path, dst: &Path) -> AppResult<()> {
    let skip_files = [
        "manifest.json",
        "icon.png",
        "README.md",
        "CHANGELOG.md",
        "LICENSE",
    ];

    std::fs::create_dir_all(dst)?;

    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if path.is_file() && !skip_files.contains(&name.as_str()) {
            let dst_file = dst.join(&name);
            if !dst_file.exists() {
                std::fs::copy(&path, &dst_file)?;
            }
        } else if path.is_dir() {
            let dir_name = name.to_lowercase();
            // Skip standard Thunderstore directories already handled
            if dir_name != "plugins" && dir_name != "patchers" && dir_name != "config" {
                let dst_subdir = dst.join(&name);
                copy_dir_contents(&path, &dst_subdir)?;
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn zip_bytes(entries: &[(&str, &str)]) -> Vec<u8> {
        use std::io::Write;

        let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, contents) in entries {
            writer
                .start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(contents.as_bytes()).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    const MANIFEST: &str = r#"{
        "name": "CoolMod",
        "version_number": "1.2.3",
        "description": "Does cool things",
        "dependencies": ["Author-Dep-1.0.0"],
        "website_url": "",
        "author": "Someone"
    }"#;

    /// Thunderstore manifests never include an author.
    const AUTHORLESS_MANIFEST: &str = r#"{
        "name": "CoolMod",
        "version_number": "1.2.3",
        "description": "Does cool things",
        "dependencies": ["Author-Dep-1.0.0"]
    }"#;

    fn store_package(
        name: &str,
        owner: &str,
        version: &str,
        dependencies: &[&str],
        icon: &str,
    ) -> crate::models::ThunderstorePackage {
        use crate::models::{PackageSource, PackageVersion, ThunderstorePackage};

        ThunderstorePackage {
            name: name.to_string(),
            full_name: format!("{}-{}", owner, name),
            owner: owner.to_string(),
            package_url: String::new(),
            date_updated: String::new(),
            is_deprecated: false,
            rating_score: 0,
            versions: vec![PackageVersion {
                name: name.to_string(),
                full_name: format!("{}-{}-{}", owner, name, version),
                version_number: version.to_string(),
                dependencies: dependencies.iter().map(|dep| dep.to_string()).collect(),
                download_url: String::new(),
                downloads: 0,
                description: format!("{} from the store", name),
                icon: icon.to_string(),
                date_created: String::new(),
                file_size: 0,
                is_active: true,
                uuid4: None,
            }],
            categories: Vec::new(),
            is_pinned: false,
            source: PackageSource::Thunderstore,
        }
    }

    #[test]
    fn local_zip_with_manifest_keeps_published_identity() {
        let bytes = zip_bytes(&[
            ("manifest.json", MANIFEST),
            ("plugins/CoolMod.dll", "binary"),
        ]);

        let info = describe_local_zip(Path::new("/tmp/cool.zip"), &bytes, &[]).unwrap();

        assert_eq!(info.full_name, "Someone-CoolMod");
        assert_eq!(info.version.as_deref(), Some("1.2.3"));
        assert_eq!(info.description, "Does cool things");
        assert_eq!(info.dependencies, vec!["Author-Dep-1.0.0".to_string()]);
    }

    #[test]
    fn local_zip_manifest_inside_a_folder_is_found() {
        let bytes = zip_bytes(&[
            ("CoolMod/manifest.json", MANIFEST),
            ("CoolMod/plugins/CoolMod.dll", "binary"),
        ]);

        let info = describe_local_zip(Path::new("/tmp/whatever.zip"), &bytes, &[]).unwrap();

        assert_eq!(info.full_name, "Someone-CoolMod");
    }

    #[test]
    fn local_zip_without_manifest_falls_back_to_the_file_name() {
        let bytes = zip_bytes(&[("CoolMod.dll", "binary"), ("README.md", "hi")]);

        let info = describe_local_zip(Path::new("/tmp/Cool Mod.zip"), &bytes, &[]).unwrap();

        assert_eq!(info.full_name, "Local-Cool Mod");
        assert_eq!(info.name, "Cool Mod");
        assert_eq!(info.author, "Local");
        assert_eq!(info.version, None);
        assert!(info.dependencies.is_empty());
    }

    #[test]
    fn local_zip_with_malformed_manifest_is_treated_as_raw() {
        let bytes = zip_bytes(&[("manifest.json", "{not json"), ("Mod.dll", "binary")]);

        assert!(read_manifest(&bytes).unwrap().is_none());
    }

    #[test]
    fn manifest_fields_with_path_separators_are_sanitized() {
        let bytes = zip_bytes(&[(
            "manifest.json",
            r#"{"name":"Bad/Name","version_number":"1.0.0","description":"d","dependencies":[],"author":"Ev:il"}"#,
        )]);

        let info = describe_local_zip(Path::new("/tmp/x.zip"), &bytes, &[]).unwrap();

        assert_eq!(info.author, "Ev_il");
        assert_eq!(info.name, "Bad_Name");
        assert_eq!(info.full_name, "Ev_il-Bad_Name");
    }

    #[test]
    fn thunderstore_file_names_identify_raw_zips() {
        let bytes = zip_bytes(&[("BepInEx.dll", "binary")]);

        let info = describe_local_zip(
            Path::new("/Users/me/Downloads/denikson-BepInExPack_Valheim-5.4.2350.zip"),
            &bytes,
            &[],
        )
        .unwrap();

        assert_eq!(info.author, "denikson");
        assert_eq!(info.name, "BepInExPack_Valheim");
        assert_eq!(info.full_name, "denikson-BepInExPack_Valheim");
        assert_eq!(info.version.as_deref(), Some("5.4.2350"));
    }

    #[test]
    fn browser_copy_suffixes_are_ignored() {
        let bytes = zip_bytes(&[("Mod.dll", "binary")]);

        let info = describe_local_zip(
            Path::new("/Users/me/Downloads/denikson-Mod-1.2.3 (1).zip"),
            &bytes,
            &[],
        )
        .unwrap();

        assert_eq!(info.full_name, "denikson-Mod");
        assert_eq!(info.version.as_deref(), Some("1.2.3"));
    }

    #[test]
    fn manifest_without_author_borrows_the_owner_from_the_file_name() {
        let bytes = zip_bytes(&[("manifest.json", AUTHORLESS_MANIFEST)]);

        let info =
            describe_local_zip(Path::new("/tmp/Someone-CoolMod-1.2.3.zip"), &bytes, &[]).unwrap();

        assert_eq!(info.full_name, "Someone-CoolMod");
        assert_eq!(info.author, "Someone");
    }

    #[test]
    fn store_match_attributes_the_archive_and_borrows_its_icon() {
        let packages = vec![store_package(
            "CoolMod",
            "Someone",
            "1.2.3",
            &["Author-Dep-1.0.0"],
            "https://cdn.example/icon.png",
        )];
        let bytes = zip_bytes(&[("manifest.json", AUTHORLESS_MANIFEST), ("CoolMod.dll", "b")]);

        let info = describe_local_zip(Path::new("/tmp/renamed.zip"), &bytes, &packages).unwrap();

        assert_eq!(info.author, "Someone");
        assert_eq!(info.full_name, "Someone-CoolMod");
        assert_eq!(info.icon.as_deref(), Some("https://cdn.example/icon.png"));
        assert_eq!(info.dependencies, vec!["Author-Dep-1.0.0".to_string()]);
    }

    #[test]
    fn ambiguous_store_matches_stay_unattributed() {
        let packages = vec![
            store_package("CoolMod", "Someone", "1.2.3", &[], ""),
            store_package("CoolMod", "Other", "1.2.3", &[], ""),
        ];
        let bytes = zip_bytes(&[("manifest.json", AUTHORLESS_MANIFEST), ("CoolMod.dll", "b")]);

        let info = describe_local_zip(Path::new("/tmp/renamed.zip"), &bytes, &packages).unwrap();

        assert_eq!(info.author, "Local");
        assert_eq!(info.full_name, "Local-CoolMod");
    }

    #[test]
    fn ambiguous_store_matches_resolve_on_dependencies() {
        let packages = vec![
            store_package("CoolMod", "Someone", "1.2.3", &["Author-Dep-1.0.0"], ""),
            store_package("CoolMod", "Other", "1.2.3", &["Other-Dep-1.0.0"], ""),
        ];
        let bytes = zip_bytes(&[("manifest.json", AUTHORLESS_MANIFEST), ("CoolMod.dll", "b")]);

        let info = describe_local_zip(Path::new("/tmp/renamed.zip"), &bytes, &packages).unwrap();

        assert_eq!(info.author, "Someone");
        assert_eq!(info.full_name, "Someone-CoolMod");
    }

    #[test]
    fn reinstall_preserves_existing_config_values() {
        let source = tempfile::tempdir().unwrap();
        let game = tempfile::tempdir().unwrap();
        std::fs::create_dir(source.path().join("config")).unwrap();
        std::fs::write(source.path().join("config/custom.cfg"), b"new defaults").unwrap();
        std::fs::create_dir(game.path().join("config")).unwrap();
        std::fs::write(game.path().join("config/custom.cfg"), b"user edits").unwrap();
        install_mod_files(source.path(), "Test-Mod", game.path()).unwrap();
        assert_eq!(
            std::fs::read(game.path().join("config/custom.cfg")).unwrap(),
            b"user edits"
        );
    }

    #[test]
    fn toggles_loose_manual_dll_without_overwriting_conflicts() {
        let game = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(game.path().join("BepInEx/plugins")).unwrap();
        std::fs::write(game.path().join("BepInEx/plugins/Loose.dll"), b"manual").unwrap();
        assert!(!toggle_mod("Loose.dll", false, game.path()).unwrap());
        assert!(toggle_mod("Loose.dll", true, game.path()).unwrap());
        std::fs::write(
            game.path().join("BepInEx/plugins_disabled/Loose.dll"),
            b"conflict",
        )
        .unwrap();
        assert!(toggle_mod("Loose.dll", false, game.path()).is_err());
        assert_eq!(
            std::fs::read(game.path().join("BepInEx/plugins/Loose.dll")).unwrap(),
            b"manual"
        );
    }

    #[test]
    fn installs_root_plugin_and_assets_alongside_config() {
        let source = tempfile::tempdir().unwrap();
        let destination = tempfile::tempdir().unwrap();
        let source = source.path();
        std::fs::create_dir(source.join("config")).unwrap();
        std::fs::write(source.join("config/translation.yml"), "name: test").unwrap();
        std::fs::write(source.join("Wizardry.dll"), b"plugin").unwrap();
        std::fs::write(source.join("wizardry.bundle"), b"assets").unwrap();
        std::fs::write(source.join("manifest.json"), "{}").unwrap();

        install_mod_files(source, "Therzie-Wizardry", destination.path()).unwrap();

        let plugin = destination.path().join("plugins/Therzie-Wizardry");
        assert_eq!(
            std::fs::read(plugin.join("Wizardry.dll")).unwrap(),
            b"plugin"
        );
        assert_eq!(
            std::fs::read(plugin.join("wizardry.bundle")).unwrap(),
            b"assets"
        );
        assert!(destination.path().join("config/translation.yml").is_file());
        assert!(!plugin.join("config").exists());
        assert!(!plugin.join("manifest.json").exists());
    }

    #[test]
    fn keeps_standard_plugin_and_patcher_routes() {
        let source = tempfile::tempdir().unwrap();
        let destination = tempfile::tempdir().unwrap();
        for dir in ["plugins", "patchers", "config"] {
            std::fs::create_dir(source.path().join(dir)).unwrap();
        }
        std::fs::write(source.path().join("plugins/Main.dll"), b"main").unwrap();
        std::fs::write(source.path().join("patchers/Patcher.dll"), b"patcher").unwrap();
        std::fs::write(source.path().join("config/test.cfg"), b"config").unwrap();
        std::fs::write(source.path().join("Helper.dll"), b"helper").unwrap();

        install_mod_files(source.path(), "Test-Mod", destination.path()).unwrap();

        assert!(destination
            .path()
            .join("plugins/Test-Mod/Main.dll")
            .is_file());
        assert!(destination
            .path()
            .join("plugins/Test-Mod/Helper.dll")
            .is_file());
        assert!(destination.path().join("patchers/Patcher.dll").is_file());
        assert!(destination.path().join("config/test.cfg").is_file());
        assert!(!destination
            .path()
            .join("plugins/Test-Mod/patchers")
            .exists());
    }
}
