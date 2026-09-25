use std::path::Path;

use tracing::{debug, info};

use crate::error::{AppError, AppResult};
use crate::models::ThunderstorePackage;
use crate::services::gatekeeper;
use crate::services::thunderstore_client;

const BEPINEX_PACKAGE_FULL_NAME: &str = "denikson-BepInExPack_Valheim";

/// Status of BepInEx installation
#[derive(Debug, Clone, serde::Serialize)]
pub struct BepInExStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub doorstop_found: bool,
    pub config_patched: bool,
}

/// Check BepInEx installation status at the given game root.
pub fn check_bepinex_status(game_root: &Path) -> BepInExStatus {
    let bepinex_dir = game_root.join("BepInEx");
    let bepinex_core = bepinex_dir.join("core");
    let doorstop_lib = game_root.join("libdoorstop.dylib");
    let doorstop_libs_dir = game_root.join("doorstop_libs");
    let doorstop_lib_alt = doorstop_libs_dir.join("libdoorstop.dylib");
    let doorstop_lib_x64 = doorstop_libs_dir.join("libdoorstop_x64.dylib");
    let bepinex_cfg = bepinex_dir.join("config").join("BepInEx.cfg");
    let run_script = game_root.join("run_bepinex.sh");
    let start_script = game_root.join("start_game_bepinex.sh");

    let has_doorstop =
        doorstop_lib.exists() || doorstop_lib_alt.exists() || doorstop_lib_x64.exists();
    let has_script = run_script.exists() || start_script.exists();
    let installed = bepinex_core.exists() && (has_doorstop || has_script);

    let version = if bepinex_core.exists() {
        read_bepinex_version(&bepinex_core)
    } else {
        None
    };

    let doorstop_found = has_doorstop;

    let config_patched = if bepinex_cfg.exists() {
        check_config_patched(&bepinex_cfg)
    } else {
        false
    };

    BepInExStatus {
        installed,
        version,
        doorstop_found,
        config_patched,
    }
}

/// Install BepInEx by downloading the Valheim pack from Thunderstore.
pub async fn install_bepinex(game_root: &Path, packages: &[ThunderstorePackage]) -> AppResult<()> {
    info!("Installing BepInEx to: {}", game_root.display());

    // 1. Find the BepInEx package
    let bepinex_pkg = thunderstore_client::find_package(packages, BEPINEX_PACKAGE_FULL_NAME)
        .ok_or_else(|| {
            AppError::BepInEx(format!(
                "BepInEx package '{}' not found in Thunderstore cache. Try refreshing packages first.",
                BEPINEX_PACKAGE_FULL_NAME
            ))
        })?;

    let latest_version = bepinex_pkg
        .versions
        .first()
        .ok_or_else(|| AppError::BepInEx("BepInEx package has no versions".to_string()))?;

    info!(
        "Downloading BepInEx version {}...",
        latest_version.version_number
    );

    // 2. Download the ZIP
    let zip_bytes = thunderstore_client::download_mod(&latest_version.download_url).await?;

    // 3. Extract to temp directory
    let temp_dir = tempfile::tempdir()?;
    extract_zip(&zip_bytes, temp_dir.path())?;

    // 4. Find the BepInExPack_Valheim subdirectory (mod packs nest their content)
    let pack_dir = temp_dir.path().join("BepInExPack_Valheim");
    let source_dir = if pack_dir.exists() {
        pack_dir
    } else {
        // Fallback: use temp dir directly
        temp_dir.path().to_path_buf()
    };

    // 5. Copy contents to game root
    copy_dir_contents(&source_dir, game_root)?;

    // 6. Make run_bepinex.sh executable
    let run_script = game_root.join("run_bepinex.sh");
    if run_script.exists() {
        set_executable(&run_script)?;
        info!("Made run_bepinex.sh executable");
    }

    // 7. Remove quarantine from doorstop library
    let doorstop_lib = game_root.join("libdoorstop.dylib");
    if doorstop_lib.exists() {
        gatekeeper::remove_quarantine(&doorstop_lib)?;
    }

    // Also check doorstop_libs directory
    let doorstop_libs = game_root.join("doorstop_libs");
    if doorstop_libs.exists() {
        gatekeeper::remove_quarantine_from_dylibs(&doorstop_libs)?;
    }

    // Remove quarantine from all BepInEx dylibs
    let bepinex_dir = game_root.join("BepInEx");
    if bepinex_dir.exists() {
        gatekeeper::remove_quarantine_from_dylibs(&bepinex_dir)?;
    }

    // 8. Patch BepInEx.cfg: Type = GameObject
    let bepinex_cfg = bepinex_dir.join("config").join("BepInEx.cfg");
    if bepinex_cfg.exists() {
        patch_bepinex_config(&bepinex_cfg)?;
    } else {
        debug!("BepInEx.cfg not found yet; it will be created on first run");
    }

    // 9. Verify
    let status = check_bepinex_status(game_root);
    if status.installed {
        info!("BepInEx installed successfully");
        Ok(())
    } else {
        Err(AppError::BepInEx(
            "BepInEx installation verification failed. Files may not have copied correctly."
                .to_string(),
        ))
    }
}

/// Uninstall BepInEx from the game root.
pub fn uninstall_bepinex(game_root: &Path) -> AppResult<()> {
    info!("Uninstalling BepInEx from: {}", game_root.display());

    let items_to_remove = [
        "BepInEx",
        "doorstop_config.ini",
        "run_bepinex.sh",
        "libdoorstop.dylib",
        "doorstop_libs",
        "changelog.txt",
        ".doorstop_version",
    ];

    for item in &items_to_remove {
        let path = game_root.join(item);
        if path.exists() {
            if path.is_dir() {
                std::fs::remove_dir_all(&path)?;
                debug!("Removed directory: {}", path.display());
            } else {
                std::fs::remove_file(&path)?;
                debug!("Removed file: {}", path.display());
            }
        }
    }

    info!("BepInEx uninstalled");
    Ok(())
}

/// Patch BepInEx.cfg to set Type = GameObject instead of Application.
/// This is required for BepInEx to work correctly on macOS with Unity.
fn patch_bepinex_config(cfg_path: &Path) -> AppResult<()> {
    info!("Patching BepInEx.cfg...");
    let content = std::fs::read_to_string(cfg_path)?;

    // Replace "Type = Application" with "Type = GameObject" in [Preloader.Entrypoint]
    let patched = content.replace("Type = Application", "Type = GameObject");

    if patched != content {
        std::fs::write(cfg_path, &patched)?;
        info!("Patched BepInEx.cfg: Type = GameObject");
    } else {
        debug!("BepInEx.cfg already has correct Type setting or setting not found");
    }

    Ok(())
}

/// Extract a ZIP archive from bytes to a target directory.
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

            // Preserve unix permissions
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = file.unix_mode() {
                    std::fs::set_permissions(&outpath, std::fs::Permissions::from_mode(mode))?;
                }
            }
        }
    }

    Ok(())
}

/// Copy all contents of src_dir into dst_dir, merging directories.
fn copy_dir_contents(src: &Path, dst: &Path) -> AppResult<()> {
    if !src.is_dir() {
        return Ok(());
    }

    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let file_name = entry.file_name();
        let dst_path = dst.join(&file_name);

        if src_path.is_dir() {
            std::fs::create_dir_all(&dst_path)?;
            copy_dir_contents(&src_path, &dst_path)?;
        } else {
            if let Some(parent) = dst_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&src_path, &dst_path)?;
            debug!("Copied: {} -> {}", src_path.display(), dst_path.display());
        }
    }

    Ok(())
}

/// Set a file as executable (chmod +x).
fn set_executable(path: &Path) -> AppResult<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(path)?.permissions();
        let mode = perms.mode() | 0o111;
        perms.set_mode(mode);
        std::fs::set_permissions(path, perms)?;
    }
    Ok(())
}

/// Installed BepInEx version for a game root, when it can be determined.
pub fn installed_version(game_root: &Path) -> Option<String> {
    read_bepinex_version(&game_root.join("BepInEx/core"))
}

/// Read BepInEx version from core directory.
fn read_bepinex_version(core_dir: &Path) -> Option<String> {
    // Try to find BepInEx.dll or similar and extract version
    // Or read from a version file
    let version_file = core_dir.parent()?.join("config").join("BepInEx.cfg");
    if version_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&version_file) {
            // Look for a version line
            for line in content.lines() {
                if line.contains("Version") && line.contains("=") {
                    let parts: Vec<&str> = line.splitn(2, '=').collect();
                    if parts.len() == 2 {
                        return Some(parts[1].trim().to_string());
                    }
                }
            }
        }
    }

    // Try to read from the .doorstop_version file
    let doorstop_version = core_dir
        .parent()
        .and_then(|p| p.parent())
        .map(|root| root.join(".doorstop_version"));

    if let Some(dv) = doorstop_version {
        if dv.exists() {
            if let Ok(v) = std::fs::read_to_string(&dv) {
                return Some(v.trim().to_string());
            }
        }
    }

    // Fallback: check for BepInEx.dll
    for entry in std::fs::read_dir(core_dir).ok()? {
        let entry = entry.ok()?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("BepInEx") && name.ends_with(".dll") {
            return Some("5.x".to_string());
        }
    }

    None
}

/// Check if BepInEx.cfg has been patched (Type = GameObject).
fn check_config_patched(cfg_path: &Path) -> bool {
    if let Ok(content) = std::fs::read_to_string(cfg_path) {
        content.contains("Type = GameObject")
    } else {
        false
    }
}
