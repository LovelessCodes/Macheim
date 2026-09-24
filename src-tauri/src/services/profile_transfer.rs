use std::collections::HashSet;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::error::{AppError, AppResult};
use crate::models::thunderstore::ThunderstorePackage;
use crate::models::{InstalledMod, Profile};
use crate::services::compatibility::CONFIG as COMPAT_CONFIG;
use crate::services::profile_manager::is_manual_placeholder;

/// Marker r2modman/Gale prepend to base64 profile data (profile codes).
pub const SHARE_PREFIX: &str = "#r2modman";
const MANIFEST_ENTRY: &str = "export.r2x";
const BEPINEX_PACKAGE: &str = "denikson-BepInExPack_Valheim";
const CONFIG_EXTENSIONS: [&str; 6] = ["cfg", "txt", "json", "yml", "yaml", "ini"];
const MAX_SHARE_BYTES: usize = 20 * 1024 * 1024;
const MAX_CONFIG_BYTES: u64 = 2 * 1024 * 1024;
const ZIP_MAGIC: &[u8] = b"PK\x03\x04";
/// Legacy profile endpoints, in lookup order. Gale can host Hexium-exclusive
/// profiles, which 404 on Thunderstore but resolve on Hexium.
const PROFILE_CODE_HOSTS: [&str; 2] = [
    "https://thunderstore.io/api/experimental/legacyprofile/get",
    "https://hexium.gg/api/experimental/legacyprofile/get",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct R2xManifest {
    #[serde(rename = "profileName", alias = "name")]
    profile_name: String,
    #[serde(default)]
    mods: Vec<R2xMod>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct R2xMod {
    name: String,
    #[serde(alias = "versionNumber")]
    version: R2xVersion,
    #[serde(default = "default_enabled")]
    enabled: bool,
}

fn default_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
enum R2xVersion {
    Parts { major: u64, minor: u64, patch: u64 },
    Text(String),
}

impl R2xVersion {
    fn parse(raw: &str) -> Self {
        let mut parts = raw.trim().split('.');
        let parsed = (|| {
            Some((
                parts.next()?.parse::<u64>().ok()?,
                parts.next()?.parse::<u64>().ok()?,
                parts.next()?.parse::<u64>().ok()?,
            ))
        })();
        match parsed {
            Some((major, minor, patch)) if parts.next().is_none() => Self::Parts {
                major,
                minor,
                patch,
            },
            _ => Self::Text(raw.trim().to_string()),
        }
    }

    fn to_version_string(&self) -> String {
        match self {
            Self::Parts {
                major,
                minor,
                patch,
            } => format!("{}.{}.{}", major, minor, patch),
            Self::Text(text) => text.trim().to_string(),
        }
    }
}

/// A profile parsed from a share payload, before anything touches disk.
#[derive(Debug, Clone)]
pub struct ParsedProfile {
    pub name: String,
    pub mods: Vec<ParsedMod>,
    /// Config files keyed by their path relative to `BepInEx/config`.
    pub configs: Vec<(String, Vec<u8>)>,
}

#[derive(Debug, Clone)]
pub struct ParsedMod {
    pub full_name: String,
    pub version: String,
    pub enabled: bool,
}

/// True when the payload is an r2modman/Thunderstore profile: a `.r2z` ZIP or
/// the `#r2modman`-prefixed base64 text a profile code resolves to.
pub fn looks_like_share_payload(bytes: &[u8]) -> bool {
    bytes.starts_with(ZIP_MAGIC) || bytes.starts_with(SHARE_PREFIX.as_bytes())
}

/// Fetch a shared profile by its Thunderstore profile code. Codes are
/// short-lived (roughly an hour); file exports are the durable way to share.
pub async fn fetch_profile_code(code: &str) -> AppResult<Vec<u8>> {
    let code = code.trim();
    if !is_valid_profile_code(code) {
        return Err(AppError::Profile(
            "That does not look like a profile code. Paste the code from Thunderstore, r2modman or Gale."
                .into(),
        ));
    }

    let client = reqwest::Client::builder()
        .user_agent("Macheim/1.0.1")
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::Network(format!("Failed to create HTTP client: {}", e)))?;

    for host in PROFILE_CODE_HOSTS {
        let response = client
            .get(format!("{}/{}/", host, code))
            .send()
            .await
            .map_err(|e| {
                AppError::NetworkTransient(format!("Could not reach the profile service: {}", e))
            })?;

        match response.status() {
            reqwest::StatusCode::NOT_FOUND => continue,
            status if !status.is_success() => {
                return Err(AppError::Network(format!(
                    "The profile service returned status {} for this profile code.",
                    status
                )));
            }
            _ => return Ok(response.bytes().await?.to_vec()),
        }
    }

    Err(AppError::Profile(
        "Profile code not found. Codes expire after about an hour — ask for a fresh one.".into(),
    ))
}

fn is_valid_profile_code(code: &str) -> bool {
    (8..=64).contains(&code.len()) && code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// Parse a `.r2z` archive or the text a profile code resolves to.
pub fn parse_share_payload(bytes: &[u8]) -> AppResult<ParsedProfile> {
    if bytes.len() > MAX_SHARE_BYTES {
        return Err(AppError::Profile(
            "This profile is larger than 20 MB and cannot be imported.".into(),
        ));
    }
    let payload = unwrap_share_payload(bytes)?;
    let mut archive = zip::ZipArchive::new(Cursor::new(payload))?;

    let manifest_index = (0..archive.len()).find(|&i| {
        archive
            .by_index(i)
            .ok()
            .and_then(|file| file.enclosed_name())
            .and_then(|path| {
                path.file_name()
                    .map(|name| name.to_string_lossy() == MANIFEST_ENTRY)
            })
            .unwrap_or(false)
    });
    let manifest_index = manifest_index.ok_or_else(|| {
        AppError::Profile(
            "This archive has no export.r2x manifest. Export a profile file from r2modman, Gale or Thunderstore Mod Manager."
                .into(),
        )
    })?;

    let mut text = String::new();
    {
        let mut manifest_file = archive.by_index(manifest_index)?;
        if manifest_file.size() > MAX_CONFIG_BYTES {
            return Err(AppError::Profile(
                "This profile's manifest is too large to read.".into(),
            ));
        }
        manifest_file.read_to_string(&mut text)?;
    }
    let manifest: R2xManifest = serde_yaml_ng::from_str(&text).map_err(|e| {
        AppError::Profile(format!("Could not read the shared profile manifest: {}", e))
    })?;

    let mut seen = HashSet::new();
    let mods = manifest
        .mods
        .iter()
        .filter_map(|m| {
            let full_name = normalize_full_name(&m.name);
            if full_name.is_empty()
                || full_name.eq_ignore_ascii_case(BEPINEX_PACKAGE)
                || !seen.insert(full_name.clone())
            {
                return None;
            }
            Some(ParsedMod {
                full_name,
                version: m.version.to_version_string(),
                enabled: m.enabled,
            })
        })
        .collect();

    let mut configs = Vec::new();
    let mut total = 0usize;
    for i in 0..archive.len() {
        let Ok(mut file) = archive.by_index(i) else {
            continue;
        };
        if file.is_dir() {
            continue;
        }
        let Some(relative) = file
            .enclosed_name()
            .as_deref()
            .and_then(config_relative_path)
        else {
            continue;
        };
        if file.size() > MAX_CONFIG_BYTES {
            warn!(
                "Skipping oversized config file in shared profile: {}",
                relative
            );
            continue;
        }
        let mut bytes = Vec::new();
        if file.read_to_end(&mut bytes).is_err() {
            continue;
        }
        total += bytes.len();
        if total > MAX_SHARE_BYTES {
            return Err(AppError::Profile(
                "This profile's config files are larger than 20 MB and cannot be imported.".into(),
            ));
        }
        configs.push((relative, bytes));
    }

    Ok(ParsedProfile {
        name: manifest.profile_name.trim().to_string(),
        mods,
        configs,
    })
}

/// Build an r2modman-compatible `.r2z` archive: the `export.r2x` manifest plus
/// the profile's config files under `config/`.
pub fn build_share_payload(profile: &Profile, profile_dir: &Path) -> AppResult<Vec<u8>> {
    let mods = profile
        .mods
        .iter()
        .filter(|m| !m.full_name.is_empty() && !is_manual_placeholder(m))
        .map(|m| R2xMod {
            name: m.full_name.clone(),
            version: R2xVersion::parse(&m.version),
            enabled: m.enabled,
        })
        .collect();
    let manifest = R2xManifest {
        profile_name: profile.name.clone(),
        mods,
    };
    let yaml = serde_yaml_ng::to_string(&manifest)
        .map_err(|e| AppError::Profile(format!("Could not write the profile manifest: {}", e)))?;

    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    zip.start_file(MANIFEST_ENTRY, options)?;
    zip.write_all(yaml.as_bytes())?;

    let config_root = profile_dir.join("BepInEx/config");
    for relative in collect_config_files(&config_root) {
        let entry = format!("config/{}", relative.to_string_lossy().replace('\\', "/"));
        let bytes = std::fs::read(config_root.join(&relative))?;
        zip.start_file(entry, options)?;
        zip.write_all(&bytes)?;
    }

    Ok(zip.finish()?.into_inner())
}

/// Match a parsed mod against the store listings so the imported profile keeps
/// real authors, icons and dependency data. Unknown mods still import with
/// their pinned version; installs surface the failure later.
pub fn to_installed_mod(parsed: &ParsedMod, packages: &[ThunderstorePackage]) -> InstalledMod {
    let package = packages
        .iter()
        .find(|p| p.full_name.eq_ignore_ascii_case(&parsed.full_name));
    let metadata = package.and_then(|p| {
        p.versions
            .iter()
            .find(|v| v.version_number == parsed.version)
            .or_else(|| p.versions.first())
    });
    let (author, name) = parsed
        .full_name
        .split_once('-')
        .map(|(author, name)| (author.to_string(), name.to_string()))
        .unwrap_or_else(|| ("Unknown".to_string(), parsed.full_name.clone()));

    InstalledMod {
        full_name: package
            .map(|p| p.full_name.clone())
            .unwrap_or_else(|| parsed.full_name.clone()),
        author: package.map(|p| p.owner.clone()).unwrap_or(author),
        name: package.map(|p| p.name.clone()).unwrap_or(name),
        version: parsed.version.clone(),
        description: metadata
            .map(|v| v.description.clone())
            .unwrap_or_else(|| "Imported from a shared profile".to_string()),
        enabled: parsed.enabled,
        dependencies: metadata.map(|v| v.dependencies.clone()).unwrap_or_default(),
        installed_at: chrono::Utc::now().to_rfc3339(),
        icon: metadata.map(|v| v.icon.clone()).unwrap_or_default(),
        manual: false,
    }
}

fn unwrap_share_payload(bytes: &[u8]) -> AppResult<Vec<u8>> {
    if bytes.starts_with(ZIP_MAGIC) {
        return Ok(bytes.to_vec());
    }
    let text = std::str::from_utf8(bytes).map_err(|_| {
        AppError::Profile(
            "Not a Macheim or r2modman profile: the file is neither a ZIP archive nor a profile code."
                .into(),
        )
    })?;
    let encoded = text.trim().strip_prefix(SHARE_PREFIX).ok_or_else(|| {
        AppError::Profile(
            "Not a Macheim or r2modman profile: the file is neither a ZIP archive nor a profile code."
                .into(),
        )
    })?;
    let compact: String = encoded.chars().filter(|c| !c.is_whitespace()).collect();
    BASE64
        .decode(compact)
        .map_err(|e| AppError::Profile(format!("Could not decode the shared profile data: {}", e)))
}

/// `Author-Mod-1.2.3` from older exports becomes `Author-Mod`.
fn normalize_full_name(raw: &str) -> String {
    let trimmed = raw.trim();
    if let Some((prefix, suffix)) = trimmed.rsplit_once('-') {
        if !prefix.is_empty() && semver::Version::parse(suffix).is_ok() {
            return prefix.to_string();
        }
    }
    trimmed.to_string()
}

/// Path inside a share archive that maps to the profile's `BepInEx/config`.
fn config_relative_path(path: &Path) -> Option<String> {
    let text = path.to_string_lossy().replace('\\', "/");
    let relative = text
        .strip_prefix("config/")
        .or_else(|| text.strip_prefix("BepInEx/config/"))?;
    if !relative
        .split('/')
        .all(|part| !part.is_empty() && part != "." && part != "..")
    {
        return None;
    }
    let extension = Path::new(relative)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())?;
    if !CONFIG_EXTENSIONS.contains(&extension.as_str()) {
        return None;
    }
    if relative
        .rsplit('/')
        .next()
        .is_some_and(|name| name.eq_ignore_ascii_case(COMPAT_CONFIG))
    {
        return None;
    }
    Some(relative.to_string())
}

fn collect_config_files(root: &Path) -> Vec<PathBuf> {
    fn visit(dir: &Path, base: &Path, files: &mut Vec<PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if entry.file_type().is_ok_and(|t| t.is_symlink()) {
                continue;
            }
            if path.is_dir() {
                visit(&path, base, files);
                continue;
            }
            let Some(extension) = path.extension().map(|e| e.to_string_lossy().to_lowercase())
            else {
                continue;
            };
            if !CONFIG_EXTENSIONS.contains(&extension.as_str()) {
                continue;
            }
            if path
                .file_name()
                .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case(COMPAT_CONFIG))
            {
                continue;
            }
            if let Ok(relative) = path.strip_prefix(base) {
                files.push(relative.to_path_buf());
            }
        }
    }

    let mut files = Vec::new();
    if root.is_dir() {
        visit(root, root, &mut files);
    }
    files
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::InstalledMod;

    fn zip_with(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default();
        for (name, bytes) in entries {
            zip.start_file(*name, options).unwrap();
            zip.write_all(bytes).unwrap();
        }
        zip.finish().unwrap().into_inner()
    }

    fn manifest_yaml(mods: &str) -> String {
        format!("profileName: Shared\nmods:\n{}", mods)
    }

    fn installed_mod(full_name: &str, version: &str, manual: bool) -> InstalledMod {
        InstalledMod {
            full_name: full_name.into(),
            author: full_name.split('-').next().unwrap().into(),
            name: full_name.rsplit('-').next().unwrap().into(),
            version: version.into(),
            description: "desc".into(),
            enabled: true,
            dependencies: vec![],
            installed_at: "2026-01-01T00:00:00Z".into(),
            icon: String::new(),
            manual,
        }
    }

    #[test]
    fn parses_manifest_with_object_and_text_versions() {
        let yaml = manifest_yaml(
            "  - name: Author-Mod\n    version:\n      major: 1\n      minor: 2\n      patch: 3\n    enabled: true\n  - name: Other-Thing\n    version: \"2.0.0\"\n    enabled: false\n",
        );
        let payload = zip_with(&[("export.r2x", yaml.as_bytes())]);

        let parsed = parse_share_payload(&payload).unwrap();

        assert_eq!(parsed.name, "Shared");
        assert_eq!(parsed.mods.len(), 2);
        assert_eq!(parsed.mods[0].full_name, "Author-Mod");
        assert_eq!(parsed.mods[0].version, "1.2.3");
        assert!(parsed.mods[0].enabled);
        assert_eq!(parsed.mods[1].full_name, "Other-Thing");
        assert_eq!(parsed.mods[1].version, "2.0.0");
        assert!(!parsed.mods[1].enabled);
    }

    #[test]
    fn strips_version_suffixes_and_bepinex_and_duplicates() {
        let yaml = manifest_yaml(
            "  - name: Author-Mod-1.2.3\n    version: \"1.2.3\"\n    enabled: true\n  - name: denikson-BepInExPack_Valheim\n    version: \"5.4.2350\"\n    enabled: true\n  - name: Author-Mod\n    version: \"1.2.3\"\n    enabled: true\n",
        );
        let payload = zip_with(&[("export.r2x", yaml.as_bytes())]);

        let parsed = parse_share_payload(&payload).unwrap();

        assert_eq!(parsed.mods.len(), 1);
        assert_eq!(parsed.mods[0].full_name, "Author-Mod");
    }

    #[test]
    fn accepts_profile_code_payload_with_prefix() {
        let yaml =
            manifest_yaml("  - name: Author-Mod\n    version: \"1.0.0\"\n    enabled: true\n");
        let zip = zip_with(&[("export.r2x", yaml.as_bytes())]);
        let encoded = format!("{}\n{}", SHARE_PREFIX, BASE64.encode(&zip));

        let parsed = parse_share_payload(encoded.as_bytes()).unwrap();

        assert_eq!(parsed.mods.len(), 1);
    }

    #[test]
    fn imports_config_files_under_both_prefixes() {
        let yaml =
            manifest_yaml("  - name: Author-Mod\n    version: \"1.0.0\"\n    enabled: true\n");
        let payload = zip_with(&[
            ("export.r2x", yaml.as_bytes()),
            ("config/one.cfg", b"one"),
            ("BepInEx/config/nested/two.cfg", b"two"),
            ("BepInEx/config/notes.md", b"ignored"),
        ]);

        let parsed = parse_share_payload(&payload).unwrap();

        assert_eq!(parsed.configs.len(), 2);
        assert!(parsed
            .configs
            .iter()
            .any(|(p, b)| p == "one.cfg" && b == b"one"));
        assert!(parsed
            .configs
            .iter()
            .any(|(p, b)| p == "nested/two.cfg" && b == b"two"));
    }

    #[test]
    fn rejects_zip_slip_config_paths() {
        let yaml =
            manifest_yaml("  - name: Author-Mod\n    version: \"1.0.0\"\n    enabled: true\n");
        let payload = zip_with(&[
            ("export.r2x", yaml.as_bytes()),
            ("config/../../evil.cfg", b"evil"),
        ]);

        let parsed = parse_share_payload(&payload).unwrap();

        assert!(parsed.configs.is_empty());
    }

    #[test]
    fn rejects_archives_without_a_manifest() {
        let payload = zip_with(&[("readme.txt", b"hello")]);

        assert!(parse_share_payload(&payload).is_err());
    }

    #[test]
    fn round_trips_an_export() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("BepInEx/config/nested")).unwrap();
        std::fs::write(dir.path().join("BepInEx/config/one.cfg"), b"one").unwrap();
        std::fs::write(dir.path().join("BepInEx/config/nested/two.cfg"), b"two").unwrap();
        std::fs::write(dir.path().join("BepInEx/config/notes.md"), b"skip").unwrap();
        std::fs::write(
            dir.path().join("BepInEx/config").join(COMPAT_CONFIG),
            b"skip",
        )
        .unwrap();

        let mut profile = Profile::new("Round trip".into(), String::new());
        profile
            .mods
            .push(installed_mod("Author-Mod", "1.2.3", false));
        profile
            .mods
            .push(installed_mod("Manual-Entry", "0.0.0", true));

        let payload = build_share_payload(&profile, dir.path()).unwrap();
        let parsed = parse_share_payload(&payload).unwrap();

        assert_eq!(parsed.name, "Round trip");
        assert_eq!(parsed.mods.len(), 1);
        assert_eq!(parsed.mods[0].full_name, "Author-Mod");
        assert_eq!(parsed.mods[0].version, "1.2.3");
        assert_eq!(parsed.configs.len(), 2);
        assert!(parsed
            .configs
            .iter()
            .any(|(p, b)| p == "nested/two.cfg" && b == b"two"));
    }

    #[test]
    fn matches_store_metadata_when_available() {
        use crate::models::thunderstore::{PackageSource, PackageVersion, ThunderstorePackage};

        let package = ThunderstorePackage {
            name: "Mod".into(),
            full_name: "Author-Mod".into(),
            owner: "Author".into(),
            package_url: "https://example.com".into(),
            date_updated: "2026-01-01T00:00:00Z".into(),
            is_deprecated: false,
            rating_score: 1,
            versions: vec![PackageVersion {
                name: "Mod".into(),
                full_name: "Author-Mod".into(),
                version_number: "1.2.3".into(),
                dependencies: vec!["Other-Dep-1.0.0".into()],
                download_url: "https://example.com/mod.zip".into(),
                downloads: 1,
                description: "Real description".into(),
                icon: "https://example.com/icon.png".into(),
                date_created: "2026-01-01T00:00:00Z".into(),
                file_size: 1,
                is_active: true,
                uuid4: None,
                sources: Vec::new(),
            }],
            categories: Vec::new(),
            is_pinned: false,
            source: PackageSource::Thunderstore,
            alternates: Vec::new(),
        };
        let parsed = ParsedMod {
            full_name: "Author-Mod".into(),
            version: "1.2.3".into(),
            enabled: true,
        };

        let installed = to_installed_mod(&parsed, &[package]);

        assert_eq!(installed.author, "Author");
        assert_eq!(installed.name, "Mod");
        assert_eq!(installed.description, "Real description");
        assert_eq!(installed.icon, "https://example.com/icon.png");
        assert_eq!(installed.dependencies, vec!["Other-Dep-1.0.0"]);
    }

    #[test]
    fn keeps_pinned_version_without_store_metadata() {
        let parsed = ParsedMod {
            full_name: "Unknown-Mod".into(),
            version: "9.9.9".into(),
            enabled: false,
        };

        let installed = to_installed_mod(&parsed, &[]);

        assert_eq!(installed.full_name, "Unknown-Mod");
        assert_eq!(installed.author, "Unknown");
        assert_eq!(installed.name, "Mod");
        assert_eq!(installed.version, "9.9.9");
        assert!(!installed.enabled);
    }

    #[test]
    fn validates_profile_codes() {
        assert!(is_valid_profile_code(
            "019eb41e-401b-a408-b431-2915043cbf7f"
        ));
        assert!(!is_valid_profile_code("short"));
        assert!(!is_valid_profile_code("../../etc/passwd"));
        assert!(!is_valid_profile_code("code/with/slash"));
    }
}
