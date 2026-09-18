use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};
use tracing::{info, warn};

use crate::services::crash_analyzer;
use crate::services::launcher;
use crate::AppState;

/// How long to wait for Valheim's process to appear after a launch request.
const APPEAR_TIMEOUT: Duration = Duration::from_secs(60);
/// Exiting sooner than this after starting counts as a failed launch.
const CRASH_WINDOW: Duration = Duration::from_secs(180);
const POLL_INTERVAL: Duration = Duration::from_secs(3);

/// Incremented per watched launch so stale watchers stop reporting.
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// Start watching a launched game. When it exits unusually early, analyze the
/// log and emit a `game-crash` event.
pub fn watch_launch(app: AppHandle, modded: bool) {
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;

    tauri::async_runtime::spawn(async move {
        if !wait_for_start(generation, APPEAR_TIMEOUT).await {
            info!("Game process never appeared; skipping crash watch");
            return;
        }

        let started = Instant::now();
        loop {
            tokio::time::sleep(POLL_INTERVAL).await;
            if GENERATION.load(Ordering::SeqCst) != generation {
                // A newer launch took over this watch.
                return;
            }
            if !game_running() {
                let uptime = started.elapsed();
                if uptime < CRASH_WINDOW {
                    warn!(
                        "Valheim exited after {:?}; collecting a crash report",
                        uptime
                    );
                    report_crash(&app, modded);
                } else {
                    info!("Valheim exited after {:?}", uptime);
                }
                return;
            }
        }
    });
}

fn game_running() -> bool {
    matches!(launcher::is_game_running(), Ok(true))
}

async fn wait_for_start(generation: u64, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if GENERATION.load(Ordering::SeqCst) != generation {
            return false;
        }
        if game_running() {
            return true;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    false
}

fn report_crash(app: &AppHandle, modded: bool) {
    let (game_root, profile_name) = {
        let state = app.state::<std::sync::Mutex<AppState>>();
        let state = state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(game_path) = state.game_path.as_ref() else {
            return;
        };
        (
            crate::services::game_detector::get_valheim_root(game_path),
            state.active_profile.clone(),
        )
    };

    let mods = crate::services::profile_manager::load_profile(&profile_name)
        .map(|profile| profile.mods)
        .unwrap_or_default();
    let report = crash_analyzer::analyze(&game_root, &mods, modded);

    if let Ok(mut state) = app.state::<std::sync::Mutex<AppState>>().lock() {
        state.last_crash = Some(report.clone());
    }
    let _ = app.emit("game-crash", report);
}
