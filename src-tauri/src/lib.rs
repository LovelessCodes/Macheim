use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::Manager;

pub mod commands;
pub mod error;
pub mod models;
pub mod services;

use models::ThunderstorePackage;

/// App handle for emitting global events from services.
pub static APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// Migrate app data from old directory name to new one.
fn migrate_app_data_dir() {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return,
    };
    let old = home.join("Library/Application Support/com.valheim-mod-manager");
    let new = home.join("Library/Application Support/com.macheim");
    if old.exists() && !new.exists() {
        if let Err(e) = std::fs::rename(&old, &new) {
            tracing::warn!("Failed to migrate app data: {}", e);
        } else {
            tracing::info!("Migrated app data from {:?} to {:?}", old, new);
        }
    }
}

/// Global application state shared across Tauri commands.
pub struct AppState {
    pub operation_lock: Arc<tokio::sync::Mutex<()>>,
    /// Path to the Valheim app bundle (e.g., .../Valheim/valheim.app)
    pub game_path: Option<PathBuf>,
    /// Whether BepInEx is currently installed
    pub bepinex_installed: bool,
    /// Name of the currently active mod profile
    pub active_profile: String,
    /// Cached package data from all stores (Thunderstore + Hexium)
    pub package_cache: Option<Vec<ThunderstorePackage>>,
    /// When the package cache was last updated
    pub cache_updated_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Persisted app preferences (loaded at startup).
    pub settings: services::app_settings::AppSettings,
    /// Latest crash report collected by the launch watcher.
    pub last_crash: Option<services::crash_analyzer::CrashReport>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            operation_lock: Arc::new(tokio::sync::Mutex::new(())),
            game_path: None,
            bepinex_installed: false,
            active_profile: "Default".to_string(),
            package_cache: None,
            cache_updated_at: None,
            settings: services::app_settings::load(),
            last_crash: None,
        }
    }
}

/// Serialize filesystem mutations across async commands; never hold the state lock over I/O awaits.
pub fn lock_operation(
    state: &Mutex<AppState>,
) -> error::AppResult<tokio::sync::OwnedMutexGuard<()>> {
    let lock = state
        .lock()
        .map_err(|e| error::AppError::Mod(e.to_string()))?
        .operation_lock
        .clone();
    lock.try_lock_owned().map_err(|_| {
        error::AppError::Mod(
            "Another operation is in progress. Please wait for it to finish.".into(),
        )
    })
}

/// Wait for the operation lock instead of failing. Used by commands that must
/// run after a queued install step finishes (e.g. launching the game).
pub async fn lock_operation_wait(
    state: &Mutex<AppState>,
) -> error::AppResult<tokio::sync::OwnedMutexGuard<()>> {
    let lock = state
        .lock()
        .map_err(|e| error::AppError::Mod(e.to_string()))?
        .operation_lock
        .clone();
    Ok(lock.lock_owned().await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing for structured logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    // Migrate app data from old name if needed
    migrate_app_data_dir();

    tracing::info!("Starting Macheim");

    // Ensure the default profile exists
    if let Err(e) = services::profile_manager::ensure_default_profile() {
        tracing::warn!("Failed to create default profile: {}", e);
    }

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .manage(Mutex::new(AppState::default()))
        .setup(|app| {
            let _ = APP_HANDLE.set(app.handle().clone());

            // Live install queue: survives navigation and app restarts, and
            // pauses itself while Valheim runs or the network is down.
            let queue = Arc::new(services::download_queue::DownloadQueue::open_default());
            app.manage(Arc::clone(&queue));
            services::download_queue::spawn_worker(app.handle().clone());

            // Warm the in-memory package cache from disk. The frontend can
            // serve its listing from the persisted query cache without ever
            // calling fetch_packages, and parsing the package files on the
            // first detail open would stall for seconds.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                let packages = services::package_sources::cached_packages_any_age();
                if packages.is_empty() {
                    return;
                }
                if let Ok(mut state) = handle.state::<Mutex<AppState>>().lock() {
                    if state.package_cache.is_none() {
                        state.package_cache = Some(packages);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Game detection
            commands::game::detect_game,
            commands::game::get_game_status,
            commands::game::get_steam_status,
            commands::game::set_game_path,
            // BepInEx management
            commands::bepinex::install_bepinex,
            commands::bepinex::uninstall_bepinex,
            // Thunderstore
            commands::thunderstore::fetch_packages,
            commands::thunderstore::get_package_details,
            commands::thunderstore::thunderstore_auth_status,
            commands::thunderstore::thunderstore_sign_in,
            commands::thunderstore::thunderstore_sign_out,
            commands::thunderstore::valheim_categories,
            commands::thunderstore::publish_modpack,
            // Mod management
            commands::mods::uninstall_mod,
            commands::mods::uninstall_mods,
            commands::mods::set_mods_enabled,
            commands::mods::toggle_mod,
            commands::mods::set_mod_pinned,
            commands::mods::get_installed_mods,
            commands::mods::sync_mods,
            commands::mods::list_unmanaged_mods,
            commands::mods::open_plugins_folder,
            commands::conflicts::detect_mod_conflicts,
            // Diagnostics
            commands::diagnostics::get_last_crash_report,
            commands::diagnostics::analyze_crash_logs,
            commands::diagnostics::launch_safe_mode,
            commands::diagnostics::restore_safe_mode_mods,
            commands::diagnostics::get_safe_mode,
            commands::diagnostics::read_latest_log,
            commands::diagnostics::read_log_since,
            commands::diagnostics::open_log_folder,
            // Save snapshots
            commands::saves::get_save_overview,
            commands::saves::create_save_snapshot,
            commands::saves::restore_save_snapshot,
            commands::saves::delete_save_snapshot,
            // Download queue
            commands::downloads::get_download_queue,
            commands::downloads::enqueue_install,
            commands::downloads::enqueue_local_install,
            commands::downloads::pause_download,
            commands::downloads::resume_download,
            commands::downloads::cancel_download,
            commands::downloads::retry_download,
            commands::downloads::reinstall_download,
            commands::downloads::remove_download,
            commands::downloads::pause_all_downloads,
            commands::downloads::resume_all_downloads,
            commands::downloads::cancel_all_downloads,
            commands::downloads::clear_finished_downloads,
            // Profiles
            commands::profiles::list_profiles,
            commands::profiles::create_profile,
            commands::profiles::switch_profile,
            commands::profiles::delete_profile,
            commands::profiles::list_deleted_profiles,
            commands::profiles::restore_deleted_profile,
            commands::profiles::purge_deleted_profile,
            commands::profiles::purge_deleted_profiles,
            commands::profiles::clone_profile,
            commands::profiles::export_profile,
            commands::profiles::export_profile_file,
            commands::profiles::export_profile_modpack,
            commands::profiles::export_profile_code,
            commands::profiles::import_profile,
            commands::profiles::import_profile_file,
            commands::profiles::import_profile_code,
            commands::profiles::get_active_profile,
            // App settings
            commands::settings::get_app_settings,
            commands::settings::set_console_enabled,
            commands::settings::set_snapshot_saves,
            // Config editor
            commands::config::get_config_files,
            commands::config::get_config,
            commands::config::save_config,
            // Backups
            commands::backup::create_backup,
            commands::backup::list_backups,
            commands::backup::restore_backup,
            // Launch
            commands::launch::launch_modded,
            commands::launch::launch_vanilla,
            commands::compatibility::get_compatibility,
            commands::compatibility::apply_compatibility,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
