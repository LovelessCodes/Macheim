use std::path::Path;

use pelite::pe32::{Pe as Pe32, PeFile as PeFile32};
use pelite::pe64::{Pe as Pe64, PeFile as PeFile64};
use pelite::resources::version_info::VersionInfo;

/// Read the version a plugin declares in its PE version resource. .NET mods
/// are usually AnyCPU (PE32), but both mappings are tried. Returns `None` for
/// plugins without a version resource (some Mono-built assemblies).
pub fn read_plugin_version(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    version_from_image(&bytes)
}

fn version_from_image(bytes: &[u8]) -> Option<String> {
    let info32 = PeFile32::from_bytes(bytes)
        .ok()
        .and_then(|file| Pe32::resources(file).ok())
        .and_then(|resources| resources.version_info().ok());
    if let Some(info) = info32 {
        if let Some(version) = version_from_info(info) {
            return Some(version);
        }
    }

    let info64 = PeFile64::from_bytes(bytes)
        .ok()
        .and_then(|file| Pe64::resources(file).ok())
        .and_then(|resources| resources.version_info().ok());
    info64.and_then(version_from_info)
}

fn version_from_info(info: VersionInfo<'_>) -> Option<String> {
    let lang = info.translation().first().copied().unwrap_or_default();
    if let Some(raw) = info
        .value(lang, "ProductVersion")
        .or_else(|| info.value(lang, "FileVersion"))
    {
        if let Some(version) = normalize_version(&raw) {
            return Some(version);
        }
    }
    info.fixed()
        .and_then(|fixed| normalize_version(&fixed.dwFileVersion.to_string()))
}

/// `"2.30.0+de0a40b"` -> `"2.30.0"`, `"1.0.0.0"` -> `"1.0.0"`. Anything
/// without a leading numeric version is rejected.
pub fn normalize_version(raw: &str) -> Option<String> {
    let core = raw.split('+').next()?.trim();
    let core = core.strip_prefix('v').unwrap_or(core).trim();
    let core = core.split_whitespace().next()?;

    let mut parts: Vec<&str> = core.split('.').collect();
    if parts
        .iter()
        .any(|part| part.is_empty() || !part.chars().all(|c| c.is_ascii_digit()))
    {
        return None;
    }
    // PE file versions are 4-part; a trailing zero adds no information when
    // the mod advertises a three-part version like 1.3.2.
    while parts.len() > 3 && parts.last() == Some(&"0") {
        parts.pop();
    }
    Some(parts.join("."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_build_metadata_and_trailing_quad_zero() {
        assert_eq!(
            normalize_version("2.30.0+de0a40b38d41ee6d8d6c2109bd99ff7c0be15493"),
            Some("2.30.0".to_string())
        );
        assert_eq!(normalize_version("1.0.0.0"), Some("1.0.0".to_string()));
        assert_eq!(normalize_version("1.3.2"), Some("1.3.2".to_string()));
        assert_eq!(normalize_version("v1.2"), Some("1.2".to_string()));
        assert_eq!(normalize_version("1.2.3.4"), Some("1.2.3.4".to_string()));
    }

    #[test]
    fn rejects_non_numeric_versions() {
        assert_eq!(normalize_version("nightly"), None);
        assert_eq!(normalize_version("1.2-beta"), None);
        assert_eq!(normalize_version(""), None);
    }
}
