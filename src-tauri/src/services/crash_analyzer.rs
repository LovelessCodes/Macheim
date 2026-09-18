use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use regex::Regex;
use serde::Serialize;
use tracing::{info, warn};

use crate::models::InstalledMod;

/// How many lines from the end count as "right before the crash" when
/// weighing mod activity.
const ACTIVITY_WINDOW_LINES: usize = 200;
/// Exception blocks kept for the report (newest last in the log).
const MAX_EXCEPTIONS: usize = 3;
/// Log lines included verbatim in the report.
const LOG_TAIL_LINES: usize = 40;
const MAX_CULPRITS: usize = 5;
/// A logged error further than this from the end probably is not the crash.
const STALE_EXCEPTION_DISTANCE: usize = 150;

const ENGINE_LOG_SOURCES: [&str; 5] = [
    "Unity Log",
    "BepInEx",
    "HarmonyX",
    "HarmonyLib",
    "Preloader",
];

/// Unity `[Error]` lines that spam normal sessions and never mean a crash.
const BENIGN_ERROR_PATTERNS: [&str; 3] = [
    "Trying to add item to occupied slot",
    "Desired shader compiler platform",
    "shader blob",
];

fn is_benign(message: &str) -> bool {
    BENIGN_ERROR_PATTERNS
        .iter()
        .any(|pattern| message.contains(pattern))
}

fn looks_like_exception(exception: &LogException) -> bool {
    exception.kind.ends_with("Exception")
}

/// Plain-language crash category, derived from the last exception.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CrashKind {
    /// MissingMethod/MissingField/TypeLoad: a mod compiled against older game code.
    GameUpdateMismatch,
    /// DllNotFound/BadImageFormat: a native library is missing or wrong for macOS.
    MissingNativeLibrary,
    /// An exception inside Harmony-patched game code.
    PatchedCode,
    /// An unhelpful error, or none at all.
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogException {
    pub source: String,
    pub kind: String,
    pub message: String,
    pub frames: Vec<String>,
    /// Lines between this exception and the end of the log.
    pub lines_from_end: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct CrashCulprit {
    pub full_name: String,
    pub reason: String,
    pub score: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct CrashReport {
    pub analyzed_at: String,
    pub log_path: Option<String>,
    /// Set when Macheim watched this launch (modded vs vanilla).
    pub modded: bool,
    pub kind: CrashKind,
    pub summary: String,
    /// True when the newest logged error is far from the end of the log.
    pub stale_exception: bool,
    pub loaded_plugins: Vec<String>,
    pub exceptions: Vec<LogException>,
    pub likely_culprits: Vec<CrashCulprit>,
    pub log_tail: Vec<String>,
}

/// Where BepInEx writes its log inside the game folder.
pub fn default_log_path(game_root: &Path) -> PathBuf {
    game_root.join("BepInEx/LogOutput.log")
}

/// Fallback for installs without BepInEx logging (Unity's own log).
fn player_log_path() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    Some(home.join("Library/Application Support/IronGate/Valheim/Player.log"))
}

/// Analyze the most recent Valheim log and try to name the mod that crashed it.
pub fn analyze(game_root: &Path, mods: &[InstalledMod], modded: bool) -> CrashReport {
    let log_path = pick_log_path(game_root);
    let Some(log_path) = log_path else {
        return empty_report(None, modded, "No Valheim log file found to analyze.");
    };

    let raw = match std::fs::read_to_string(&log_path) {
        Ok(raw) => raw,
        Err(e) => {
            warn!("Could not read crash log {}: {}", log_path.display(), e);
            return empty_report(
                Some(&log_path),
                modded,
                "The Valheim log file could not be read.",
            );
        }
    };

    build_report(&log_path, &raw, mods, modded, game_root)
}

fn pick_log_path(game_root: &Path) -> Option<PathBuf> {
    let bepinex = default_log_path(game_root);
    if bepinex.is_file()
        && std::fs::metadata(&bepinex)
            .map(|m| m.len() > 0)
            .unwrap_or(false)
    {
        return Some(bepinex);
    }
    let player = player_log_path().filter(|path| path.is_file());
    player.or(Some(bepinex))
}

fn empty_report(log_path: Option<&Path>, modded: bool, summary: &str) -> CrashReport {
    CrashReport {
        analyzed_at: chrono::Utc::now().to_rfc3339(),
        log_path: log_path.map(|path| path.to_string_lossy().to_string()),
        modded,
        kind: CrashKind::Unknown,
        summary: summary.to_string(),
        stale_exception: false,
        loaded_plugins: Vec::new(),
        exceptions: Vec::new(),
        likely_culprits: Vec::new(),
        log_tail: Vec::new(),
    }
}

struct ParsedLog {
    loaded_plugins: Vec<String>,
    exceptions: Vec<LogException>,
    activity: HashMap<String, u32>,
    log_tail: Vec<String>,
}

fn parse_log(raw: &str) -> ParsedLog {
    let lines: Vec<&str> = raw.lines().collect();
    let total_lines = lines.len();

    let mut loaded_plugins = Vec::new();
    let mut exceptions: Vec<LogException> = Vec::new();
    let mut activity: HashMap<String, u32> = HashMap::new();

    let activity_start = total_lines.saturating_sub(ACTIVITY_WINDOW_LINES);

    let mut index = 0;
    while index < total_lines {
        let line = lines[index];

        if let Some(name) = parse_loading_line(line) {
            loaded_plugins.push(name);
        } else if let Some((source, message)) = parse_error_line(line) {
            let mut frames = Vec::new();
            if lines
                .get(index + 1)
                .is_some_and(|next| next.trim_start().starts_with("Stack trace:"))
            {
                index += 1;
                while let Some(frame) = lines.get(index + 1) {
                    let frame = frame.trim();
                    if frame.is_empty() || frame.starts_with('[') {
                        break;
                    }
                    frames.push(frame.to_string());
                    index += 1;
                }
            }
            exceptions.push(LogException {
                source,
                kind: exception_kind(&message),
                message,
                frames,
                lines_from_end: total_lines.saturating_sub(index),
            });
        }

        if index >= activity_start {
            if let Some(tag) = parse_mod_tag(line) {
                *activity.entry(tag).or_insert(0) += 1;
            }
        }

        index += 1;
    }

    let log_tail = lines
        .iter()
        .rev()
        .take(LOG_TAIL_LINES)
        .rev()
        .map(|line| line.to_string())
        .collect();

    ParsedLog {
        loaded_plugins,
        exceptions,
        activity,
        log_tail,
    }
}

/// `[Info   :   BepInEx] Loading [Better Archery 2.0.0]`
fn parse_loading_line(line: &str) -> Option<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r"^\[(?:Info|Message)\s*:\s*BepInEx\]\s*Loading \[(.+?)\s+v?\d[^\]]*\]\s*$")
            .expect("valid loading regex")
    });
    re.captures(line)
        .and_then(|captures| captures.get(1))
        .map(|name| name.as_str().trim().to_string())
}

fn parse_error_line(line: &str) -> Option<(String, String)> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r"^\[(?:Error|Fatal)\s*:\s*([^\]]+)\]\s*(.+)$").expect("valid error regex")
    });
    let captures = re.captures(line)?;
    Some((
        captures.get(1)?.as_str().trim().to_string(),
        captures.get(2)?.as_str().trim().to_string(),
    ))
}

/// `[Info   : BetterUI] ...` — a line written by a plugin rather than the engine.
fn parse_mod_tag(line: &str) -> Option<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r"^\[(?:Info|Message|Warning|Debug)\s*:\s*([^\]\s][^\]]*)\]\s+\S")
            .expect("valid tag regex")
    });
    let tag = re.captures(line)?.get(1)?.as_str().trim();
    if tag.is_empty() || ENGINE_LOG_SOURCES.contains(&tag) {
        return None;
    }
    Some(tag.to_string())
}

pub(crate) fn exception_kind(message: &str) -> String {
    message
        .split([':', ' '])
        .next()
        .filter(|token| token.ends_with("Exception") || token.ends_with("Error"))
        .unwrap_or("Error")
        .to_string()
}

fn classify(exception: Option<&LogException>) -> CrashKind {
    let Some(exception) = exception else {
        return CrashKind::Unknown;
    };
    let kind = exception.kind.as_str();
    if matches!(
        kind,
        "MissingMethodException"
            | "MissingFieldException"
            | "TypeLoadException"
            | "MissingMemberException"
    ) {
        return CrashKind::GameUpdateMismatch;
    }
    if matches!(
        kind,
        "DllNotFoundException" | "BadImageFormatException" | "EntryPointNotFoundException"
    ) {
        return CrashKind::MissingNativeLibrary;
    }
    if exception
        .frames
        .iter()
        .any(|frame| frame.contains("wrapper dynamic-method") || frame.contains("DMD<"))
    {
        return CrashKind::PatchedCode;
    }
    CrashKind::Unknown
}

fn summarize(kind: CrashKind, exception: Option<&LogException>) -> String {
    let Some(exception) = exception else {
        return "Valheim exited unexpectedly, but the log has no error to point at.".to_string();
    };
    match kind {
        CrashKind::GameUpdateMismatch => format!(
            "A mod uses game code that changed in a Valheim update ({}). Updating affected mods usually fixes this.",
            exception.kind
        ),
        CrashKind::MissingNativeLibrary => format!(
            "A mod needs a native library that is missing or not built for macOS ({}).",
            exception.kind
        ),
        CrashKind::PatchedCode => format!(
            "An exception was thrown inside a mod-patched game method ({}): {}",
            exception.kind, exception.message
        ),
        CrashKind::Unknown => format!("{}: {}", exception.kind, exception.message),
    }
}

fn build_report(
    log_path: &Path,
    raw: &str,
    mods: &[InstalledMod],
    modded: bool,
    game_root: &Path,
) -> CrashReport {
    let parsed = parse_log(raw);

    // Engine shutdown spam ("occupied slot", shader warnings) must not hide
    // the exception that actually ended the session.
    let relevant: Vec<&LogException> = parsed
        .exceptions
        .iter()
        .filter(|exception| !is_benign(&exception.message))
        .collect();
    let pool: Vec<&LogException> = if relevant.is_empty() {
        parsed.exceptions.iter().collect()
    } else {
        relevant
    };

    let last = pool
        .iter()
        .rev()
        .find(|exception| looks_like_exception(exception))
        .copied()
        .or_else(|| pool.last().copied());
    let kind = classify(last);
    let stale_exception =
        last.is_some_and(|exception| exception.lines_from_end > STALE_EXCEPTION_DISTANCE);

    let exceptions = pool
        .iter()
        .rev()
        .take(MAX_EXCEPTIONS)
        .map(|exception| (*exception).clone())
        .collect();

    let likely_culprits = rank_culprits(mods, last, &parsed, game_root);

    info!(
        "Crash analysis: {} exception(s), {} likely culprit(s)",
        parsed.exceptions.len(),
        likely_culprits.len()
    );

    CrashReport {
        analyzed_at: chrono::Utc::now().to_rfc3339(),
        log_path: Some(log_path.to_string_lossy().to_string()),
        modded,
        kind,
        summary: summarize(kind, last),
        stale_exception,
        loaded_plugins: parsed.loaded_plugins,
        exceptions,
        likely_culprits,
        log_tail: parsed.log_tail,
    }
}

fn rank_culprits(
    mods: &[InstalledMod],
    failure: Option<&LogException>,
    parsed: &ParsedLog,
    game_root: &Path,
) -> Vec<CrashCulprit> {
    // Everything the log says about the failure, normalized for matching.
    let error_text = failure
        .map(|exception| {
            let mut text = exception.message.clone();
            text.push(' ');
            text.push_str(&exception.frames.join(" "));
            text
        })
        .unwrap_or_default();
    let error_tokens = normalize(&error_text);

    let mut culprits: Vec<CrashCulprit> = mods
        .iter()
        .filter_map(|module| {
            let mut score = 0;
            let mut reasons: Vec<&str> = Vec::new();

            // Coarse token (mod display name) and fine tokens (its plugin dlls).
            let mut tokens = vec![normalize(&module.name)];
            tokens.extend(plugin_tokens(game_root, &module.full_name));

            if tokens.iter().any(|token| {
                token.len() >= 5 && !error_tokens.is_empty() && error_tokens.contains(token)
            }) {
                score += 100;
                reasons.push("named in the crash log");
            }

            let activity = parsed
                .activity
                .iter()
                .filter(|(tag, _)| module_matches_tag(module, tag))
                .map(|(_, count)| *count)
                .sum::<u32>();
            if activity > 0 {
                score += (activity * 5).min(30);
                reasons.push("was logging just before the crash");
            }

            (score > 0).then(|| CrashCulprit {
                full_name: module.full_name.clone(),
                reason: reasons.join("; "),
                score,
            })
        })
        .collect();

    culprits.sort_by_key(|culprit| std::cmp::Reverse(culprit.score));
    culprits.truncate(MAX_CULPRITS);
    culprits
}

/// Match a log tag like `BetterUI` or `NetworkPerformanceSystem` to a mod.
fn module_matches_tag(module: &InstalledMod, tag: &str) -> bool {
    if tag.eq_ignore_ascii_case(&module.name) {
        return true;
    }
    let tag = normalize(tag);
    let name = normalize(&module.name);
    name.len() >= 6 && tag.len() >= 6 && (tag.contains(&name) || name.contains(&tag))
}

/// Lowercased alphanumerics of every plugin file inside a mod's folder, so
/// `Apple.Core` in a stack trace can match `Apple.Core.dll`.
fn plugin_tokens(game_root: &Path, full_name: &str) -> Vec<String> {
    let dir = game_root.join("BepInEx/plugins").join(full_name);
    let mut tokens = Vec::new();
    collect_plugin_tokens(&dir, &mut tokens, 0);
    tokens
}

fn collect_plugin_tokens(dir: &Path, tokens: &mut Vec<String>, depth: usize) {
    if depth > 3 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_plugin_tokens(&path, tokens, depth + 1);
        } else if path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("dll"))
        {
            if let Some(stem) = path.file_stem() {
                tokens.push(normalize(&stem.to_string_lossy()));
            }
        }
    }
}

fn normalize(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn installed(name: &str, full_name: &str) -> InstalledMod {
        InstalledMod {
            full_name: full_name.to_string(),
            author: full_name.split('-').next().unwrap().to_string(),
            name: name.to_string(),
            version: "1.0.0".to_string(),
            description: String::new(),
            enabled: true,
            dependencies: Vec::new(),
            installed_at: String::new(),
            icon: String::new(),
        }
    }

    const LOG: &str = r#"[Info   :   BepInEx] BepInEx 5.4.2350
[Info   :   BepInEx] Loading [BetterUI 1.0.4]
[Info   :   BepInEx] Loading [ValheimFPSBoost 1.0.0]
[Info   : BetterUI] [BetterUI] Hotbar ready
[Info   : Unity Log] 09/16/2026 17:02:19: Setting selected recipe 1
[Error  : Unity Log] MissingMethodException: Method not found: void .Character.Message(MessageHud/MessageType,string,int,UnityEngine.Sprite)
Stack trace:
(wrapper dynamic-method) CraftingStation.DMD<CraftingStation::Interact>(CraftingStation,Humanoid,bool,bool)
(wrapper dynamic-method) Player.DMD<Player::Interact>(Player,UnityEngine.GameObject,bool,bool)

[Info   : BetterUI] [BetterUI] stats refreshed
[Info   : Unity Log] 09/16/2026 17:02:20: Setting selected recipe 1
[Info   : Unity Log] 09/16/2026 17:02:21: Disposing socket
"#;

    #[test]
    fn parses_plugins_exceptions_and_tags() {
        let parsed = parse_log(LOG);

        assert_eq!(
            parsed.loaded_plugins,
            vec!["BetterUI".to_string(), "ValheimFPSBoost".to_string()]
        );
        assert_eq!(parsed.exceptions.len(), 1);
        let exception = &parsed.exceptions[0];
        assert_eq!(exception.source, "Unity Log");
        assert_eq!(exception.kind, "MissingMethodException");
        assert_eq!(exception.frames.len(), 2);
        assert!(exception.lines_from_end < LOG.lines().count());
        assert_eq!(parsed.activity.get("BetterUI"), Some(&2));
        assert!(!parsed.activity.contains_key("Unity Log"));
    }

    #[test]
    fn classifies_game_update_and_native_library_failures() {
        let mismatch = LogException {
            source: "Unity Log".into(),
            kind: "MissingMethodException".into(),
            message: "Method not found".into(),
            frames: Vec::new(),
            lines_from_end: 1,
        };
        assert_eq!(classify(Some(&mismatch)), CrashKind::GameUpdateMismatch);

        let native = LogException {
            kind: "DllNotFoundException".into(),
            ..mismatch.clone()
        };
        assert_eq!(classify(Some(&native)), CrashKind::MissingNativeLibrary);

        let patched = LogException {
            kind: "NullReferenceException".into(),
            frames: vec!["(wrapper dynamic-method) Player.DMD<Player::Update>".into()],
            ..mismatch.clone()
        };
        assert_eq!(classify(Some(&patched)), CrashKind::PatchedCode);
        assert_eq!(classify(None), CrashKind::Unknown);
    }

    #[test]
    fn ranks_mods_named_in_the_stack_above_chatty_mods() {
        let mods = vec![
            installed("BetterUI", "Zenox-BetterUI"),
            installed("Jotunn", "ValheimModding-Jotunn"),
        ];
        let parsed = parse_log(
            r#"[Info   :   BepInEx] Loading [Jotunn 2.30.0]
[Error  : Unity Log] NullReferenceException: Object reference not set to an instance of an object
Stack trace:
Jotunn.Utils.AssetBundleHelper.Load (System.String path) (at <0000>:0)
(wrapper dynamic-method) Player.DMD<Player::Update>(Player)

[Info   : BetterUI] [BetterUI] stats refreshed
[Info   : BetterUI] [BetterUI] stats refreshed
"#,
        );

        let culprits = rank_culprits(
            &mods,
            parsed.exceptions.last(),
            &parsed,
            Path::new("/tmp/Valheim"),
        );

        assert_eq!(culprits.len(), 2);
        assert_eq!(culprits[0].full_name, "ValheimModding-Jotunn");
        assert!(culprits[0].reason.contains("named in the crash log"));
        assert_eq!(culprits[1].full_name, "Zenox-BetterUI");
    }

    #[test]
    fn report_flags_stale_exceptions_far_from_the_end() {
        let mut raw = String::from(
            "[Error  : Unity Log] MissingMethodException: Method not found\nStack trace:\n(wrapper dynamic-method) Player.DMD<Player::Update>(Player)\n",
        );
        for _ in 0..300 {
            raw.push_str("[Info   : Unity Log] still running\n");
        }

        let report = build_report(
            Path::new("/tmp/LogOutput.log"),
            &raw,
            &[],
            true,
            Path::new("/tmp/Valheim"),
        );

        assert!(report.stale_exception);
        assert_eq!(report.kind, CrashKind::GameUpdateMismatch);
        assert!(report.summary.contains("Valheim update"));
        assert_eq!(report.log_tail.len(), LOG_TAIL_LINES);
    }

    #[test]
    fn shutdown_spam_does_not_hide_the_real_exception() {
        let mut raw = String::from(
            "[Error  : Unity Log] MissingMethodException: Method not found: void .Character.Message(...)\nStack trace:\n(wrapper dynamic-method) Player.DMD<Player::Interact>(Player)\n",
        );
        for _ in 0..20 {
            raw.push_str("[Error  : Unity Log] 09/16/2026 17:24:06: Trying to add item to occupied slot -1, -1\n");
        }
        for _ in 0..5 {
            raw.push_str("[Error  : Unity Log] Desired shader compiler platform 14 is not available in shader blob\n");
        }

        let report = build_report(
            Path::new("/tmp/LogOutput.log"),
            &raw,
            &[installed("BetterUI", "Zenox-BetterUI")],
            true,
            Path::new("/tmp/Valheim"),
        );

        assert_eq!(report.kind, CrashKind::GameUpdateMismatch);
        assert_eq!(report.exceptions.len(), 1);
        assert!(report.exceptions[0].kind == "MissingMethodException");
        assert!(!report.stale_exception);
        assert!(report.summary.contains("Valheim update"));
    }

    #[test]
    fn an_empty_log_still_produces_a_report() {
        let report = build_report(
            Path::new("/tmp/LogOutput.log"),
            "",
            &[installed("BetterUI", "Zenox-BetterUI")],
            true,
            Path::new("/tmp/Valheim"),
        );

        assert_eq!(report.kind, CrashKind::Unknown);
        assert!(report.exceptions.is_empty());
        assert!(report.likely_culprits.is_empty());
        assert!(report.summary.contains("no error"));
    }
}
