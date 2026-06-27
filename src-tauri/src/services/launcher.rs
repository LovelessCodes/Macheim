use std::path::{Path, PathBuf};
use std::process::Command;

use tracing::info;

use crate::error::{AppError, AppResult};

/// Check if running on Apple Silicon.
pub fn is_apple_silicon() -> bool {
    let output = Command::new("sysctl")
        .arg("-n")
        .arg("hw.optional.arm64")
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            stdout.trim() == "1"
        }
        Err(_) => false,
    }
}

/// Read the CFBundleExecutable from the app's Info.plist.
pub fn get_bundle_executable(app_path: &Path) -> AppResult<String> {
    let info_plist = app_path.join("Contents/Info.plist");

    if !info_plist.exists() {
        return Err(AppError::GameNotFound(
            "Info.plist not found in app bundle".to_string(),
        ));
    }

    match plist::Value::from_file(&info_plist) {
        Ok(plist::Value::Dictionary(dict)) => {
            if let Some(plist::Value::String(executable)) = dict.get("CFBundleExecutable") {
                Ok(executable.clone())
            } else {
                Err(AppError::GameNotFound(
                    "CFBundleExecutable not found in Info.plist".to_string(),
                ))
            }
        }
        _ => Err(AppError::GameNotFound(
            "Failed to parse Info.plist".to_string(),
        )),
    }
}

/// Launch Valheim with BepInEx mod loader.
/// Replicates the exact method used by the working "Valheim Modded.app":
/// Opens Terminal.app and runs run_bepinex.sh there, creating a completely
/// independent process outside the Tauri app's process tree.
pub fn launch_modded(_app_path: &Path, game_root: &Path) -> AppResult<()> {
    info!("Launching Valheim with BepInEx...");

    // Find doorstop library (may be in root or doorstop_libs/)
    let doorstop = find_doorstop_lib(game_root)
        .or_else(|| find_doorstop_lib(&game_root.join("doorstop_libs")))
        .ok_or_else(|| {
            AppError::GameNotFound("doorstop library not found. Please reinstall BepInEx.".to_string())
        })?;

    // Remove quarantine from doorstop library
    let _ = Command::new("xattr")
        .args(["-dr", "com.apple.quarantine"])
        .arg(&doorstop)
        .output();

    // Verified working method: arch -x86_64 + env + direct DYLD injection
    // This bypasses run_bepinex.sh (which has arm64 conflict) and injects directly.
    let executable_name = get_bundle_executable(&game_root.join("valheim.app"))?;
    let executable = game_root.join("valheim.app/Contents/MacOS").join(&executable_name);
    let preloader = game_root.join("BepInEx/core/BepInEx.Preloader.dll");

    if !executable.exists() || !preloader.exists() {
        return Err(AppError::GameNotFound(format!(
            "Missing files: exec={} preloader={}",
            executable.exists(), preloader.exists()
        )));
    }

    // Write launcher script for Terminal.app (completely independent process)
    let launcher_script = game_root.join(".vmm_launch.sh");
    let script_content = format!(
        r#"#!/bin/bash
cd '{game_root}'
open /Applications/Steam.app
arch -x86_64 env \
  DOORSTOP_ENABLED=1 \
  DOORSTOP_TARGET_ASSEMBLY='{preloader}' \
  DYLD_LIBRARY_PATH='{game_root}/' \
  DYLD_INSERT_LIBRARIES='{doorstop}' \
  '{executable}' -console
"#,
        game_root = game_root.display(),
        preloader = preloader.display(),
        doorstop = doorstop.display(),
        executable = executable.display(),
    );
    std::fs::write(&launcher_script, &script_content)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&launcher_script)?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&launcher_script, perms)?;
    }

    info!("Launching via Terminal.app with direct DYLD injection (x86_64)");

    Command::new("open")
        .arg("-a")
        .arg("Terminal")
        .arg(&launcher_script)
        .spawn()
        .map_err(|e| AppError::GameNotFound(format!("Failed to launch game: {}", e)))?;

    info!("Valheim launched with BepInEx via x86_64 Rosetta");
    Ok(())
}

/// Launch Valheim vanilla (without mods) via Steam.
pub fn launch_vanilla() -> AppResult<()> {
    info!("Launching Valheim vanilla via Steam...");

    Command::new("open")
        .arg("steam://rungameid/892970")
        .spawn()
        .map_err(|e| AppError::GameNotFound(format!("Failed to launch Steam: {}", e)))?;

    info!("Valheim vanilla launch initiated");
    Ok(())
}

/// Find the doorstop library in a directory.
fn find_doorstop_lib(dir: &Path) -> Option<PathBuf> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name() {
                let name_str = name.to_string_lossy();
                if name_str.starts_with("libdoorstop") && name_str.ends_with(".dylib") {
                    return Some(path);
                }
            }
        }
    }
    None
}
