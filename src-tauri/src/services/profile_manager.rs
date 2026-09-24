use super::{
    compatibility::{atomic_write, reject_symlink_ancestors, MANAGED_DIR},
    plugin_version, thunderstore_client,
};
use crate::error::{AppError, AppResult};
use crate::models::{InstalledMod, Profile};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tracing::warn;

const SYNC_DIRS: [&str; 4] = ["plugins", "patchers", "config", "plugins_disabled"];
const ACTIVE_MARKER: &str = ".macheim-active-profile";

pub fn validate_name(name: &str) -> AppResult<()> {
    if name.is_empty()
        || name.len() > 120
        || name.starts_with('.')
        || name.trim() != name
        || name
            .chars()
            .any(|c| c.is_control() || matches!(c, '/' | '\\' | ':'))
    {
        return Err(AppError::Profile("Use a nonempty name without path separators, a leading dot or surrounding spaces (max 120 bytes).".into()));
    }
    Ok(())
}
pub fn get_profiles_dir() -> PathBuf {
    thunderstore_client::get_app_data_dir().join("profiles")
}
pub fn get_profile_dir(name: &str) -> PathBuf {
    get_profiles_dir().join(name)
}
pub fn ensure_default_profile() -> AppResult<()> {
    if !get_profile_dir("Default").exists() {
        create_profile("Default", "Default mod profile")?;
    }
    Ok(())
}
pub fn create_profile(name: &str, description: &str) -> AppResult<Profile> {
    validate_name(name)?;
    let dir = get_profile_dir(name);
    if dir.exists() {
        return Err(AppError::Profile(format!(
            "Profile \"{}\" already exists. Choose a different name.",
            name
        )));
    }
    reject_symlink_ancestors(&dir)?;
    std::fs::create_dir_all(get_profiles_dir())?;
    std::fs::create_dir(&dir)?;
    for sub in SYNC_DIRS {
        std::fs::create_dir_all(dir.join("BepInEx").join(sub))?;
    }
    let profile = Profile::new(name.into(), description.into());
    save_profile(&profile)?;
    Ok(profile)
}
pub fn load_profile(name: &str) -> AppResult<Profile> {
    validate_name(name)?;
    let path = get_profile_dir(name).join("profile.json");
    reject_symlink_ancestors(&path)?;
    let profile: Profile = serde_json::from_slice(&std::fs::read(path)?)?;
    if profile.name != name {
        return Err(AppError::Profile(
            "Profile metadata name does not match its directory.".into(),
        ));
    }
    for m in &profile.mods {
        validate_name(&m.full_name)?;
    }
    Ok(profile)
}
pub fn save_profile(profile: &Profile) -> AppResult<()> {
    validate_name(&profile.name)?;
    for m in &profile.mods {
        validate_name(&m.full_name)?;
    }
    atomic_write(
        &get_profile_dir(&profile.name).join("profile.json"),
        &serde_json::to_vec_pretty(profile)?,
    )
}
pub fn list_profiles() -> AppResult<Vec<Profile>> {
    ensure_default_profile()?;
    let mut profiles = Vec::new();
    for entry in std::fs::read_dir(get_profiles_dir())? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            let name = entry.file_name().to_string_lossy().into_owned();
            match load_profile(&name) {
                Ok(p) => profiles.push(p),
                Err(e) => warn!("Cannot load profile {}: {}", name, e),
            }
        }
    }
    profiles.sort_by_key(|p| (p.name != "Default", p.name.clone()));
    Ok(profiles)
}
/// One archived profile inside the deleted-profiles folder.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DeletedProfile {
    /// Folder name inside `deleted-profiles`; identifies the archive.
    pub archive_name: String,
    /// Profile name at deletion time.
    pub name: String,
    pub mods: usize,
    pub deleted_at: String,
}

pub fn deleted_profiles_dir() -> PathBuf {
    thunderstore_client::get_app_data_dir().join("deleted-profiles")
}

pub fn delete_profile(name: &str) -> AppResult<DeletedProfile> {
    validate_name(name)?;
    if name == "Default" {
        return Err(AppError::Profile(
            "Cannot delete the default profile".into(),
        ));
    }
    let profile = load_profile(name)?;
    let archive = deleted_profiles_dir();
    std::fs::create_dir_all(&archive)?;
    let archive_name = format!(
        "{}-{}",
        name,
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    );
    std::fs::rename(get_profile_dir(name), archive.join(&archive_name))?;
    Ok(DeletedProfile {
        archive_name,
        name: name.to_string(),
        mods: profile.mods.len(),
        deleted_at: chrono::Utc::now().to_rfc3339(),
    })
}

pub fn list_deleted_profiles() -> AppResult<Vec<DeletedProfile>> {
    deleted_profiles_in(&deleted_profiles_dir())
}

/// Newest first. Archives without a readable `profile.json` still list, using
/// their folder name.
fn deleted_profiles_in(dir: &Path) -> AppResult<Vec<DeletedProfile>> {
    let mut profiles = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Ok(profiles);
    };
    for entry in entries.flatten() {
        if !entry.file_type().is_ok_and(|file_type| file_type.is_dir()) {
            continue;
        }
        let archive_name = entry.file_name().to_string_lossy().into_owned();
        profiles.push(deleted_profile_meta(&entry.path(), &archive_name));
    }
    profiles.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    Ok(profiles)
}

fn deleted_profile_meta(dir: &Path, archive_name: &str) -> DeletedProfile {
    let profile = std::fs::read(dir.join("profile.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Profile>(&bytes).ok());
    let name = profile
        .as_ref()
        .map(|profile| profile.name.clone())
        .unwrap_or_else(|| strip_archive_suffix(archive_name));
    let deleted_at = archive_timestamp(archive_name)
        .or_else(|| {
            dir.metadata()
                .ok()
                .and_then(|meta| meta.modified().ok())
                .map(chrono::DateTime::<chrono::Utc>::from)
        })
        .map(|time| time.to_rfc3339())
        .unwrap_or_default();
    DeletedProfile {
        archive_name: archive_name.to_string(),
        name,
        mods: profile.map(|profile| profile.mods.len()).unwrap_or(0),
        deleted_at,
    }
}

/// `MyProfile-1758580000000000000` → `MyProfile`.
fn strip_archive_suffix(archive_name: &str) -> String {
    archive_name
        .rsplit_once('-')
        .filter(|(_, suffix)| !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_digit()))
        .map(|(name, _)| name.to_string())
        .unwrap_or_else(|| archive_name.to_string())
}

fn archive_timestamp(archive_name: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    let (_, suffix) = archive_name.rsplit_once('-')?;
    let nanos: i64 = suffix.parse().ok()?;
    chrono::DateTime::from_timestamp(nanos / 1_000_000_000, (nanos % 1_000_000_000) as u32)
}

/// Move an archived profile back into `profiles/`, optionally under a new
/// name. The archive is consumed, so undo leaves nothing behind.
pub fn restore_deleted_profile(archive_name: &str, new_name: Option<&str>) -> AppResult<Profile> {
    validate_archive_name(archive_name)?;
    let source = deleted_profiles_dir().join(archive_name);
    if !source.is_dir() {
        return Err(AppError::Profile(
            "That deleted profile no longer exists.".into(),
        ));
    }
    let mut profile: Profile = serde_json::from_slice(&std::fs::read(source.join("profile.json"))?)
        .map_err(|_| {
            AppError::Profile(
                "This archive has no readable profile.json; restore it by hand from the deleted-profiles folder."
                    .into(),
            )
        })?;
    if let Some(name) = new_name {
        profile.name = name.into();
    }
    validate_name(&profile.name)?;
    let target = get_profile_dir(&profile.name);
    if target.exists() {
        return Err(AppError::Profile(format!(
            "Profile \"{}\" already exists. Switch to it and rename, or restore differently.",
            profile.name
        )));
    }
    reject_symlink_ancestors(&source)?;
    reject_symlink_ancestors(&target)?;
    std::fs::rename(&source, &target)?;
    if new_name.is_some() {
        profile.touch();
        save_profile(&profile)?;
    }
    Ok(profile)
}

/// Permanently remove one archived profile.
pub fn purge_deleted_profile(archive_name: &str) -> AppResult<()> {
    validate_archive_name(archive_name)?;
    let dir = deleted_profiles_dir().join(archive_name);
    if !dir.exists() {
        return Err(AppError::Profile(
            "That deleted profile no longer exists.".into(),
        ));
    }
    reject_symlink_ancestors(&dir)?;
    std::fs::remove_dir_all(&dir)?;
    Ok(())
}

/// Permanently remove every archived profile. Returns how many were purged;
/// an archive that cannot be removed is skipped, not fatal.
pub fn purge_deleted_profiles() -> AppResult<usize> {
    let dir = deleted_profiles_dir();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(0);
    };
    let mut purged = 0;
    for entry in entries.flatten() {
        if !entry.file_type().is_ok_and(|file_type| file_type.is_dir()) {
            continue;
        }
        let path = entry.path();
        if reject_symlink_ancestors(&path).is_err() {
            warn!("Skipping symlinked archive {}", path.display());
            continue;
        }
        match std::fs::remove_dir_all(&path) {
            Ok(()) => purged += 1,
            Err(error) => warn!("Could not purge {}: {}", path.display(), error),
        }
    }
    Ok(purged)
}

fn validate_archive_name(archive_name: &str) -> AppResult<()> {
    if archive_name.is_empty()
        || archive_name.starts_with('.')
        || archive_name.contains('/')
        || archive_name.contains('\\')
    {
        return Err(AppError::Profile("Invalid archive name".into()));
    }
    Ok(())
}
pub fn clone_profile(source_name: &str, new_name: &str) -> AppResult<Profile> {
    let mut profile = load_profile(source_name)?;
    validate_name(new_name)?;
    let target = get_profile_dir(new_name);
    if target.exists() {
        return Err(AppError::Profile("Profile already exists".into()));
    }
    copy_dir_recursive(&get_profile_dir(source_name), &target)?;
    profile.name = new_name.into();
    profile.description = format!("Cloned from {}", source_name);
    profile.touch();
    save_profile(&profile)?;
    Ok(profile)
}
pub fn set_active_profile(name: &str, root: &Path) -> AppResult<()> {
    validate_name(name)?;
    atomic_write(&root.join(ACTIVE_MARKER), name.as_bytes())
}
/// Legacy releases had no active marker. Preserve ambiguous live files in a new
/// recovery profile instead of importing another profile's contents into Default.
pub fn initialize_game_profile(root: &Path) -> AppResult<String> {
    if let Ok(name) = std::fs::read_to_string(root.join(ACTIVE_MARKER)) {
        let name = name.trim();
        if load_profile(name).is_ok() {
            import_existing_mods(name, root)?;
            return Ok(name.into());
        }
        return Err(AppError::Profile("The saved active profile is missing or invalid. Restore that profile before continuing; game files were not changed.".into()));
    }
    let profiles = list_profiles()?;
    let has_live_data = SYNC_DIRS.iter().any(|s| {
        std::fs::read_dir(root.join("BepInEx").join(s)).is_ok_and(|mut e| e.next().is_some())
    });
    let name = if has_live_data && profiles.len() > 1 {
        let name = format!(
            "Recovered-{}",
            chrono::Utc::now().format("%Y%m%d-%H%M%S-%f")
        );
        create_profile(&name, "Preserved live installation from an older release with no saved active profile. Existing profiles were not overwritten.")?;
        name
    } else {
        "Default".into()
    };
    import_existing_mods(&name, root)?;
    set_active_profile(&name, root)?;
    Ok(name)
}
pub fn switch_profile(name: &str, root: &Path) -> AppResult<()> {
    load_profile(name)?;
    replace_bepinex_dirs(
        &get_profile_dir(name).join("BepInEx"),
        &root.join("BepInEx"),
    )
}
pub fn save_game_state_to_profile(name: &str, root: &Path) -> AppResult<()> {
    let mut profile = load_profile(name)?;
    let source = root.join("BepInEx");
    if !source.exists() {
        return Ok(());
    }
    register_manual_mods(&mut profile, &source)?;
    replace_bepinex_dirs(&source, &get_profile_dir(name).join("BepInEx"))?;
    profile.touch();
    save_profile(&profile)
}
pub fn import_existing_mods(name: &str, root: &Path) -> AppResult<Vec<String>> {
    let mut profile = load_profile(name)?;
    let added = register_manual_mods(&mut profile, &root.join("BepInEx"))?;
    if root.join("BepInEx").exists() {
        replace_bepinex_dirs(
            &root.join("BepInEx"),
            &get_profile_dir(name).join("BepInEx"),
        )?;
    }
    profile.touch();
    save_profile(&profile)?;
    Ok(added)
}
/// Marker for mods the scanner registered from the filesystem. It only knows
/// the file name, not who published the mod or which version it is.
const MANUAL_DESCRIPTION: &str = "Manually installed (version unverified)";

pub(crate) fn is_manual_placeholder(m: &InstalledMod) -> bool {
    // The description check covers profiles written before the flag existed.
    m.manual || m.description == MANUAL_DESCRIPTION
}

pub(crate) fn is_plugin_file(path: &Path) -> bool {
    path.extension().is_some_and(|e| {
        e.eq_ignore_ascii_case("dll")
            || e.eq_ignore_ascii_case("dylib")
            || e.eq_ignore_ascii_case("so")
    })
}

/// Plugin files under `dir`, searched recursively.
fn plugin_files(dir: &Path) -> Vec<PathBuf> {
    fn visit(dir: &Path, files: &mut Vec<PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                visit(&path, files);
            } else if is_plugin_file(&path) {
                files.push(path);
            }
        }
    }

    let mut files = Vec::new();
    if dir.is_dir() {
        visit(dir, &mut files);
    }
    files
}

fn plugin_file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// DLL names shipped by tracked mods. A loose copy left in `plugins/` (for
/// example, a manual install that a store package later replaced) is the same
/// plugin, so it must not be listed as a second, unknown mod, counted as a
/// duplicate conflict or kept as "unmanaged".
pub(crate) fn managed_dll_names(mods: &[InstalledMod], bepinex: &Path) -> HashSet<String> {
    let mut names = HashSet::new();
    for m in mods {
        if is_manual_placeholder(m) {
            continue;
        }
        for dir in ["plugins", "plugins_disabled"] {
            for file in plugin_files(&bepinex.join(dir).join(&m.full_name)) {
                names.insert(plugin_file_name(&file).to_lowercase());
            }
        }
    }
    names
}

/// A manual folder is only a mod when it actually carries plugin files, and it
/// is redundant when every one of them is already provided by a tracked mod.
fn folder_is_manual_mod(dir: &Path, managed_dlls: &HashSet<String>) -> bool {
    let files = plugin_files(dir);
    !files.is_empty()
        && !files
            .iter()
            .all(|file| managed_dlls.contains(&plugin_file_name(file).to_lowercase()))
}

/// Version advertised by the plugin that represents the folder: the only
/// plugin, or the one named after the mod in multi-plugin folders.
fn folder_plugin_version(dir: &Path, display_name: &str, fallback: &str) -> Option<String> {
    let files = plugin_files(dir);
    let chosen = if files.len() == 1 {
        files.first()
    } else {
        files.iter().find(|file| {
            let stem = plugin_display_name(&plugin_file_name(file), "");
            stem.eq_ignore_ascii_case(display_name) || stem.eq_ignore_ascii_case(fallback)
        })
    }?;
    plugin_version::read_plugin_version(chosen)
}

fn register_manual_mods(profile: &mut Profile, bepinex: &Path) -> AppResult<Vec<String>> {
    // Manual entries are derived, not authoritative: drop them and rebuild
    // from the filesystem so display names, enabled state and stale entries
    // stay in sync with what is actually installed.
    profile
        .mods
        .retain(|m| !is_manual_placeholder(m) && m.full_name != MANAGED_DIR);

    let managed_dlls = managed_dll_names(&profile.mods, bepinex);

    let mut tracked: HashSet<_> = profile.mods.iter().map(|m| m.full_name.clone()).collect();
    let mut added = Vec::new();
    for (dir, enabled) in [("plugins", true), ("plugins_disabled", false)] {
        let path = bepinex.join(dir);
        if !path.exists() {
            continue;
        }
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let ty = entry.file_type()?;
            if name.starts_with('.') || name == MANAGED_DIR || tracked.contains(&name) {
                continue;
            }
            if !(ty.is_dir()
                || (ty.is_file()
                    && entry
                        .path()
                        .extension()
                        .is_some_and(|e| e.eq_ignore_ascii_case("dll"))))
            {
                continue;
            }
            if ty.is_dir() {
                // Folders without plugins are data (translations, caches), and
                // folders whose plugins a tracked mod already ships are
                // leftovers of an earlier manual install.
                if !folder_is_manual_mod(&entry.path(), &managed_dlls) {
                    continue;
                }
            } else if managed_dlls.contains(&name.to_lowercase()) {
                // A tracked mod already loads this DLL from its own folder.
                continue;
            }
            validate_name(&name)?;
            let (author, mod_name) = name.split_once('-').unwrap_or(("Unknown", &name));
            let display_name = if ty.is_dir() {
                folder_display_name(&entry.path(), mod_name)
            } else {
                plugin_display_name(&name, mod_name)
            };
            let version = if ty.is_dir() {
                folder_plugin_version(&entry.path(), &display_name, mod_name)
            } else {
                plugin_version::read_plugin_version(&entry.path())
            }
            .unwrap_or_else(|| "0.0.0".to_string());
            profile.mods.push(InstalledMod {
                full_name: name.clone(),
                author: author.into(),
                name: display_name,
                version,
                description: MANUAL_DESCRIPTION.into(),
                enabled,
                dependencies: vec![],
                installed_at: chrono::Utc::now().to_rfc3339(),
                icon: String::new(),
                manual: true,
                pinned: false,
            });
            tracked.insert(name.clone());
            added.push(name);
        }
    }
    Ok(added)
}

/// Plugin file name without its extension; `fallback` when there is nothing
/// usable (e.g. a lone ".dll").
fn plugin_display_name(file: &str, fallback: &str) -> String {
    Path::new(file)
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .filter(|stem| !stem.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

/// Display name for a manual folder: its plugin is the mod, so a folder with a
/// single plugin (e.g. `Jowleth/NoRainDamage.dll`) shows the plugin name. The
/// folder name stays the `full_name` because uninstall and toggle operate on
/// that path.
fn folder_display_name(dir: &Path, fallback: &str) -> String {
    let files = plugin_files(dir);
    if files.len() != 1 {
        return fallback.to_string();
    }
    plugin_display_name(&plugin_file_name(&files[0]), fallback)
}
pub fn add_mod_to_profile(name: &str, installed: InstalledMod) -> AppResult<()> {
    let mut p = load_profile(name)?;
    p.mods.retain(|m| m.full_name != installed.full_name);
    p.mods.push(installed);
    p.touch();
    save_profile(&p)
}
pub fn remove_mod_from_profile(name: &str, full_name: &str) -> AppResult<()> {
    let mut p = load_profile(name)?;
    p.mods.retain(|m| m.full_name != full_name);
    p.touch();
    save_profile(&p)
}

/// Mark several mods enabled or disabled in one profile write.
pub fn set_mods_enabled(name: &str, full_names: &[String], enabled: bool) -> AppResult<()> {
    if full_names.is_empty() {
        return Ok(());
    }
    let mut profile = load_profile(name)?;
    for full_name in full_names {
        if let Some(entry) = profile.mods.iter_mut().find(|m| &m.full_name == full_name) {
            entry.enabled = enabled;
        }
    }
    profile.touch();
    save_profile(&profile)
}

/// Remove several mods from the profile in one write.
pub fn remove_mods_from_profile(name: &str, full_names: &[String]) -> AppResult<()> {
    if full_names.is_empty() {
        return Ok(());
    }
    let mut profile = load_profile(name)?;
    profile.mods.retain(|m| !full_names.contains(&m.full_name));
    profile.touch();
    save_profile(&profile)
}
pub fn update_mod_enabled(name: &str, full_name: &str, enabled: bool) -> AppResult<()> {
    let mut p = load_profile(name)?;
    if let Some(m) = p.mods.iter_mut().find(|m| m.full_name == full_name) {
        m.enabled = enabled;
    }
    p.touch();
    save_profile(&p)
}

/// Hold a mod at its installed version, or release it.
pub fn set_mod_pinned(name: &str, full_name: &str, pinned: bool) -> AppResult<()> {
    let mut p = load_profile(name)?;
    set_pinned_in_profile(&mut p, full_name, pinned);
    p.touch();
    save_profile(&p)
}

/// Returns true when the mod was found and its pin updated.
fn set_pinned_in_profile(profile: &mut Profile, full_name: &str, pinned: bool) -> bool {
    match profile.mods.iter_mut().find(|m| m.full_name == full_name) {
        Some(module) => {
            module.pinned = pinned;
            true
        }
        None => false,
    }
}
pub fn export_profile(name: &str) -> AppResult<String> {
    Ok(serde_json::to_string_pretty(&load_profile(name)?)?)
}
pub fn import_profile(json: &str, new_name: Option<&str>) -> AppResult<Profile> {
    let mut p: Profile = serde_json::from_str(json)?;
    if let Some(name) = new_name {
        p.name = name.into();
    }
    validate_name(&p.name)?;
    for m in &p.mods {
        validate_name(&m.full_name)?;
    }
    create_profile(&p.name, &p.description)?;
    p.touch();
    save_profile(&p)?;
    Ok(p)
}
/// Stage every directory before replacing any data. Restore outgoing directories
/// on rename failure; retain recovery files if rollback itself cannot complete.
fn replace_bepinex_dirs(source: &Path, target: &Path) -> AppResult<()> {
    reject_symlink_ancestors(source)?;
    reject_symlink_ancestors(target)?;
    std::fs::create_dir_all(target)?;
    let stage = tempfile::Builder::new()
        .prefix(".macheim-stage-")
        .tempdir_in(target)?;
    for sub in SYNC_DIRS {
        reject_symlink_ancestors(&target.join(sub))?;
        let incoming = stage.path().join(format!("new-{}", sub));
        if source.join(sub).exists() {
            copy_dir_recursive(&source.join(sub), &incoming)?;
        } else {
            std::fs::create_dir(&incoming)?;
        }
    }
    let mut moved = Vec::new();
    let result: AppResult<()> = (|| {
        for sub in SYNC_DIRS {
            let dest = target.join(sub);
            let old = stage.path().join(format!("old-{}", sub));
            if dest.exists() {
                std::fs::rename(&dest, &old)?;
            }
            moved.push(sub);
            std::fs::rename(stage.path().join(format!("new-{}", sub)), &dest)?;
        }
        Ok(())
    })();
    if let Err(error) = result {
        let mut rollback_failed = false;
        for sub in moved.into_iter().rev() {
            let dest = target.join(sub);
            if dest.exists()
                && std::fs::rename(&dest, stage.path().join(format!("failed-{}", sub))).is_err()
            {
                rollback_failed = true;
                continue;
            }
            let old = stage.path().join(format!("old-{}", sub));
            if old.exists() && std::fs::rename(old, dest).is_err() {
                rollback_failed = true;
            }
        }
        if rollback_failed {
            let recovery = stage.keep();
            return Err(AppError::Profile(format!(
                "{}; recovery files retained at {}",
                error,
                recovery.display()
            )));
        }
        return Err(error);
    }
    Ok(())
}
fn copy_dir_recursive(source: &Path, target: &Path) -> AppResult<()> {
    reject_symlink_ancestors(source)?;
    reject_symlink_ancestors(target)?;
    std::fs::create_dir_all(target)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let src = entry.path();
        if entry.file_type()?.is_symlink() {
            return Err(AppError::Profile(format!(
                "Back up or resolve this symlink before switching profiles: {}",
                src.display()
            )));
        }
        let dst = target.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&src, &dst)?;
        } else {
            std::fs::copy(src, dst)?;
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;

    fn installed_mod(full_name: &str, description: &str) -> InstalledMod {
        InstalledMod {
            full_name: full_name.into(),
            author: full_name.split('-').next().unwrap_or(full_name).into(),
            name: full_name.rsplit('-').next().unwrap_or(full_name).into(),
            version: "1.0.0".into(),
            description: description.into(),
            enabled: true,
            dependencies: vec![],
            installed_at: "2026-01-01T00:00:00Z".into(),
            icon: String::new(),
            manual: false,
            pinned: false,
        }
    }

    fn manual_placeholder(full_name: &str) -> InstalledMod {
        let mut m = installed_mod(full_name, MANUAL_DESCRIPTION);
        m.author = "Unknown".into();
        m.version = "0.0.0".into();
        m.manual = true;
        m
    }

    #[test]
    fn pin_flag_updates_and_older_profiles_default_to_unpinned() {
        let mut p = Profile::new("Test".into(), "".into());
        p.mods.push(installed_mod("Author-Mod", ""));

        assert!(set_pinned_in_profile(&mut p, "Author-Mod", true));
        assert!(p.mods[0].pinned);
        assert!(set_pinned_in_profile(&mut p, "Author-Mod", false));
        assert!(!p.mods[0].pinned);
        assert!(!set_pinned_in_profile(&mut p, "Missing-Mod", true));

        // A profile written before pinning existed deserializes as unpinned.
        let mut value = serde_json::to_value(&p).unwrap();
        value["mods"][0].as_object_mut().unwrap().remove("pinned");
        let old: Profile = serde_json::from_value(value).unwrap();
        assert!(!old.mods[0].pinned);
    }

    #[test]
    fn asset_only_folder_is_not_registered() {
        let game = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(game.path().join("plugins/Translations")).unwrap();
        std::fs::write(game.path().join("plugins/Translations/sv.json"), b"{}").unwrap();

        let mut p = Profile::new("Test".into(), "".into());
        p.mods.push(manual_placeholder("Translations"));

        let added = register_manual_mods(&mut p, game.path()).unwrap();

        assert!(added.is_empty());
        assert!(p.mods.is_empty());
    }

    #[test]
    fn manual_folder_shows_its_plugin_name() {
        let game = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(game.path().join("plugins/Jowleth")).unwrap();
        std::fs::write(
            game.path().join("plugins/Jowleth/NoRainDamage.dll"),
            b"plugin",
        )
        .unwrap();

        let mut p = Profile::new("Test".into(), "".into());
        // A stale placeholder from an earlier scan is refreshed, not kept.
        p.mods.push(manual_placeholder("Jowleth"));

        let added = register_manual_mods(&mut p, game.path()).unwrap();

        assert_eq!(added, vec!["Jowleth"]);
        assert_eq!(p.mods.len(), 1);
        assert_eq!(p.mods[0].full_name, "Jowleth");
        assert_eq!(p.mods[0].name, "NoRainDamage");
    }

    #[test]
    fn loose_dll_display_name_drops_extension() {
        let game = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(game.path().join("plugins")).unwrap();
        std::fs::write(game.path().join("plugins/Things.dll"), b"plugin").unwrap();

        let mut p = Profile::new("Test".into(), "".into());

        register_manual_mods(&mut p, game.path()).unwrap();

        assert_eq!(p.mods.len(), 1);
        assert_eq!(p.mods[0].full_name, "Things.dll");
        assert_eq!(p.mods[0].name, "Things");
    }

    #[test]
    fn folder_provided_by_tracked_mod_is_pruned() {
        let game = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(game.path().join("plugins/Author-SleepSkip")).unwrap();
        std::fs::write(
            game.path().join("plugins/Author-SleepSkip/SleepSkip.dll"),
            b"managed",
        )
        .unwrap();
        std::fs::create_dir_all(game.path().join("plugins/Leftover")).unwrap();
        std::fs::write(game.path().join("plugins/Leftover/SleepSkip.dll"), b"loose").unwrap();

        let mut p = Profile::new("Test".into(), "".into());
        p.mods.push(installed_mod("Author-SleepSkip", "real mod"));
        p.mods.push(manual_placeholder("Leftover"));

        let added = register_manual_mods(&mut p, game.path()).unwrap();

        assert!(added.is_empty());
        assert_eq!(p.mods.len(), 1);
        assert_eq!(p.mods[0].full_name, "Author-SleepSkip");
    }

    #[test]
    fn loose_dll_provided_by_tracked_mod_is_not_registered() {
        let game = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(game.path().join("plugins/Author-SleepSkip")).unwrap();
        std::fs::write(
            game.path().join("plugins/Author-SleepSkip/SleepSkip.dll"),
            b"managed",
        )
        .unwrap();
        std::fs::write(game.path().join("plugins/SleepSkip.dll"), b"loose").unwrap();

        let mut p = Profile::new("Test".into(), "".into());
        p.mods.push(installed_mod("Author-SleepSkip", "real mod"));

        let added = register_manual_mods(&mut p, game.path()).unwrap();

        assert!(added.is_empty());
        assert_eq!(p.mods.len(), 1);
        assert_eq!(p.mods[0].full_name, "Author-SleepSkip");
    }

    #[test]
    fn manual_placeholder_is_pruned_when_tracked_mod_provides_dll() {
        let game = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(game.path().join("plugins/Author-SleepSkip")).unwrap();
        std::fs::write(
            game.path().join("plugins/Author-SleepSkip/SleepSkip.dll"),
            b"managed",
        )
        .unwrap();
        std::fs::write(game.path().join("plugins/SleepSkip.dll"), b"loose").unwrap();

        let mut p = Profile::new("Test".into(), "".into());
        p.mods.push(installed_mod("Author-SleepSkip", "real mod"));
        p.mods.push(manual_placeholder("SleepSkip.dll"));

        register_manual_mods(&mut p, game.path()).unwrap();

        assert_eq!(p.mods.len(), 1);
        assert_eq!(p.mods[0].full_name, "Author-SleepSkip");
    }

    #[test]
    fn manual_placeholder_is_pruned_when_file_is_gone() {
        let game = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(game.path().join("plugins")).unwrap();

        let mut p = Profile::new("Test".into(), "".into());
        p.mods.push(manual_placeholder("Gone.dll"));

        register_manual_mods(&mut p, game.path()).unwrap();

        assert!(p.mods.is_empty());
    }

    #[test]
    fn deleted_archives_are_listed_newest_first() {
        let dir = tempfile::tempdir().unwrap();
        let archived = dir.path().join("MySetup-1758580000000000000");
        std::fs::create_dir_all(&archived).unwrap();
        let mut profile = Profile::new("MySetup".into(), String::new());
        profile.mods.push(installed_mod("Author-Mod", "desc"));
        std::fs::write(
            archived.join("profile.json"),
            serde_json::to_vec(&profile).unwrap(),
        )
        .unwrap();
        // An archive with no profile.json falls back to its folder name.
        std::fs::create_dir_all(dir.path().join("Legacy-1700000000000000000")).unwrap();

        let listed = deleted_profiles_in(dir.path()).unwrap();

        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0].name, "MySetup");
        assert_eq!(listed[0].mods, 1);
        assert!(listed[0].deleted_at.starts_with("2025"));
        assert_eq!(listed[1].name, "Legacy");
        assert_eq!(listed[1].mods, 0);
    }

    #[test]
    fn rejects_paths_and_empty_profile_names() {
        for name in [
            "",
            "..",
            "../Default",
            "/tmp/data",
            "a/b",
            "a\\b",
            ".hidden",
            " Default ",
        ] {
            assert!(validate_name(name).is_err());
        }
        assert!(validate_name("RelicHeim-Mac-Test").is_ok());
    }
    #[test]
    fn round_trip_preserves_loose_disabled_and_config_files() {
        let game = tempfile::tempdir().unwrap();
        let saved = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(game.path().join("plugins/Manual")).unwrap();
        std::fs::write(game.path().join("plugins/Manual/mod.dll"), b"manual").unwrap();
        std::fs::write(game.path().join("plugins/Loose.dll"), b"loose").unwrap();
        std::fs::create_dir_all(game.path().join("plugins_disabled/Disabled")).unwrap();
        std::fs::write(
            game.path().join("plugins_disabled/Disabled/mod.dll"),
            b"disabled",
        )
        .unwrap();
        std::fs::create_dir_all(game.path().join("config")).unwrap();
        std::fs::write(game.path().join("config/custom.cfg"), b"custom").unwrap();
        let mut p = Profile::new("Test".into(), "".into());
        assert_eq!(register_manual_mods(&mut p, game.path()).unwrap().len(), 3);
        assert!(
            !p.mods
                .iter()
                .find(|m| m.full_name == "Disabled")
                .unwrap()
                .enabled
        );
        replace_bepinex_dirs(game.path(), saved.path()).unwrap();
        let restored = tempfile::tempdir().unwrap();
        replace_bepinex_dirs(saved.path(), restored.path()).unwrap();
        assert_eq!(
            std::fs::read(restored.path().join("plugins/Loose.dll")).unwrap(),
            b"loose"
        );
        assert_eq!(
            std::fs::read(restored.path().join("config/custom.cfg")).unwrap(),
            b"custom"
        );
    }
    #[test]
    fn missing_disabled_folder_does_not_resurrect_mods() {
        let game = tempfile::tempdir().unwrap();
        let saved = tempfile::tempdir().unwrap();
        std::fs::create_dir(saved.path().join("plugins_disabled")).unwrap();
        std::fs::write(saved.path().join("plugins_disabled/Old.dll"), b"old").unwrap();
        replace_bepinex_dirs(game.path(), saved.path()).unwrap();
        assert!(!saved.path().join("plugins_disabled/Old.dll").exists());
    }
    #[cfg(unix)]
    #[test]
    fn failed_staging_leaves_live_data_intact() {
        let source = tempfile::tempdir().unwrap();
        let live = tempfile::tempdir().unwrap();
        std::fs::create_dir(source.path().join("plugins")).unwrap();
        std::os::unix::fs::symlink("/missing", source.path().join("plugins/Unsafe")).unwrap();
        std::fs::create_dir(live.path().join("plugins")).unwrap();
        std::fs::write(live.path().join("plugins/Original.dll"), b"preserve").unwrap();
        assert!(replace_bepinex_dirs(source.path(), live.path()).is_err());
        assert_eq!(
            std::fs::read(live.path().join("plugins/Original.dll")).unwrap(),
            b"preserve"
        );
    }
}
