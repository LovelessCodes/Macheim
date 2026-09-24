use std::collections::HashSet;
use std::path::Path;
use std::sync::{Arc, Mutex};

use tracing::{info, warn};

use crate::error::{AppError, AppResult};
use crate::models::{InstalledAs, InstalledMod, ThunderstorePackage};
use crate::services::download_queue::{InstallControl, LocalArchiveMeta};
use crate::services::{
    dependency_resolver, game_detector, launcher, mod_installer, package_sources, profile_manager,
    thunderstore_client,
};
use crate::AppState;

/// A local archive queued for installation, with the identity resolved when it
/// was enqueued.
pub struct LocalSource<'a> {
    pub path: &'a Path,
    pub name: &'a str,
    pub meta: Option<&'a LocalArchiveMeta>,
}

/// Progress update emitted while a package installs.
#[derive(Debug, Clone)]
pub struct InstallProgress {
    /// "resolving" | "downloading" | "installing" | "done"
    pub stage: &'static str,
    pub mod_name: String,
    pub current: usize,
    pub total: usize,
    pub bytes_downloaded: u64,
    pub bytes_total: Option<u64>,
    pub message: String,
}

/// Receives progress updates while a package installs. Threaded through
/// download callbacks, so it must own its captures.
pub type ProgressReporter = Arc<dyn Fn(InstallProgress) + Send + Sync>;

/// Where the package payload comes from.
enum TargetSource {
    Store { download_url: String },
    Local { zip: Vec<u8> },
}

/// Everything needed to install the requested package itself. Dependencies
/// are resolved separately from `dependencies`.
struct TargetInfo {
    author: String,
    name: String,
    full_name: String,
    version: String,
    description: String,
    icon: String,
    dependencies: Vec<String>,
    source: TargetSource,
}

impl TargetInfo {
    fn from_store(
        packages: &[ThunderstorePackage],
        full_name: &str,
        version: Option<&str>,
    ) -> AppResult<Self> {
        let pkg = thunderstore_client::find_package(packages, full_name)
            .ok_or_else(|| AppError::Mod(format!("Package '{}' not found", full_name)))?;

        let target_version = version
            .or_else(|| pkg.versions.first().map(|v| v.version_number.as_str()))
            .ok_or_else(|| AppError::Mod("No version available".to_string()))?;

        let ver = pkg
            .versions
            .iter()
            .find(|v| v.version_number == target_version)
            .ok_or_else(|| AppError::Mod("Version not found".to_string()))?;

        Ok(Self {
            author: pkg.owner.clone(),
            name: pkg.name.clone(),
            full_name: pkg.full_name.clone(),
            version: ver.version_number.clone(),
            description: ver.description.clone(),
            icon: ver.icon.clone(),
            dependencies: ver.dependencies.clone(),
            source: TargetSource::Store {
                download_url: ver.download_url.clone(),
            },
        })
    }

    fn from_local(
        full_name: &str,
        name: &str,
        version: Option<&str>,
        meta: &LocalArchiveMeta,
        zip: Vec<u8>,
    ) -> Self {
        Self {
            author: meta.author.clone(),
            name: name.to_string(),
            full_name: full_name.to_string(),
            version: version.unwrap_or("1.0.0").to_string(),
            description: meta.description.clone(),
            icon: meta.icon.clone().unwrap_or_default(),
            dependencies: meta.dependencies.clone(),
            source: TargetSource::Local { zip },
        }
    }

    fn from_local_info(info: mod_installer::LocalModInfo, zip: Vec<u8>) -> Self {
        Self {
            author: info.author,
            name: info.name,
            full_name: info.full_name,
            version: info.version.unwrap_or_else(|| "1.0.0".to_string()),
            description: info.description,
            icon: info.icon.unwrap_or_default(),
            dependencies: info.dependencies,
            source: TargetSource::Local { zip },
        }
    }
}

/// Install a package and all its dependencies. Shared by the direct command
/// and the queued worker.
///
/// `local_path` switches the target from a store download to a user-supplied
/// archive; its manifest (when present) supplies name, version and
/// dependencies.
///
/// `control` lets a queue item be paused or cancelled mid-flight. When it
/// reports aborted, the pipeline returns `AppError::Cancelled` at the next
/// checkpoint. Downloads hold no partial state, so resuming restarts them.
pub async fn install_package(
    full_name: &str,
    version: Option<&str>,
    local: Option<LocalSource<'_>>,
    state: &Mutex<AppState>,
    control: Option<&Arc<InstallControl>>,
    reporter: &ProgressReporter,
) -> AppResult<Vec<InstalledMod>> {
    launcher::ensure_game_stopped()?;
    profile_manager::validate_name(full_name)?;

    let local_source = match local {
        Some(source) => {
            info!("Installing local archive: {}", source.path.display());
            let zip = std::fs::read(source.path).map_err(|e| {
                AppError::Mod(format!("Could not read '{}': {}", source.path.display(), e))
            })?;
            Some((source, zip))
        }
        None => {
            info!("Installing package: {} (version: {:?})", full_name, version);
            None
        }
    };

    let (game_path, mut cached_packages, active_profile) = {
        let state = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;

        let game_path = state
            .game_path
            .clone()
            .ok_or_else(|| AppError::Mod("Game path not set".to_string()))?;

        (
            game_path,
            state.package_cache.clone(),
            state.active_profile.clone(),
        )
    };

    // Store installs always need the package list; local installs only need it
    // when their manifest declares dependencies (or when a pre-meta queue item
    // has to be re-derived).
    let needs_packages = match &local_source {
        Some((source, _)) => source.meta.is_none_or(|meta| !meta.dependencies.is_empty()),
        None => true,
    };
    if needs_packages && cached_packages.is_none() {
        info!("Package cache not loaded, fetching packages first...");
        let packages = package_sources::fetch_all_packages(false).await?;
        let mut state = state
            .lock()
            .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?;
        state.package_cache = Some(packages.clone());
        state.cache_updated_at = Some(chrono::Utc::now());
        cached_packages = Some(packages);
    }
    let packages = cached_packages.unwrap_or_default();

    let game_root = game_detector::get_valheim_root(&game_path);

    let target = match local_source {
        Some((source, zip)) => match source.meta {
            Some(meta) => TargetInfo::from_local(full_name, source.name, version, meta, zip),
            None => {
                let info = mod_installer::describe_local_zip(source.path, &zip, &packages)?;
                TargetInfo::from_local_info(info, zip)
            }
        },
        None => TargetInfo::from_store(&packages, full_name, version)?,
    };
    let full_name = target.full_name.clone();

    // Get currently installed mods to skip existing deps. Presence is judged by
    // files on disk, not profile metadata: an imported profile lists its mods
    // before anything has been downloaded.
    let profile = profile_manager::load_profile(&active_profile)?;
    let installed_set: HashSet<String> = profile
        .mods
        .iter()
        .filter(|m| mod_installer::mod_files_present(&m.full_name, &game_root))
        .map(|m| m.full_name.clone())
        .collect();

    // Resolve dependencies
    report(
        reporter,
        "resolving",
        &full_name,
        0,
        0,
        "Resolving dependencies...".to_string(),
    );

    let deps =
        dependency_resolver::resolve_dependencies(&target.dependencies, &packages, &installed_set)?;

    let total_items = deps.len() + 1; // deps + target mod
    let mut installed_mods = Vec::new();
    let mut failed_mods: Vec<String> = Vec::new();

    let abort: Option<thunderstore_client::AbortFn> = control.map(|control| {
        let control = Arc::clone(control);
        Arc::new(move || control.is_aborted()) as thunderstore_client::AbortFn
    });

    // Install dependencies first (in topological order)
    for (idx, dep) in deps.iter().enumerate() {
        if installed_set.contains(&dep.full_name) {
            continue;
        }

        ensure_not_aborted(control)?;

        report(
            reporter,
            "downloading",
            &dep.full_name,
            idx + 1,
            total_items,
            format!("Downloading {} ({}/{})", dep.name, idx + 1, total_items),
        );

        let app_reporter = Arc::clone(reporter);
        let dep_name = dep.full_name.clone();
        let dep_idx = idx + 1;

        let dep_zip = match thunderstore_client::download_mod_with_progress(
            &dep.download_url,
            Some(Box::new(move |downloaded, total| {
                app_reporter(InstallProgress {
                    stage: "downloading",
                    mod_name: dep_name.clone(),
                    current: dep_idx,
                    total: total_items,
                    bytes_downloaded: downloaded,
                    bytes_total: total,
                    message: "Downloading...".to_string(),
                });
            })),
            abort.clone(),
        )
        .await
        {
            Ok(zip) => zip,
            // Retryable failures abort the whole item so the queue can resume
            // it later instead of recording a partial install.
            Err(
                err @ (AppError::Cancelled | AppError::NetworkTransient(_) | AppError::GameRunning),
            ) => {
                return Err(err);
            }
            Err(e) => {
                warn!("Failed to download {}: {}, skipping", dep.full_name, e);
                failed_mods.push(dep.full_name.clone());
                continue;
            }
        };

        launcher::ensure_game_stopped()?;
        ensure_not_aborted(control)?;

        report(
            reporter,
            "installing",
            &dep.full_name,
            idx + 1,
            total_items,
            format!("Installing {} ({}/{})", dep.name, idx + 1, total_items),
        );

        // Find dependency info for its own deps
        let dep_pkg = thunderstore_client::find_package(&packages, &dep.full_name);
        let dep_dependencies: Vec<String> = dep_pkg
            .and_then(|p| p.versions.first())
            .map(|v| v.dependencies.clone())
            .unwrap_or_default();

        let installed = mutate_under_lock(state, control, || {
            launcher::ensure_game_stopped()?;
            let installed = mod_installer::install_mod_from_bytes(
                &dep.author,
                &dep.name,
                &dep.version,
                &dep.description,
                &dep.icon,
                &dep_dependencies,
                InstalledAs::Dependency,
                &dep_zip,
                &game_root,
            )?;
            profile_manager::add_mod_to_profile(&active_profile, installed.clone())?;
            Ok(installed)
        })
        .await;

        match installed {
            Ok(installed) => installed_mods.push(installed),
            // Retryable at item level: stop here so the queue can come back.
            Err(AppError::GameRunning) => return Err(AppError::GameRunning),
            Err(e) => {
                warn!("Failed to install {}: {}, skipping", dep.full_name, e);
                failed_mods.push(dep.full_name.clone());
            }
        }
    }

    // Install the target mod itself. Reinstall when a different version is
    // requested so users can switch between versions, and when the profile
    // lists the mod but its files are missing (an imported profile).
    let installed_version = profile
        .mods
        .iter()
        .find(|m| m.full_name == full_name)
        .filter(|_| mod_installer::mod_files_present(&full_name, &game_root))
        .map(|m| m.version.as_str());
    let version_changed = installed_version != Some(target.version.as_str());

    if version_changed {
        ensure_not_aborted(control)?;

        if installed_version.is_some() {
            // Remove the old version's files so stale files don't linger.
            mutate_under_lock(state, control, || {
                launcher::ensure_game_stopped()?;
                mod_installer::uninstall_mod(&full_name, &game_root)
            })
            .await?;
        }

        let target_zip = acquire_target_bytes(&target, total_items, reporter, &abort).await?;

        launcher::ensure_game_stopped()?;
        ensure_not_aborted(control)?;

        let action = match &target.source {
            TargetSource::Local { .. } => "Installing {} from file",
            TargetSource::Store { .. } => "Installing {}",
        };
        report(
            reporter,
            "installing",
            &full_name,
            total_items,
            total_items,
            action.replace("{}", &target.name),
        );

        let installed = mutate_under_lock(state, control, || {
            launcher::ensure_game_stopped()?;
            let installed = mod_installer::install_mod_from_bytes(
                &target.author,
                &target.name,
                &target.version,
                &target.description,
                &target.icon,
                &target.dependencies,
                InstalledAs::Explicit,
                &target_zip,
                &game_root,
            )?;
            profile_manager::add_mod_to_profile(&active_profile, installed.clone())?;
            Ok(installed)
        })
        .await?;

        installed_mods.push(installed);
    }

    report(
        reporter,
        "done",
        &full_name,
        total_items,
        total_items,
        format!(
            "Done! {} installed, {} failed",
            installed_mods.len(),
            failed_mods.len()
        ),
    );

    info!(
        "Successfully installed {} mods ({} failed)",
        installed_mods.len(),
        failed_mods.len()
    );
    mutate_under_lock(state, control, || {
        crate::services::compatibility::reconcile(
            &profile_manager::load_profile(&active_profile)?,
            &game_root,
        )
    })
    .await?;
    if !failed_mods.is_empty() {
        return Err(AppError::Mod(format!("Partially installed: {} succeeded. Failed dependencies: {}. Resolve these before playing; successful files were retained.", installed_mods.len(), failed_mods.join(", "))));
    }
    Ok(installed_mods)
}

/// Fetch the target payload: download it for store packages, reuse the local
/// archive bytes otherwise.
async fn acquire_target_bytes(
    target: &TargetInfo,
    total_items: usize,
    reporter: &ProgressReporter,
    abort: &Option<thunderstore_client::AbortFn>,
) -> AppResult<Vec<u8>> {
    match &target.source {
        TargetSource::Local { zip } => Ok(zip.clone()),
        TargetSource::Store { download_url } => {
            report(
                reporter,
                "downloading",
                &target.full_name,
                total_items,
                total_items,
                format!("Downloading {}", target.name),
            );

            let app_reporter = Arc::clone(reporter);
            let name = target.full_name.clone();

            thunderstore_client::download_mod_with_progress(
                download_url,
                Some(Box::new(move |downloaded, total| {
                    app_reporter(InstallProgress {
                        stage: "downloading",
                        mod_name: name.clone(),
                        current: total_items,
                        total: total_items,
                        bytes_downloaded: downloaded,
                        bytes_total: total,
                        message: "Downloading...".to_string(),
                    });
                })),
                abort.clone(),
            )
            .await
        }
    }
}

/// Run a filesystem mutation under the shared operation lock, re-checking
/// that Valheim is not running once the lock is held. Downloads stay outside
/// the lock so launching the game is never blocked behind a large download.
async fn mutate_under_lock<T>(
    state: &Mutex<AppState>,
    control: Option<&Arc<InstallControl>>,
    mutation: impl FnOnce() -> AppResult<T>,
) -> AppResult<T> {
    let lock = state
        .lock()
        .map_err(|e| AppError::Mod(format!("Failed to lock state: {}", e)))?
        .operation_lock
        .clone();
    let _guard = lock.lock_owned().await;
    // The user may have paused or queued something else while we waited.
    ensure_not_aborted(control)?;
    mutation()
}

fn ensure_not_aborted(control: Option<&Arc<InstallControl>>) -> AppResult<()> {
    match control {
        Some(control) if control.is_aborted() => Err(AppError::Cancelled),
        _ => Ok(()),
    }
}

fn report(
    reporter: &ProgressReporter,
    stage: &'static str,
    mod_name: &str,
    current: usize,
    total: usize,
    message: String,
) {
    (reporter)(InstallProgress {
        stage,
        mod_name: mod_name.to_string(),
        current,
        total,
        bytes_downloaded: 0,
        bytes_total: None,
        message,
    });
}
