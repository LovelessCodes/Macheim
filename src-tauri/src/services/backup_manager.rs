use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tracing::info;
use zip::write::SimpleFileOptions;

use crate::error::{AppError, AppResult};
use crate::models::Profile;
use crate::services::profile_manager;
use crate::services::thunderstore_client;

/// Metadata for a backup file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub filename: String,
    pub profile_name: String,
    pub created_at: String,
    pub size: u64,
    pub path: String,
}

/// Get the backups directory.
fn get_backups_dir() -> PathBuf {
    thunderstore_client::get_app_data_dir().join("backups")
}

/// Create a backup of a profile.
/// The backup ZIP contains: profile.json + BepInEx/config/ directory.
pub fn create_backup(profile_name: &str) -> AppResult<BackupInfo> {
    profile_manager::validate_name(profile_name)?;
    info!("Creating backup of profile: {}", profile_name);

    let profile_dir = profile_manager::get_profile_dir(profile_name);
    if !profile_dir.exists() {
        return Err(AppError::Profile(format!(
            "Profile '{}' not found",
            profile_name
        )));
    }

    let backups_dir = get_backups_dir();
    std::fs::create_dir_all(&backups_dir)?;

    let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("{}_{}.zip", profile_name, timestamp);
    let backup_path = backups_dir.join(&filename);

    let file = std::fs::File::create(&backup_path)?;
    let mut zip_writer = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // Add profile.json
    let profile_json = profile_dir.join("profile.json");
    if profile_json.exists() {
        let content = std::fs::read_to_string(&profile_json)?;
        zip_writer.start_file("profile.json", options)?;
        zip_writer.write_all(content.as_bytes())?;
    }

    // Add BepInEx/config/ directory
    let config_dir = profile_dir.join("BepInEx").join("config");
    if config_dir.exists() {
        add_directory_to_zip(&mut zip_writer, &config_dir, "BepInEx/config", &options)?;
    }

    zip_writer.finish()?;

    let size = std::fs::metadata(&backup_path)?.len();

    let info = BackupInfo {
        filename,
        profile_name: profile_name.to_string(),
        created_at: Utc::now().to_rfc3339(),
        size,
        path: backup_path.display().to_string(),
    };

    info!("Backup created: {}", info.filename);
    Ok(info)
}

/// List all available backups.
pub fn list_backups() -> AppResult<Vec<BackupInfo>> {
    let backups_dir = get_backups_dir();
    let mut backups = Vec::new();

    if !backups_dir.exists() {
        return Ok(backups);
    }

    for entry in std::fs::read_dir(&backups_dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "zip" {
                    let filename = entry.file_name().to_string_lossy().to_string();
                    let size = entry.metadata().map(|m| m.len()).unwrap_or(0);

                    // Try to extract profile name from filename (format: "ProfileName_YYYYMMDD_HHMMSS.zip")
                    let profile_name = filename
                        .rsplit('_')
                        .nth(2) // Skip HHMMSS and YYYYMMDD
                        .map(|_rest| {
                            // Everything before the last two underscores
                            let parts: Vec<&str> = filename.rsplitn(3, '_').collect();
                            if parts.len() == 3 {
                                parts[2].to_string()
                            } else {
                                filename.trim_end_matches(".zip").to_string()
                            }
                        })
                        .unwrap_or_else(|| filename.trim_end_matches(".zip").to_string());

                    let created_at = entry
                        .metadata()
                        .ok()
                        .and_then(|m| m.created().ok())
                        .map(|t| {
                            let dt: chrono::DateTime<Utc> = t.into();
                            dt.to_rfc3339()
                        })
                        .unwrap_or_default();

                    backups.push(BackupInfo {
                        filename,
                        profile_name,
                        created_at,
                        size,
                        path: path.display().to_string(),
                    });
                }
            }
        }
    }

    // Sort by date, newest first
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(backups)
}

/// Restore a backup: extract it, create a profile, copy configs.
/// Mods listed in profile.json will need to be re-downloaded by the caller.
pub fn restore_backup(backup_filename: &str) -> AppResult<Profile> {
    profile_manager::validate_name(backup_filename)?;
    let backup_path = get_backups_dir().join(backup_filename);

    if !backup_path.exists() {
        return Err(AppError::Profile(format!(
            "Backup '{}' not found",
            backup_filename
        )));
    }

    info!("Restoring backup: {}", backup_filename);

    let file = std::fs::File::open(&backup_path)?;
    let mut archive = zip::ZipArchive::new(file)?;

    // Extract profile.json first to get the profile metadata
    let profile: Profile = {
        let mut profile_file = archive
            .by_name("profile.json")
            .map_err(|_| AppError::Profile("Backup does not contain profile.json".to_string()))?;
        let mut content = String::new();
        profile_file.read_to_string(&mut content)?;
        serde_json::from_str(&content)?
    };

    // Check if profile already exists, generate new name if so
    let profile_name = {
        let base_name = profile.name.clone();
        profile_manager::validate_name(&base_name)?;
        for m in &profile.mods {
            profile_manager::validate_name(&m.full_name)?;
        }
        let mut name = base_name.clone();
        let mut counter = 1;
        while profile_manager::get_profile_dir(&name).exists() {
            name = format!("{}_restored_{}", base_name, counter);
            counter += 1;
        }
        name
    };

    // Create the profile directory
    let profile_dir = profile_manager::get_profile_dir(&profile_name);
    std::fs::create_dir_all(&profile_dir)?;
    std::fs::create_dir_all(profile_dir.join("BepInEx/plugins"))?;
    std::fs::create_dir_all(profile_dir.join("BepInEx/config"))?;
    std::fs::create_dir_all(profile_dir.join("BepInEx/patchers"))?;

    // Extract all files from the backup
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let outpath = profile_dir.join(file.mangled_name());

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

    // Update the profile metadata with the new name
    let mut restored_profile = profile;
    restored_profile.name = profile_name.clone();
    restored_profile.touch();
    profile_manager::save_profile(&restored_profile)?;

    info!("Backup restored as profile: {}", profile_name);
    Ok(restored_profile)
}

/// Recursively add a directory to a ZIP archive.
fn add_directory_to_zip<W: Write + std::io::Seek>(
    zip_writer: &mut zip::ZipWriter<W>,
    dir: &Path,
    prefix: &str,
    options: &SimpleFileOptions,
) -> AppResult<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let zip_path = format!("{}/{}", prefix, name);

        if path.is_dir() {
            zip_writer.add_directory(&zip_path, *options)?;
            add_directory_to_zip(zip_writer, &path, &zip_path, options)?;
        } else {
            let content = std::fs::read(&path)?;
            zip_writer.start_file(&zip_path, *options)?;
            zip_writer.write_all(&content)?;
        }
    }

    Ok(())
}
