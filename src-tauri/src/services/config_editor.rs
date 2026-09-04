use std::path::Path;

use serde::{Deserialize, Serialize};
use tracing::{debug, info};

use crate::error::AppResult;

/// A BepInEx .cfg file parsed into structured sections.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigFile {
    pub path: String,
    pub filename: String,
    pub sections: Vec<ConfigSection>,
}

/// A section in a .cfg file, e.g., [General].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigSection {
    pub name: String,
    pub entries: Vec<ConfigEntry>,
}

/// A single config entry with its metadata from comments.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigEntry {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub setting_type: Option<String>,
    #[serde(default)]
    pub default_value: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub acceptable_values: Option<String>,
    #[serde(default)]
    pub acceptable_value_range: Option<String>,
}

/// List all .cfg files in BepInEx/config directory.
pub fn list_config_files(game_root: &Path) -> AppResult<Vec<ConfigFileSummary>> {
    let config_dir = game_root.join("BepInEx").join("config");
    let mut files = Vec::new();

    if !config_dir.exists() {
        return Ok(files);
    }

    for entry in std::fs::read_dir(&config_dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "cfg" {
                    let filename = entry.file_name().to_string_lossy().to_string();
                    let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    files.push(ConfigFileSummary {
                        path: path.display().to_string(),
                        filename,
                        size,
                    });
                }
            }
        }
    }

    files.sort_by(|a, b| a.filename.cmp(&b.filename));
    Ok(files)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigFileSummary {
    pub path: String,
    pub filename: String,
    pub size: u64,
}

/// Parse a BepInEx .cfg file into structured data.
pub fn parse_config_file(path: &Path) -> AppResult<ConfigFile> {
    let content = std::fs::read_to_string(path)?;
    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let sections = parse_cfg_content(&content);

    Ok(ConfigFile {
        path: path.display().to_string(),
        filename,
        sections,
    })
}

/// Parse the content of a .cfg file.
fn parse_cfg_content(content: &str) -> Vec<ConfigSection> {
    let mut sections = Vec::new();
    let mut current_section: Option<ConfigSection> = None;

    // Metadata accumulated from comment lines preceding a key
    let mut pending_description = Vec::new();
    let mut pending_type: Option<String> = None;
    let mut pending_default: Option<String> = None;
    let mut pending_acceptable: Option<String> = None;
    let mut pending_range: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        // Section header
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            // Save previous section
            if let Some(section) = current_section.take() {
                sections.push(section);
            }

            let section_name = trimmed[1..trimmed.len() - 1].to_string();
            current_section = Some(ConfigSection {
                name: section_name,
                entries: Vec::new(),
            });

            // BepInEx writes the first entry's metadata immediately before the
            // section header, so carry it forward to the next key/value pair.
            continue;
        }

        // Comment lines with metadata
        if trimmed.starts_with("##") {
            // Description comment
            let desc = trimmed.trim_start_matches('#').trim();
            if !desc.is_empty() {
                pending_description.push(desc.to_string());
            }
            continue;
        }

        if trimmed.starts_with("# Setting type:") {
            pending_type = Some(
                trimmed
                    .trim_start_matches("# Setting type:")
                    .trim()
                    .to_string(),
            );
            continue;
        }

        if trimmed.starts_with("# Default value:") {
            pending_default = Some(
                trimmed
                    .trim_start_matches("# Default value:")
                    .trim()
                    .to_string(),
            );
            continue;
        }

        if trimmed.starts_with("# Acceptable values:") {
            pending_acceptable = Some(
                trimmed
                    .trim_start_matches("# Acceptable values:")
                    .trim()
                    .to_string(),
            );
            continue;
        }

        if trimmed.starts_with("# Acceptable value range:") {
            pending_range = Some(
                trimmed
                    .trim_start_matches("# Acceptable value range:")
                    .trim()
                    .to_string(),
            );
            continue;
        }

        // Skip other comments
        if trimmed.starts_with('#') || trimmed.is_empty() {
            continue;
        }

        // Key = Value line
        if let Some(eq_pos) = trimmed.find('=') {
            let key = trimmed[..eq_pos].trim().to_string();
            let value = trimmed[eq_pos + 1..].trim().to_string();

            let description = if pending_description.is_empty() {
                None
            } else {
                Some(pending_description.join("\n"))
            };

            let entry = ConfigEntry {
                key,
                value,
                setting_type: pending_type.take(),
                default_value: pending_default.take(),
                description,
                acceptable_values: pending_acceptable.take(),
                acceptable_value_range: pending_range.take(),
            };

            if let Some(section) = current_section.as_mut() {
                section.entries.push(entry);
            }

            pending_description.clear();
        }
    }

    // Don't forget the last section
    if let Some(section) = current_section {
        sections.push(section);
    }

    sections
}

/// Save a config file, preserving the original format as much as possible.
/// This re-reads the original file, finds matching keys, and updates their values.
pub fn save_config_file(path: &Path, config: &ConfigFile) -> AppResult<()> {
    info!("Saving config: {}", path.display());

    let original = std::fs::read_to_string(path)?;

    // Build a lookup of section -> key -> value from the new config
    let mut updates: std::collections::HashMap<String, std::collections::HashMap<String, String>> =
        std::collections::HashMap::new();
    for section in &config.sections {
        let section_map = updates.entry(section.name.clone()).or_default();
        for entry in &section.entries {
            section_map.insert(entry.key.clone(), entry.value.clone());
        }
    }

    // Rewrite the file, replacing values where they've changed
    let mut output = String::new();
    let mut current_section = String::new();

    for line in original.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            current_section = trimmed[1..trimmed.len() - 1].to_string();
            output.push_str(line);
            output.push('\n');
            continue;
        }

        // Check if this is a key = value line that we need to update
        if !trimmed.starts_with('#') && !trimmed.is_empty() {
            if let Some(eq_pos) = trimmed.find('=') {
                let key = trimmed[..eq_pos].trim();

                if let Some(section_updates) = updates.get(&current_section) {
                    if let Some(new_value) = section_updates.get(key) {
                        // Preserve the original formatting (indentation, spaces around =)
                        let prefix_end = line.find(key).unwrap_or(0);
                        let _prefix = &line[..prefix_end];

                        // Find the = sign position in the original line
                        let orig_eq = line.find('=').unwrap_or(0);
                        let before_eq = &line[..orig_eq];

                        output.push_str(before_eq);
                        output.push_str("= ");
                        output.push_str(new_value);
                        output.push('\n');
                        continue;
                    }
                }
            }
        }

        output.push_str(line);
        output.push('\n');
    }

    std::fs::write(path, output)?;
    debug!("Config saved: {}", path.display());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_CONFIG: &str = r#"## Enables the feature.
# Setting type: Boolean
# Default value: true
[General]
Enabled = true

## Controls the effect strength.
# Setting type: Single
# Default value: 1
# Acceptable value range: From 0.25 to 4
Strength = 1

## Selects a mode.
# Setting type: Mode
# Default value: Normal
# Acceptable values: Off, Normal, Strong
Mode = Normal
"#;

    #[test]
    fn parses_bepinex_metadata() {
        let sections = parse_cfg_content(SAMPLE_CONFIG);

        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].name, "General");
        assert_eq!(sections[0].entries.len(), 3);

        let enabled = &sections[0].entries[0];
        assert_eq!(enabled.key, "Enabled");
        assert_eq!(enabled.setting_type.as_deref(), Some("Boolean"));
        assert_eq!(enabled.description.as_deref(), Some("Enables the feature."));

        let strength = &sections[0].entries[1];
        assert_eq!(
            strength.acceptable_value_range.as_deref(),
            Some("From 0.25 to 4")
        );

        let mode = &sections[0].entries[2];
        assert_eq!(
            mode.acceptable_values.as_deref(),
            Some("Off, Normal, Strong")
        );
    }

    #[test]
    fn saves_changed_values_without_rewriting_metadata() {
        let temp_dir = tempfile::tempdir().expect("create temp directory");
        let path = temp_dir.path().join("sample.cfg");
        std::fs::write(&path, SAMPLE_CONFIG).expect("write sample config");

        let mut config = parse_config_file(&path).expect("parse sample config");
        config.sections[0].entries[0].value = "false".to_string();
        config.sections[0].entries[2].value = "Strong".to_string();

        save_config_file(&path, &config).expect("save sample config");
        let saved = std::fs::read_to_string(&path).expect("read saved config");

        assert!(saved.contains("# Setting type: Boolean"));
        assert!(saved.contains("Enabled = false"));
        assert!(saved.contains("Mode = Strong"));
    }
}
