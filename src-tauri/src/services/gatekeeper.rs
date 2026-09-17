use std::path::Path;

use tracing::{debug, info, warn};

use crate::error::AppResult;

/// Check if a file has the com.apple.quarantine extended attribute.
pub fn has_quarantine(path: &Path) -> bool {
    let output = std::process::Command::new("xattr")
        .arg("-l")
        .arg(path)
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            stdout.contains("com.apple.quarantine")
        }
        Err(e) => {
            warn!("Failed to check quarantine for {}: {}", path.display(), e);
            false
        }
    }
}

/// Remove the quarantine extended attribute from a file or directory (recursively).
pub fn remove_quarantine(path: &Path) -> AppResult<()> {
    info!("Removing quarantine from: {}", path.display());

    let output = std::process::Command::new("xattr")
        .arg("-dr")
        .arg("com.apple.quarantine")
        .arg(path)
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // xattr returns error if attribute doesn't exist, which is fine
        if !stderr.contains("No such xattr") {
            warn!("xattr removal warning for {}: {}", path.display(), stderr);
        }
    }

    debug!("Quarantine removed from: {}", path.display());
    Ok(())
}

/// Remove quarantine from all .dylib files in a directory recursively.
pub fn remove_quarantine_from_dylibs(dir: &Path) -> AppResult<()> {
    if !dir.exists() {
        return Ok(());
    }

    // Remove quarantine from the entire directory first
    remove_quarantine(dir)?;

    // Then specifically target .dylib files
    visit_dylibs(dir)?;

    Ok(())
}

fn visit_dylibs(dir: &Path) -> AppResult<()> {
    if !dir.is_dir() {
        return Ok(());
    }

    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_dir() {
            visit_dylibs(&path)?;
        } else if let Some(ext) = path.extension() {
            if (ext == "dylib" || ext == "so") && has_quarantine(&path) {
                remove_quarantine(&path)?;
            }
        }
    }

    Ok(())
}
