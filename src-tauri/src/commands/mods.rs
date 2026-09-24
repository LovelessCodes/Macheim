use std::collections::HashSet;
use std::sync::Mutex;

use tauri::Emitter;
use tracing::info;

use crate::error::{AppError, AppResult};
use crate::models::InstalledMod;
use crate::services::{
    game_detector, mod_installer, package_sources, profile_manager, thunderstore_client,
};
use crate::AppState;

/// Progress event payload sent to the frontend.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ProgressEvent {
    pub stage: String, // "resolving" | "downloading" | "installing" | "syncing"
    pub mod_name: String,
    pub current: usize, // current item index (1-based)
    pub total: usize,   // total items
    pub bytes_downloaded: u64,
    pub bytes_total: Option<u64>,
    pub message: String,
}

/// Uninstall a mod.
#[tauri::command]
pub async fn uninstall_mod(
    full_name: String,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<()> {
    info!("Command: uninstall_mod({})", full_name);
    let _operation = crate::lock_operation(&state)?;
    crate::services::launcher::ensure_game_stopped()?;
    profile_manager::validate_name(&full_name)?;

    let (game_path, active_profile) = {
        let state = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
        let game_path = state
            .game_path
            .clone()
            .ok_or_else(|| AppError::Mod("Game path not set".to_string()))?;
        let active_profile = state.active_profile.clone();
        (game_path, active_profile)
    };

    let game_root = game_detector::get_valheim_root(&game_path);
    mod_installer::uninstall_mod(&full_name, &game_root)?;
    profile_manager::remove_mod_from_profile(&active_profile, &full_name)?;
    crate::services::compatibility::reconcile(
        &profile_manager::load_profile(&active_profile)?,
        &game_root,
    )?;

    Ok(())
}

/// Outcome of a bulk mod action: mods that changed, and ones that could not.
#[derive(Debug, Clone, serde::Serialize)]
pub struct BulkModResult {
    pub changed: Vec<String>,
    pub failed: Vec<String>,
}

/// Enable or disable several mods in one pass. A mod that fails to move stays
/// untouched and is reported, so the rest of the batch still applies.
#[tauri::command]
pub async fn set_mods_enabled(
    full_names: Vec<String>,
    enable: bool,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<BulkModResult> {
    info!(
        "Command: set_mods_enabled({} mods, enable={})",
        full_names.len(),
        enable
    );
    let _operation = crate::lock_operation(&state)?;
    crate::services::launcher::ensure_game_stopped()?;

    let (game_path, active_profile) = {
        let state = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
        let game_path = state
            .game_path
            .clone()
            .ok_or_else(|| AppError::Mod("Game path not set".to_string()))?;
        let active_profile = state.active_profile.clone();
        (game_path, active_profile)
    };

    let game_root = game_detector::get_valheim_root(&game_path);
    let mut changed = Vec::new();
    let mut failed = Vec::new();
    for full_name in full_names {
        if profile_manager::validate_name(&full_name).is_err() {
            failed.push(full_name);
            continue;
        }
        match mod_installer::toggle_mod(&full_name, enable, &game_root) {
            Ok(_) => changed.push(full_name),
            Err(error) => {
                info!("Bulk toggle skipped {}: {}", full_name, error);
                failed.push(full_name);
            }
        }
    }

    profile_manager::set_mods_enabled(&active_profile, &changed, enable)?;
    crate::services::compatibility::reconcile(
        &profile_manager::load_profile(&active_profile)?,
        &game_root,
    )?;

    Ok(BulkModResult { changed, failed })
}

/// Uninstall several mods in one pass, reporting the ones that could not be
/// removed instead of aborting the batch.
#[tauri::command]
pub async fn uninstall_mods(
    full_names: Vec<String>,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<BulkModResult> {
    info!("Command: uninstall_mods({} mods)", full_names.len());
    let _operation = crate::lock_operation(&state)?;
    crate::services::launcher::ensure_game_stopped()?;

    let (game_path, active_profile) = {
        let state = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
        let game_path = state
            .game_path
            .clone()
            .ok_or_else(|| AppError::Mod("Game path not set".to_string()))?;
        let active_profile = state.active_profile.clone();
        (game_path, active_profile)
    };

    let game_root = game_detector::get_valheim_root(&game_path);
    let mut changed = Vec::new();
    let mut failed = Vec::new();
    for full_name in full_names {
        if profile_manager::validate_name(&full_name).is_err() {
            failed.push(full_name);
            continue;
        }
        match mod_installer::uninstall_mod(&full_name, &game_root) {
            Ok(()) => changed.push(full_name),
            Err(error) => {
                info!("Bulk uninstall skipped {}: {}", full_name, error);
                failed.push(full_name);
            }
        }
    }

    profile_manager::remove_mods_from_profile(&active_profile, &changed)?;
    crate::services::compatibility::reconcile(
        &profile_manager::load_profile(&active_profile)?,
        &game_root,
    )?;

    Ok(BulkModResult { changed, failed })
}

/// Enable or disable a mod.
#[tauri::command]
pub async fn toggle_mod(
    full_name: String,
    enable: bool,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<bool> {
    info!("Command: toggle_mod({}, enable={})", full_name, enable);
    let _operation = crate::lock_operation(&state)?;
    crate::services::launcher::ensure_game_stopped()?;
    profile_manager::validate_name(&full_name)?;

    let (game_path, active_profile) = {
        let state = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
        let game_path = state
            .game_path
            .clone()
            .ok_or_else(|| AppError::Mod("Game path not set".to_string()))?;
        let active_profile = state.active_profile.clone();
        (game_path, active_profile)
    };

    let game_root = game_detector::get_valheim_root(&game_path);
    let result = mod_installer::toggle_mod(&full_name, enable, &game_root)?;
    profile_manager::update_mod_enabled(&active_profile, &full_name, result)?;
    crate::services::compatibility::reconcile(
        &profile_manager::load_profile(&active_profile)?,
        &game_root,
    )?;

    Ok(result)
}

/// Hold a mod at its installed version, or release it. Pinning only changes
/// profile metadata, so it is safe while Valheim runs.
#[tauri::command]
pub async fn set_mod_pinned(
    full_name: String,
    pinned: bool,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<()> {
    info!("Command: set_mod_pinned({}, pinned={})", full_name, pinned);
    profile_manager::validate_name(&full_name)?;

    let active_profile = {
        let state = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
        state.active_profile.clone()
    };

    profile_manager::set_mod_pinned(&active_profile, &full_name, pinned)
}

/// Get list of installed mods for the active profile.
#[tauri::command]
pub async fn get_installed_mods(
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<Vec<InstalledMod>> {
    let active_profile = {
        let state = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
        state.active_profile.clone()
    };

    let profile = profile_manager::load_profile(&active_profile)?;
    Ok(profile.mods)
}

/// Sync mods: ensure all profile mods exist in the game directory,
/// and clean up unmanaged mods.
#[tauri::command]
pub async fn sync_mods(
    clean_unmanaged: Option<bool>,
    approved_unmanaged: Option<Vec<String>>,
    state: tauri::State<'_, Mutex<AppState>>,
    app: tauri::AppHandle,
) -> AppResult<SyncResult> {
    let result = sync_mods_inner(clean_unmanaged, approved_unmanaged, state, app.clone()).await;
    if let Err(err) = &result {
        emit_progress(
            &app,
            "error",
            "",
            0,
            0,
            0,
            None,
            &format!("Sync failed: {}", err),
        );
    }
    result
}

async fn sync_mods_inner(
    clean_unmanaged: Option<bool>,
    approved_unmanaged: Option<Vec<String>>,
    state: tauri::State<'_, Mutex<AppState>>,
    app: tauri::AppHandle,
) -> AppResult<SyncResult> {
    info!("Command: sync_mods");
    let _operation = crate::lock_operation(&state)?;
    crate::services::launcher::ensure_game_stopped()?;

    let (game_path, packages, active_profile) = {
        let s = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Lock: {}", e)))?;
        let gp = s
            .game_path
            .clone()
            .ok_or_else(|| AppError::Mod("Game not set".into()))?;
        let pkgs = s.package_cache.clone();
        (gp, pkgs, s.active_profile.clone())
    };

    let packages = match packages {
        Some(p) => p,
        None => {
            emit_progress(
                &app,
                "syncing",
                "",
                0,
                0,
                0,
                None,
                "Fetching package list...",
            );
            let p = package_sources::fetch_all_packages(false).await?;
            let mut s = state
                .lock()
                .map_err(|e| AppError::Mod(format!("Lock: {}", e)))?;
            s.package_cache = Some(p.clone());
            p
        }
    };

    let game_root = game_detector::get_valheim_root(&game_path);
    let plugins_dir = game_root.join("BepInEx/plugins");

    let profile = profile_manager::load_profile(&active_profile)?;

    // 1. Find missing mods
    let missing: Vec<_> = profile
        .mods
        .iter()
        .filter(|m| {
            if !m.enabled {
                return false;
            } // Sync must not re-enable disabled mods.
            let mod_dir = plugins_dir.join(&m.full_name);
            !mod_dir.exists() || dir_is_empty(&mod_dir)
        })
        .collect();

    let total = missing.len();
    let mut reinstalled = Vec::new();
    let mut failed = Vec::new();

    for (idx, m) in missing.iter().enumerate() {
        emit_progress(
            &app,
            "syncing",
            &m.full_name,
            idx + 1,
            total,
            0,
            None,
            &format!("Reinstalling {} ({}/{})", m.name, idx + 1, total),
        );

        let pkg = thunderstore_client::find_package(&packages, &m.full_name);
        if let Some(pkg) = pkg {
            let ver = pkg.versions.iter().find(|v| v.version_number == m.version);

            if let Some(ver) = ver {
                let app_clone = app.clone();
                let mod_name = m.full_name.clone();
                let idx_copy = idx + 1;

                match thunderstore_client::download_mod_with_progress(
                    &ver.download_url,
                    Some(Box::new(move |downloaded, total_bytes| {
                        emit_progress(
                            &app_clone,
                            "syncing",
                            &mod_name,
                            idx_copy,
                            total,
                            downloaded,
                            total_bytes,
                            "Downloading...",
                        );
                    })),
                    None,
                )
                .await
                {
                    Ok(zip) => {
                        match mod_installer::install_mod_from_bytes(
                            &pkg.owner,
                            &pkg.name,
                            &ver.version_number,
                            &ver.description,
                            &ver.icon,
                            &ver.dependencies,
                            &zip,
                            &game_root,
                        ) {
                            Ok(_) => reinstalled.push(m.full_name.clone()),
                            Err(e) => {
                                tracing::warn!("Reinstall failed {}: {}", m.full_name, e);
                                failed.push(m.full_name.clone());
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Download failed {}: {}", m.full_name, e);
                        failed.push(m.full_name.clone());
                    }
                }
            } else {
                failed.push(m.full_name.clone());
            }
        } else {
            failed.push(m.full_name.clone());
        }
    }

    // 2. Clean unmanaged mods
    let mut cleaned = Vec::new();
    if clean_unmanaged.unwrap_or(false) {
        let profile_names: HashSet<String> =
            profile.mods.iter().map(|m| m.full_name.clone()).collect();
        let approved: HashSet<String> =
            approved_unmanaged.unwrap_or_default().into_iter().collect();
        let recovery = game_root.join("BepInEx/.macheim-clean-backups").join(
            chrono::Utc::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
                .to_string(),
        );
        let managed_dlls =
            profile_manager::managed_dll_names(&profile.mods, &game_root.join("BepInEx"));

        if let Ok(entries) = std::fs::read_dir(&plugins_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let is_dir = entry.file_type()?.is_dir();
                let unmanaged_dir = is_dir
                    && !name.starts_with('.')
                    && name != crate::services::compatibility::MANAGED_DIR
                    && !profile_names.contains(&name);
                // Loose plugin files are leftovers once an installed mod
                // ships the same DLL from its own folder.
                let leftover_file = !is_dir
                    && profile_manager::is_plugin_file(&entry.path())
                    && managed_dlls.contains(&name.to_lowercase());
                if (unmanaged_dir || leftover_file) && approved.contains(&name) {
                    crate::services::compatibility::reject_symlink_ancestors(&entry.path())?;
                    std::fs::create_dir_all(&recovery)?;
                    std::fs::rename(entry.path(), recovery.join(&name))?;
                    cleaned.push(name);
                }
            }
        }
    }

    emit_progress(
        &app,
        "done",
        "",
        0,
        0,
        0,
        None,
        &format!(
            "Sync complete: {} reinstalled, {} failed, {} cleaned",
            reinstalled.len(),
            failed.len(),
            cleaned.len()
        ),
    );

    let result = SyncResult {
        reinstalled,
        failed,
        cleaned,
    };
    crate::services::compatibility::reconcile(
        &profile_manager::load_profile(&active_profile)?,
        &game_root,
    )?;
    Ok(result)
}

fn dir_is_empty(path: &std::path::Path) -> bool {
    if path.is_file() {
        return false;
    }
    match std::fs::read_dir(path) {
        Ok(mut entries) => entries.next().is_none(),
        Err(_) => true,
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SyncResult {
    pub reinstalled: Vec<String>,
    pub failed: Vec<String>,
    pub cleaned: Vec<String>,
}

/// List mods in the plugins directory that are not tracked by the current profile.
/// Used by the frontend to show a confirmation dialog before cleaning.
#[tauri::command]
pub async fn list_unmanaged_mods(
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<Vec<String>> {
    let (game_path, active_profile) = {
        let s = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Lock: {}", e)))?;
        let gp = s
            .game_path
            .clone()
            .ok_or_else(|| AppError::Mod("Game not set".into()))?;
        (gp, s.active_profile.clone())
    };

    let game_root = game_detector::get_valheim_root(&game_path);
    let plugins_dir = game_root.join("BepInEx/plugins");

    let profile = profile_manager::load_profile(&active_profile)?;

    let profile_names: HashSet<String> = profile.mods.iter().map(|m| m.full_name.clone()).collect();
    let managed_dlls =
        profile_manager::managed_dll_names(&profile.mods, &game_root.join("BepInEx"));
    let mut unmanaged = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&plugins_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type()?.is_dir();
            let unmanaged_dir = is_dir
                && !name.starts_with('.')
                && name != crate::services::compatibility::MANAGED_DIR
                && !profile_names.contains(&name);
            // Loose plugin leftovers of an installed mod are recoverable too.
            let leftover_file = !is_dir
                && profile_manager::is_plugin_file(&entry.path())
                && managed_dlls.contains(&name.to_lowercase());
            if unmanaged_dir || leftover_file {
                unmanaged.push(name);
            }
        }
    }

    Ok(unmanaged)
}

/// Reveal the active BepInEx plugins folder in Finder.
#[tauri::command]
pub async fn open_plugins_folder(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;

    info!("Command: open_plugins_folder");
    let game_path = {
        let s = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Lock: {}", e)))?;
        s.game_path
            .clone()
            .ok_or_else(|| AppError::Mod("Game not set".into()))?
    };

    let plugins_dir = game_detector::get_valheim_root(&game_path).join("BepInEx/plugins");
    if !plugins_dir.is_dir() {
        return Err(AppError::BepInEx(format!(
            "No plugins folder at {}. Install BepInEx first.",
            plugins_dir.display()
        )));
    }

    app.opener()
        .open_path(plugins_dir.to_string_lossy().to_string(), None::<String>)
        .map_err(|e| AppError::Mod(format!("Could not open the plugins folder: {}", e)))?;

    Ok(())
}

fn emit_progress(
    app: &tauri::AppHandle,
    stage: &str,
    mod_name: &str,
    current: usize,
    total: usize,
    bytes_downloaded: u64,
    bytes_total: Option<u64>,
    message: &str,
) {
    let _ = app.emit(
        "mod-progress",
        ProgressEvent {
            stage: stage.to_string(),
            mod_name: mod_name.to_string(),
            current,
            total,
            bytes_downloaded,
            bytes_total,
            message: message.to_string(),
        },
    );
}
