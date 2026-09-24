use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::services::crash_analyzer;

/// Tail cap for the log viewer. A whole multi-hundred-megabyte log would choke
/// the webview, and viewers care about recent lines anyway.
pub const MAX_LOG_BYTES: u64 = 20 * 1024 * 1024;

/// A log file resolved for the viewer.
#[derive(Debug, Clone, Serialize)]
pub struct LogFile {
    /// Resolved log path, or `None` when no log exists yet.
    pub path: Option<String>,
    pub text: String,
    /// True when the file was larger than the cap and only the tail is shown.
    pub truncated: bool,
    /// Byte offset in the file where `text` ends, for continuing with
    /// [`read_log_since`].
    pub offset: u64,
}

/// Appended log content since an earlier read.
#[derive(Debug, Clone, Serialize)]
pub struct LogChunk {
    /// Resolved log path, or `None` when no log exists yet.
    pub path: Option<String>,
    /// Appended text, or the full (capped) contents when `reset` is true.
    pub text: String,
    /// Byte offset to pass to the next call.
    pub offset: u64,
    /// True when the viewer must replace its buffer: the resolved path changed
    /// or the file shrank below the given offset.
    pub reset: bool,
    pub truncated: bool,
}

/// Read the newest log the same way crash triage picks it: BepInEx's log when
/// present and non-empty, otherwise Unity's Player.log.
pub fn read_latest_log(game_root: &Path) -> AppResult<LogFile> {
    read_resolved(crash_analyzer::existing_log_path(game_root))
}

fn read_resolved(path: Option<PathBuf>) -> AppResult<LogFile> {
    let Some(path) = path else {
        return Ok(LogFile {
            path: None,
            text: String::new(),
            truncated: false,
            offset: 0,
        });
    };

    let (text, truncated) = read_capped(&path, MAX_LOG_BYTES)?;
    let offset = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    Ok(LogFile {
        path: Some(path.to_string_lossy().to_string()),
        text,
        truncated,
        offset,
    })
}

/// Read what was appended to the log since `offset` of `path`.
///
/// A changed resolved path or a file shorter than `offset` reports `reset`, so
/// the viewer replaces its buffer instead of stitching mismatched content.
pub fn read_log_since(game_root: &Path, path: Option<&str>, offset: u64) -> AppResult<LogChunk> {
    read_chunk(crash_analyzer::existing_log_path(game_root), path, offset)
}

fn read_chunk(
    resolved: Option<PathBuf>,
    previous: Option<&str>,
    offset: u64,
) -> AppResult<LogChunk> {
    let Some(path) = resolved else {
        return Ok(LogChunk {
            path: None,
            text: String::new(),
            offset: 0,
            reset: previous.is_some(),
            truncated: false,
        });
    };

    let path_str = path.to_string_lossy().to_string();
    let len = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let path_changed = previous != Some(path_str.as_str());

    // A changed path or a shrunken file means the log was recreated; start over.
    if path_changed || len < offset {
        let (text, truncated) = read_capped(&path, MAX_LOG_BYTES)?;
        return Ok(LogChunk {
            path: Some(path_str),
            text,
            offset: len,
            reset: true,
            truncated,
        });
    }

    // A long idle gap can leave more appended bytes than the cap allows.
    if len - offset > MAX_LOG_BYTES {
        let (text, _) = read_capped(&path, MAX_LOG_BYTES)?;
        return Ok(LogChunk {
            path: Some(path_str),
            text,
            offset: len,
            reset: true,
            truncated: true,
        });
    }

    let mut file = std::fs::File::open(&path)
        .map_err(|e| AppError::Mod(format!("Could not read {}: {}", path.display(), e)))?;
    file.seek(SeekFrom::Start(offset))?;
    let mut bytes = Vec::with_capacity((len - offset) as usize);
    file.read_to_end(&mut bytes)?;

    Ok(LogChunk {
        path: Some(path_str),
        text: String::from_utf8_lossy(&bytes).into_owned(),
        offset: offset + bytes.len() as u64,
        reset: false,
        truncated: false,
    })
}

/// Read a file, or its tail when it exceeds `cap`. A truncated read starts at
/// the first line boundary inside the window so the view never opens mid-line.
fn read_capped(path: &Path, cap: u64) -> AppResult<(String, bool)> {
    let mut file = std::fs::File::open(path)
        .map_err(|e| AppError::Mod(format!("Could not read {}: {}", path.display(), e)))?;
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);

    if len > cap {
        file.seek(SeekFrom::Start(len - cap))?;
        let mut bytes = Vec::with_capacity(cap as usize);
        file.read_to_end(&mut bytes)?;
        let start = bytes
            .iter()
            .position(|byte| *byte == b'\n')
            .map(|index| index + 1)
            .unwrap_or(0);
        Ok((String::from_utf8_lossy(&bytes[start..]).into_owned(), true))
    } else {
        let mut bytes = Vec::with_capacity(len as usize);
        file.read_to_end(&mut bytes)?;
        Ok((String::from_utf8_lossy(&bytes).into_owned(), false))
    }
}

/// The folder the viewer's "Open in Finder" reveals.
pub fn log_folder(game_root: &Path) -> PathBuf {
    game_root.join("BepInEx")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_small_files_whole() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("LogOutput.log");
        std::fs::write(&path, "line one\nline two\n").unwrap();

        let (text, truncated) = read_capped(&path, 1024).unwrap();

        assert_eq!(text, "line one\nline two\n");
        assert!(!truncated);
    }

    #[test]
    fn oversized_files_return_the_tail_from_a_line_boundary() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("LogOutput.log");
        let mut content = String::new();
        for index in 0..1000 {
            content.push_str(&format!("line {:04} padded\n", index));
        }
        std::fs::write(&path, &content).unwrap();

        let (text, truncated) = read_capped(&path, 100).unwrap();

        assert!(truncated);
        assert!(
            !text.starts_with("ine "),
            "tail must start at a line boundary"
        );
        assert!(text.ends_with("line 0999 padded\n"));
        assert!(content.ends_with(&text));
    }

    #[test]
    fn missing_log_reports_no_path() {
        let log = read_resolved(None).unwrap();

        assert!(log.path.is_none());
        assert!(log.text.is_empty());
        assert!(!log.truncated);
    }

    #[test]
    fn resolved_logs_report_their_path() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("LogOutput.log");
        std::fs::write(&path, "hello\n").unwrap();

        let log = read_resolved(Some(path.clone())).unwrap();

        assert_eq!(log.path.as_deref(), Some(path.to_string_lossy().as_ref()));
        assert_eq!(log.text, "hello\n");
        assert_eq!(log.offset, 6);
    }

    #[test]
    fn appends_only_bytes_after_the_offset() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("LogOutput.log");
        std::fs::write(&path, "abc\ndef\n").unwrap();
        let path_str = path.to_string_lossy().to_string();

        let chunk = read_chunk(Some(path.clone()), Some(&path_str), 4).unwrap();

        assert_eq!(chunk.text, "def\n");
        assert_eq!(chunk.offset, 8);
        assert!(!chunk.reset);
    }

    #[test]
    fn a_shrunken_file_reports_reset_with_full_contents() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("LogOutput.log");
        std::fs::write(&path, "fresh\n").unwrap();
        let path_str = path.to_string_lossy().to_string();

        let chunk = read_chunk(Some(path.clone()), Some(&path_str), 500).unwrap();

        assert!(chunk.reset);
        assert_eq!(chunk.text, "fresh\n");
        assert_eq!(chunk.offset, 6);
    }

    #[test]
    fn a_changed_path_reports_reset() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("LogOutput.log");
        std::fs::write(&path, "one\n").unwrap();

        let chunk = read_chunk(Some(path.clone()), Some("/somewhere/else.log"), 0).unwrap();

        assert!(chunk.reset);
        assert_eq!(chunk.text, "one\n");
    }

    #[test]
    fn a_vanished_log_resets_a_previous_path() {
        let chunk = read_chunk(None, Some("/somewhere/LogOutput.log"), 10).unwrap();

        assert!(chunk.path.is_none());
        assert!(chunk.reset);
        assert!(chunk.text.is_empty());
    }
}
