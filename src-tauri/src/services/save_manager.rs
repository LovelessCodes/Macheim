use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::error::{AppError, AppResult};
use crate::services::thunderstore_client::get_app_data_dir;

/// Valheim's Unity persistent data folder, newest path first.
const SAVE_DIR_CANDIDATES: [&str; 2] = [
    "Library/Application Support/IronGate/Valheim",
    "Library/Application Support/irongamesteam/Valheim",
];

const WORLD_SUFFIXES: [&str; 4] = ["db.old", "fwl.old", "db", "fwl"];
const CHARACTER_SUFFIXES: [&str; 2] = ["fch.old", "fch"];

/// Steam Cloud manifests are recreated by the client; restoring an old copy
/// would only confuse it.
const EXCLUDED_FILES: [&str; 1] = ["steam_autocloud.vdf"];

/// Automatic pre-launch snapshots kept around before old ones are pruned.
const MAX_AUTO_SNAPSHOTS: usize = 5;
/// Back-to-back launches reuse the newest automatic snapshot.
const AUTO_SNAPSHOT_MIN_AGE_SECS: i64 = 120;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SaveWorld {
    pub name: String,
    pub files: usize,
    pub size: u64,
    pub modified: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SaveSnapshot {
    pub id: String,
    pub label: String,
    pub created_at: String,
    pub size: u64,
    pub automatic: bool,
    pub worlds: usize,
    pub characters: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct SaveOverview {
    pub save_dir: Option<String>,
    pub worlds: Vec<SaveWorld>,
    pub characters: Vec<SaveWorld>,
    pub snapshots: Vec<SaveSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SnapshotMeta {
    id: String,
    label: String,
    created_at: String,
    size: u64,
    automatic: bool,
    #[serde(default)]
    worlds: usize,
    #[serde(default)]
    characters: usize,
}

/// Locate the Valheim save folder on this machine.
pub fn find_save_dir() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let candidates: Vec<PathBuf> = SAVE_DIR_CANDIDATES
        .iter()
        .map(|relative| home.join(relative))
        .collect();
    first_existing(&candidates)
}

fn first_existing(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|path| path.is_dir()).cloned()
}

pub fn snapshots_dir() -> PathBuf {
    get_app_data_dir().join("save-snapshots")
}

/// Worlds and characters present in the save folder, plus stored snapshots.
pub fn overview(save_dir: Option<&Path>) -> AppResult<SaveOverview> {
    let (worlds, characters) = match save_dir {
        Some(dir) => (
            collect_groups(&dir.join("worlds"), &WORLD_SUFFIXES),
            collect_groups(&dir.join("characters"), &CHARACTER_SUFFIXES),
        ),
        None => (Vec::new(), Vec::new()),
    };

    Ok(SaveOverview {
        save_dir: save_dir.map(|dir| dir.to_string_lossy().to_string()),
        worlds,
        characters,
        snapshots: list_snapshots(&snapshots_dir())?,
    })
}

/// Group `<world>.fwl` / `<world>.db` (and their `.old` companions) into one
/// entry per world.
fn collect_groups(dir: &Path, suffixes: &[&str]) -> Vec<SaveWorld> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut groups: BTreeMap<String, (usize, u64, Option<SystemTime>)> = BTreeMap::new();
    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        if EXCLUDED_FILES.contains(&file_name.as_str()) {
            continue;
        }
        let Some(base) = strip_known_suffix(&file_name, suffixes) else {
            continue;
        };
        let Ok(metadata) = entry.metadata() else {
            continue;
        };

        let group = groups.entry(base).or_insert((0, 0, None));
        group.0 += 1;
        group.1 += metadata.len();
        if let Ok(modified) = metadata.modified() {
            group.2 = Some(match group.2 {
                Some(current) if current > modified => current,
                _ => modified,
            });
        }
    }

    groups
        .into_iter()
        .map(|(name, (files, size, modified))| SaveWorld {
            name,
            files,
            size,
            modified: modified.map(|time| chrono::DateTime::<chrono::Utc>::from(time).to_rfc3339()),
        })
        .collect()
}

fn strip_known_suffix(file_name: &str, suffixes: &[&str]) -> Option<String> {
    for suffix in suffixes {
        if let Some(base) = file_name
            .strip_suffix(suffix)
            .and_then(|base| base.strip_suffix('.'))
        {
            if !base.is_empty() {
                return Some(base.to_string());
            }
        }
    }
    None
}

/// Snapshot the whole save folder. Fails when there is nothing to copy so the
/// UI can explain that no world exists yet.
pub fn create_snapshot(
    save_dir: &Path,
    snapshots_dir: &Path,
    label: &str,
    automatic: bool,
) -> AppResult<SaveSnapshot> {
    let worlds = save_dir.join("worlds");
    let characters = save_dir.join("characters");
    if !has_save_files(&worlds, &WORLD_SUFFIXES)
        && !has_save_files(&characters, &CHARACTER_SUFFIXES)
    {
        return Err(AppError::Mod(
            "No save files found to snapshot. Create a world or character in Valheim first.".into(),
        ));
    }

    let id = unique_snapshot_id(snapshots_dir)?;
    let target = snapshots_dir.join(&id);
    std::fs::create_dir_all(&target)?;

    let (world_size, world_files) =
        copy_save_files(&worlds, &target.join("worlds"), &WORLD_SUFFIXES)?;
    let (character_size, character_files) =
        copy_save_files(&characters, &target.join("characters"), &CHARACTER_SUFFIXES)?;
    let size = world_size + character_size;

    let snapshot = SaveSnapshot {
        id: id.clone(),
        label: label.to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        size,
        automatic,
        worlds: world_files,
        characters: character_files,
    };
    let meta = SnapshotMeta {
        id: id.clone(),
        label: snapshot.label.clone(),
        created_at: snapshot.created_at.clone(),
        size,
        automatic,
        worlds: world_files,
        characters: character_files,
    };
    std::fs::write(
        target.join("meta.json"),
        serde_json::to_string_pretty(&meta)?,
    )?;

    info!("Save snapshot {} created ({} bytes)", id, size);
    Ok(snapshot)
}

fn has_save_files(dir: &Path, suffixes: &[&str]) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    entries.flatten().any(|entry| {
        let name = entry.file_name().to_string_lossy().to_string();
        !EXCLUDED_FILES.contains(&name.as_str()) && strip_known_suffix(&name, suffixes).is_some()
    })
}

/// Copy save files into a snapshot folder. Returns the copied bytes and files.
fn copy_save_files(source: &Path, target: &Path, suffixes: &[&str]) -> AppResult<(u64, usize)> {
    let Ok(entries) = std::fs::read_dir(source) else {
        return Ok((0, 0));
    };

    let mut bytes = 0;
    let mut files = 0;
    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        if EXCLUDED_FILES.contains(&file_name.as_str())
            || strip_known_suffix(&file_name, suffixes).is_none()
        {
            continue;
        }
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        std::fs::create_dir_all(target)?;
        std::fs::copy(&path, target.join(&file_name))?;
        bytes += entry.metadata().map(|meta| meta.len()).unwrap_or(0);
        files += 1;
    }
    Ok((bytes, files))
}

fn unique_snapshot_id(snapshots_dir: &Path) -> AppResult<String> {
    let base = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    if !snapshots_dir.join(&base).exists() {
        return Ok(base);
    }
    for counter in 2..100 {
        let candidate = format!("{}-{}", base, counter);
        if !snapshots_dir.join(&candidate).exists() {
            return Ok(candidate);
        }
    }
    Err(AppError::Mod("Could not allocate a snapshot id".into()))
}

pub fn list_snapshots(snapshots_dir: &Path) -> AppResult<Vec<SaveSnapshot>> {
    let Ok(entries) = std::fs::read_dir(snapshots_dir) else {
        return Ok(Vec::new());
    };

    let mut snapshots = Vec::new();
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(entry.path().join("meta.json")) else {
            warn!(
                "Ignoring snapshot without meta.json: {:?}",
                entry.file_name()
            );
            continue;
        };
        match serde_json::from_str::<SnapshotMeta>(&raw) {
            Ok(meta) => snapshots.push(SaveSnapshot {
                id: meta.id,
                label: meta.label,
                created_at: meta.created_at,
                size: meta.size,
                automatic: meta.automatic,
                worlds: meta.worlds,
                characters: meta.characters,
            }),
            Err(e) => warn!("Ignoring unreadable snapshot meta: {}", e),
        }
    }

    snapshots.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(snapshots)
}

/// Replace the live saves with a snapshot. The caller must ensure the game is
/// stopped and take the operation lock. A safety snapshot of the current
/// state is taken first.
pub fn restore_snapshot(save_dir: &Path, snapshots_dir: &Path, id: &str) -> AppResult<()> {
    validate_snapshot_id(id)?;
    let source = snapshots_dir.join(id);
    if !source.join("meta.json").is_file() {
        return Err(AppError::Mod(format!("Snapshot '{}' not found", id)));
    }

    // Keep what is about to be replaced, unless the current saves are empty.
    if let Err(e) = create_snapshot(save_dir, snapshots_dir, "Before restore", false) {
        warn!("Could not snapshot current saves before restore: {}", e);
    }

    replace_save_folder(
        &source.join("worlds"),
        &save_dir.join("worlds"),
        &WORLD_SUFFIXES,
    )?;
    replace_save_folder(
        &source.join("characters"),
        &save_dir.join("characters"),
        &CHARACTER_SUFFIXES,
    )?;

    info!("Restored save snapshot {}", id);
    prune_auto_snapshots(snapshots_dir);
    Ok(())
}

/// Swap a save folder's contents for the snapshot's version, leaving files we
/// do not manage (e.g. Steam Cloud manifests) alone.
fn replace_save_folder(source: &Path, target: &Path, suffixes: &[&str]) -> AppResult<()> {
    if target.is_dir() {
        for entry in std::fs::read_dir(target)?.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if strip_known_suffix(&name, suffixes).is_some() {
                std::fs::remove_file(entry.path())?;
            }
        }
    }
    copy_save_files(source, target, suffixes)?;
    Ok(())
}

pub fn delete_snapshot(snapshots_dir: &Path, id: &str) -> AppResult<()> {
    validate_snapshot_id(id)?;
    let path = snapshots_dir.join(id);
    if !path.is_dir() {
        return Err(AppError::Mod(format!("Snapshot '{}' not found", id)));
    }
    std::fs::remove_dir_all(path)?;
    Ok(())
}

/// Keep only the newest automatic snapshots; manual ones are never pruned.
pub fn prune_auto_snapshots(snapshots_dir: &Path) {
    let Ok(snapshots) = list_snapshots(snapshots_dir) else {
        return;
    };
    let mut kept = 0;
    for snapshot in snapshots {
        if !snapshot.automatic {
            continue;
        }
        kept += 1;
        if kept > MAX_AUTO_SNAPSHOTS {
            if let Err(e) = delete_snapshot(snapshots_dir, &snapshot.id) {
                warn!("Failed to prune snapshot {}: {}", snapshot.id, e);
            }
        }
    }
}

/// Create the automatic pre-launch snapshot unless a very recent one exists.
/// Never fails a launch.
pub fn snapshot_before_launch() -> Option<SaveSnapshot> {
    let save_dir = find_save_dir()?;
    let snapshots_dir = snapshots_dir();

    if should_skip_recent(&snapshots_dir, chrono::Utc::now()) {
        info!("Skipping pre-launch snapshot: a recent automatic one exists");
        return None;
    }

    match create_snapshot(&save_dir, &snapshots_dir, "Before launch", true) {
        Ok(snapshot) => {
            prune_auto_snapshots(&snapshots_dir);
            Some(snapshot)
        }
        Err(e) => {
            warn!("Pre-launch save snapshot failed: {}", e);
            None
        }
    }
}

fn should_skip_recent(snapshots_dir: &Path, now: chrono::DateTime<chrono::Utc>) -> bool {
    let Ok(snapshots) = list_snapshots(snapshots_dir) else {
        return false;
    };
    let Some(newest) = snapshots.iter().find(|snapshot| snapshot.automatic) else {
        return false;
    };
    let Ok(created_at) = chrono::DateTime::parse_from_rfc3339(&newest.created_at) else {
        return false;
    };
    let age = now.signed_duration_since(created_at);
    age.num_seconds() < AUTO_SNAPSHOT_MIN_AGE_SECS && age.num_seconds() >= 0
}

fn validate_snapshot_id(id: &str) -> AppResult<()> {
    if id.is_empty()
        || id.len() > 64
        || id.starts_with('.')
        || id.contains(['/', '\\', ':'])
        || id.chars().any(char::is_control)
    {
        return Err(AppError::Mod(format!("Invalid snapshot id '{}'", id)));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_save_dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    fn write_save(dir: &Path, relative: &str, size: usize) {
        let path = dir.join(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        let mut file = std::fs::File::create(path).unwrap();
        file.write_all(&vec![b'x'; size]).unwrap();
    }

    #[test]
    fn save_dirs_are_detected_in_priority_order() {
        let first = tempfile::tempdir().unwrap();
        let second_root = tempfile::tempdir().unwrap();
        let second = second_root.path().join("nested");
        std::fs::create_dir_all(&second).unwrap();

        let found = first_existing(&[first.path().to_path_buf(), second.clone()]).unwrap();
        assert_eq!(found, first.path());
        assert_eq!(
            first_existing(std::slice::from_ref(&second)).unwrap(),
            second
        );
        assert!(first_existing(&[]).is_none());
    }

    #[test]
    fn worlds_and_characters_are_grouped_with_their_backups() {
        let save = temp_save_dir();
        write_save(save.path(), "worlds/Midgard.fwl", 10);
        write_save(save.path(), "worlds/Midgard.db", 100);
        write_save(save.path(), "worlds/Midgard.fwl.old", 5);
        write_save(save.path(), "worlds/Midgard.db.old", 50);
        write_save(save.path(), "worlds/steam_autocloud.vdf", 1);
        write_save(save.path(), "characters/Thor.fch", 20);
        write_save(save.path(), "characters/Thor.fch.old", 10);
        write_save(save.path(), "characters/notes.txt", 10);

        let overview = overview(Some(save.path())).unwrap();

        assert_eq!(overview.worlds.len(), 1);
        let world = &overview.worlds[0];
        assert_eq!(world.name, "Midgard");
        assert_eq!(world.files, 4);
        assert_eq!(world.size, 165);
        assert_eq!(overview.characters.len(), 1);
        assert_eq!(overview.characters[0].name, "Thor");
        assert_eq!(overview.characters[0].size, 30);
    }

    #[test]
    fn snapshots_copy_saves_and_skip_cloud_manifests() {
        let save = temp_save_dir();
        let snapshots = temp_save_dir();
        write_save(save.path(), "worlds/Midgard.db", 100);
        write_save(save.path(), "worlds/steam_autocloud.vdf", 1);
        write_save(save.path(), "characters/Thor.fch", 20);

        let snapshot = create_snapshot(save.path(), snapshots.path(), "Manual", false).unwrap();

        assert_eq!(snapshot.size, 120);
        assert_eq!(snapshot.worlds, 1);
        assert_eq!(snapshot.characters, 1);
        assert!(snapshots
            .path()
            .join(&snapshot.id)
            .join("worlds/Midgard.db")
            .is_file());
        assert!(snapshots
            .path()
            .join(&snapshot.id)
            .join("characters/Thor.fch")
            .is_file());
        assert!(!snapshots
            .path()
            .join(&snapshot.id)
            .join("worlds/steam_autocloud.vdf")
            .exists());
        assert_eq!(list_snapshots(snapshots.path()).unwrap().len(), 1);
    }

    #[test]
    fn characters_can_be_snapshotted_without_any_worlds() {
        let save = temp_save_dir();
        let snapshots = temp_save_dir();
        write_save(save.path(), "characters/Thor.fch", 30);
        write_save(save.path(), "worlds/steam_autocloud.vdf", 1);

        let snapshot =
            create_snapshot(save.path(), snapshots.path(), "Server character", false).unwrap();

        assert_eq!(snapshot.size, 30);
        assert_eq!(snapshot.worlds, 0);
        assert_eq!(snapshot.characters, 1);
        assert!(snapshots
            .path()
            .join(&snapshot.id)
            .join("characters/Thor.fch")
            .is_file());

        // Restoring it must also work with no worlds present.
        std::fs::remove_file(save.path().join("characters/Thor.fch")).unwrap();
        restore_snapshot(save.path(), snapshots.path(), &snapshot.id).unwrap();
        assert!(save.path().join("characters/Thor.fch").is_file());
    }

    #[test]
    fn snapshots_require_something_to_copy() {
        let save = temp_save_dir();
        let snapshots = temp_save_dir();
        write_save(save.path(), "worlds/steam_autocloud.vdf", 1);

        assert!(create_snapshot(save.path(), snapshots.path(), "Manual", false).is_err());
    }

    #[test]
    fn ids_are_unique_within_the_same_second() {
        let save = temp_save_dir();
        let snapshots = temp_save_dir();
        write_save(save.path(), "worlds/Midgard.db", 10);

        let first = create_snapshot(save.path(), snapshots.path(), "Manual", false).unwrap();
        let second = create_snapshot(save.path(), snapshots.path(), "Manual", false).unwrap();

        assert_ne!(first.id, second.id);
        assert_eq!(list_snapshots(snapshots.path()).unwrap().len(), 2);
    }

    #[test]
    fn restore_replaces_live_saves_and_keeps_a_safety_snapshot() {
        let save = temp_save_dir();
        let snapshots = temp_save_dir();
        write_save(save.path(), "worlds/Midgard.db", 100);
        let original =
            create_snapshot(save.path(), snapshots.path(), "Before edits", false).unwrap();

        // Diverge: replace the world and add a new one.
        write_save(save.path(), "worlds/Midgard.db", 999);
        write_save(save.path(), "worlds/NewWorld.db", 7);

        restore_snapshot(save.path(), snapshots.path(), &original.id).unwrap();

        let restored = std::fs::metadata(save.path().join("worlds/Midgard.db")).unwrap();
        assert_eq!(restored.len(), 100);
        assert!(!save.path().join("worlds/NewWorld.db").exists());
        // Original snapshot + "Before restore" safety snapshot.
        assert_eq!(list_snapshots(snapshots.path()).unwrap().len(), 2);
    }

    #[test]
    fn restore_rejects_path_traversal_and_missing_snapshots() {
        let save = temp_save_dir();
        let snapshots = temp_save_dir();

        assert!(restore_snapshot(save.path(), snapshots.path(), "../escape").is_err());
        assert!(restore_snapshot(save.path(), snapshots.path(), "missing").is_err());
        assert!(delete_snapshot(snapshots.path(), "../escape").is_err());
    }

    #[test]
    fn pruning_keeps_newest_automatic_snapshots_only() {
        let save = temp_save_dir();
        let snapshots = temp_save_dir();
        write_save(save.path(), "worlds/Midgard.db", 10);

        // Manual snapshots are dated after the autos and must survive.
        for _ in 0..MAX_AUTO_SNAPSHOTS + 2 {
            create_snapshot(save.path(), snapshots.path(), "Auto", true).unwrap();
        }
        create_snapshot(save.path(), snapshots.path(), "Manual", false).unwrap();
        prune_auto_snapshots(snapshots.path());

        let remaining = list_snapshots(snapshots.path()).unwrap();
        assert_eq!(
            remaining
                .iter()
                .filter(|snapshot| snapshot.automatic)
                .count(),
            MAX_AUTO_SNAPSHOTS
        );
        assert_eq!(
            remaining
                .iter()
                .filter(|snapshot| !snapshot.automatic)
                .count(),
            1
        );
    }

    #[test]
    fn recent_automatic_snapshots_suppress_launch_snapshots() {
        let snapshots = temp_save_dir();
        let save = temp_save_dir();
        write_save(save.path(), "worlds/Midgard.db", 10);
        create_snapshot(save.path(), snapshots.path(), "Auto", true).unwrap();

        // The snapshot was just created, so a launch right now is skipped.
        assert!(should_skip_recent(snapshots.path(), chrono::Utc::now()));
        let later = chrono::Utc::now() + chrono::Duration::seconds(AUTO_SNAPSHOT_MIN_AGE_SECS);
        assert!(!should_skip_recent(snapshots.path(), later));
    }
}
