use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::path::Path;

use serde::Serialize;

use crate::models::{InstalledMod, ParsedDependency, ThunderstorePackage};
use crate::services::{compatibility, profile_manager};

/// BepInEx is pinned at different versions by many mods; the loader is
/// managed by Macheim itself, so those mismatches are not conflicts.
const BEPINEX_PACKAGE: &str = "denikson-BepInExPack_Valheim";

const PLUGIN_EXTENSIONS: [&str; 3] = ["dll", "dylib", "so"];

/// Potential problems in the active profile / plugins folder. None of these
/// block a launch; they explain odd in-game behaviour.
#[derive(Debug, Clone, Serialize)]
pub struct ConflictReport {
    /// The same plugin file shipped by more than one mod.
    pub duplicate_dlls: Vec<DuplicateDll>,
    /// One dependency required at different versions by different mods.
    pub dependency_conflicts: Vec<DependencyConflict>,
    /// A dependency installed at a version other than the one required.
    pub version_mismatches: Vec<VersionMismatch>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DuplicateDll {
    pub file_name: String,
    pub mods: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DependencyConflict {
    pub dependency: String,
    pub requirements: Vec<DependencyRequirement>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DependencyRequirement {
    pub required_by: Vec<String>,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VersionMismatch {
    pub dependency: String,
    pub required_by: Vec<String>,
    pub required_version: String,
    pub installed_version: String,
    /// The dependency is pinned at the installed version, so the mismatch is
    /// deliberate rather than an install that went wrong.
    pub pinned: bool,
}

pub fn detect_conflicts(
    game_root: &Path,
    mods: &[InstalledMod],
    packages: &[ThunderstorePackage],
) -> ConflictReport {
    let bepinex = game_root.join("BepInEx");
    let managed_dlls = profile_manager::managed_dll_names(mods, &bepinex);

    let (dependency_conflicts, version_mismatches) = detect_dependency_issues(mods, packages);
    ConflictReport {
        duplicate_dlls: detect_duplicate_plugins(&bepinex.join("plugins"), &managed_dlls),
        dependency_conflicts,
        version_mismatches,
    }
}

/// Group plugin files by name across mod folders. Files repeated inside a
/// single mod are not cross-mod conflicts and are ignored, and neither are
/// loose leftovers of a plugin an installed mod already ships — the profile
/// scan folds those into their mod instead of listing them separately.
fn detect_duplicate_plugins(
    plugins_dir: &Path,
    managed_dlls: &HashSet<String>,
) -> Vec<DuplicateDll> {
    let Ok(entries) = std::fs::read_dir(plugins_dir) else {
        return Vec::new();
    };

    // lowercase file name -> (original file name, owning mods)
    let mut owners: BTreeMap<String, (String, BTreeSet<String>)> = BTreeMap::new();

    for entry in entries.flatten() {
        let mod_name = entry.file_name().to_string_lossy().to_string();
        // Hidden folders hold recoverable clean-up backups; the compatibility
        // plugin is Macheim-managed, not a mod.
        if mod_name.starts_with('.') || mod_name == compatibility::MANAGED_DIR {
            continue;
        }

        let path = entry.path();
        if path.is_dir() {
            let mut files = Vec::new();
            collect_plugin_files(&path, &mut files);
            for file in files {
                let group = owners
                    .entry(file.to_lowercase())
                    .or_insert_with(|| (file.clone(), BTreeSet::new()));
                group.1.insert(mod_name.clone());
            }
        } else if is_plugin_file(&path) && !managed_dlls.contains(&mod_name.to_lowercase()) {
            let group = owners
                .entry(mod_name.to_lowercase())
                .or_insert_with(|| (mod_name.clone(), BTreeSet::new()));
            group.1.insert(mod_name.clone());
        }
    }

    owners
        .into_values()
        .filter(|(_, mods)| mods.len() > 1)
        .map(|(file_name, mods)| DuplicateDll {
            file_name,
            mods: mods.into_iter().collect(),
        })
        .collect()
}

fn collect_plugin_files(dir: &Path, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_plugin_files(&path, out);
        } else if is_plugin_file(&path) {
            out.push(entry.file_name().to_string_lossy().to_string());
        }
    }
}

fn is_plugin_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            PLUGIN_EXTENSIONS
                .iter()
                .any(|known| ext.eq_ignore_ascii_case(known))
        })
}

/// Compare what every installed mod declares against what is installed.
fn detect_dependency_issues(
    mods: &[InstalledMod],
    packages: &[ThunderstorePackage],
) -> (Vec<DependencyConflict>, Vec<VersionMismatch>) {
    let installed: HashMap<&str, &InstalledMod> = mods
        .iter()
        .map(|module| (module.full_name.as_str(), module))
        .collect();

    // dependency full_name -> required version -> who requires it
    let mut requirements: BTreeMap<String, BTreeMap<String, BTreeSet<String>>> = BTreeMap::new();

    for module in mods {
        // Disabled mods are not loaded, so their pins cannot clash at runtime.
        if !module.enabled {
            continue;
        }
        let Some(version) = packages
            .iter()
            .find(|pkg| pkg.full_name == module.full_name)
            .and_then(|pkg| {
                pkg.versions
                    .iter()
                    .find(|v| v.version_number == module.version)
            })
        else {
            continue;
        };

        for dep in &version.dependencies {
            let Some(parsed) = ParsedDependency::parse(dep) else {
                continue;
            };
            if parsed.full_name == BEPINEX_PACKAGE {
                continue;
            }
            requirements
                .entry(parsed.full_name)
                .or_default()
                .entry(parsed.version)
                .or_default()
                .insert(module.full_name.clone());
        }
    }

    let mut conflicts = Vec::new();
    let mut mismatches = Vec::new();

    for (dependency, versions) in requirements {
        if versions.len() > 1 {
            conflicts.push(DependencyConflict {
                dependency,
                requirements: versions
                    .into_iter()
                    .map(|(version, required_by)| DependencyRequirement {
                        version,
                        required_by: required_by.into_iter().collect(),
                    })
                    .collect(),
            });
            // A conflict already explains any version mismatch.
            continue;
        }

        let Some((required_version, required_by)) = versions.into_iter().next() else {
            continue;
        };
        let Some(installed_dep) = installed.get(dependency.as_str()) else {
            continue;
        };
        if installed_dep.version != required_version {
            mismatches.push(VersionMismatch {
                dependency,
                required_by: required_by.into_iter().collect(),
                required_version,
                installed_version: installed_dep.version.clone(),
                pinned: installed_dep.pinned,
            });
        }
    }

    (conflicts, mismatches)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{InstalledAs, InstalledMod, PackageVersion, ThunderstorePackage};

    fn installed(full_name: &str, version: &str) -> InstalledMod {
        let (author, name) = full_name.split_once('-').unwrap_or((full_name, full_name));
        InstalledMod {
            full_name: full_name.to_string(),
            author: author.to_string(),
            name: name.to_string(),
            version: version.to_string(),
            description: String::new(),
            enabled: true,
            dependencies: Vec::new(),
            installed_at: String::new(),
            icon: String::new(),
            manual: false,
            pinned: false,
            installed_as: InstalledAs::Explicit,
        }
    }

    fn package(full_name: &str, version: &str, dependencies: &[&str]) -> ThunderstorePackage {
        let (owner, name) = full_name.split_once('-').unwrap();
        ThunderstorePackage {
            name: name.to_string(),
            full_name: full_name.to_string(),
            owner: owner.to_string(),
            package_url: String::new(),
            date_updated: String::new(),
            is_deprecated: false,
            rating_score: 0,
            versions: vec![PackageVersion {
                name: name.to_string(),
                full_name: format!("{}-{}", full_name, version),
                version_number: version.to_string(),
                dependencies: dependencies.iter().map(|dep| dep.to_string()).collect(),
                download_url: String::new(),
                downloads: 0,
                description: String::new(),
                icon: String::new(),
                date_created: String::new(),
                file_size: 0,
                is_active: true,
                uuid4: None,
                sources: Vec::new(),
            }],
            categories: Vec::new(),
            is_pinned: false,
            source: crate::models::PackageSource::Thunderstore,
            alternates: Vec::new(),
        }
    }

    fn write_plugin(dir: &Path, relative: &str) {
        let path = dir.join(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, b"plugin").unwrap();
    }

    #[test]
    fn duplicate_plugins_across_mods_are_reported() {
        let game = tempfile::tempdir().unwrap();
        let plugins = game.path().join("BepInEx/plugins");
        write_plugin(&plugins, "ModA/Jotunn.dll");
        write_plugin(&plugins, "ModB/lib/Jotunn.dll");
        write_plugin(&plugins, "ModC/Other.dll");
        // Same file twice inside one mod is not a cross-mod conflict.
        write_plugin(&plugins, "ModA/nested/Jotunn.dll");

        let report = detect_conflicts(game.path(), &[], &[]);

        assert_eq!(report.duplicate_dlls.len(), 1);
        assert_eq!(report.duplicate_dlls[0].file_name, "Jotunn.dll");
        assert_eq!(report.duplicate_dlls[0].mods, vec!["ModA", "ModB"]);
    }

    #[test]
    fn loose_files_and_managed_folders_are_handled() {
        let game = tempfile::tempdir().unwrap();
        let plugins = game.path().join("BepInEx/plugins");
        write_plugin(&plugins, "Loose.dll");
        write_plugin(&plugins, "ModA/Loose.dll");
        write_plugin(
            &plugins,
            &format!("{}/Patched.dll", compatibility::MANAGED_DIR),
        );
        write_plugin(&plugins, ".macheim-clean-backups/ModB/Patched.dll");

        let report = detect_conflicts(game.path(), &[], &[]);

        assert_eq!(report.duplicate_dlls.len(), 1);
        assert_eq!(report.duplicate_dlls[0].mods, vec!["Loose.dll", "ModA"]);
    }

    #[test]
    fn loose_plugin_covered_by_installed_mod_is_not_reported() {
        let game = tempfile::tempdir().unwrap();
        let plugins = game.path().join("BepInEx/plugins");
        // Leftover from a manual install that a store package replaced.
        write_plugin(&plugins, "Loose.dll");
        write_plugin(&plugins, "Author-Mod/Loose.dll");

        let mods = vec![installed("Author-Mod", "1.0.0")];
        let report = detect_conflicts(game.path(), &mods, &[]);

        assert!(report.duplicate_dlls.is_empty());
    }

    #[test]
    fn duplicate_across_installed_mods_is_still_reported() {
        let game = tempfile::tempdir().unwrap();
        let plugins = game.path().join("BepInEx/plugins");
        write_plugin(&plugins, "ModA/Jotunn.dll");
        write_plugin(&plugins, "ModB/Jotunn.dll");

        let mods = vec![installed("ModA", "1.0.0"), installed("ModB", "1.0.0")];
        let report = detect_conflicts(game.path(), &mods, &[]);

        assert_eq!(report.duplicate_dlls.len(), 1);
        assert_eq!(report.duplicate_dlls[0].mods, vec!["ModA", "ModB"]);
    }

    #[test]
    fn conflicting_dependency_versions_are_reported() {
        let mods = vec![
            installed("Owner-ModA", "1.0.0"),
            installed("Owner-ModB", "1.0.0"),
        ];
        let packages = vec![
            package("Owner-ModA", "1.0.0", &["Dev-Jotunn-2.4.0"]),
            package("Owner-ModB", "1.0.0", &["Dev-Jotunn-2.3.9"]),
        ];

        let report = detect_conflicts(tempfile::tempdir().unwrap().path(), &mods, &packages);

        assert_eq!(report.dependency_conflicts.len(), 1);
        let conflict = &report.dependency_conflicts[0];
        assert_eq!(conflict.dependency, "Dev-Jotunn");
        assert_eq!(conflict.requirements.len(), 2);
        assert!(report.version_mismatches.is_empty());
    }

    #[test]
    fn installed_dependency_version_mismatch_is_reported() {
        let mods = vec![
            installed("Owner-ModA", "1.0.0"),
            installed("Dev-Jotunn", "2.3.9"),
        ];
        let packages = vec![
            package("Owner-ModA", "1.0.0", &["Dev-Jotunn-2.4.0"]),
            package("Dev-Jotunn", "2.3.9", &[]),
        ];

        let report = detect_conflicts(tempfile::tempdir().unwrap().path(), &mods, &packages);

        assert!(report.dependency_conflicts.is_empty());
        assert_eq!(report.version_mismatches.len(), 1);
        let mismatch = &report.version_mismatches[0];
        assert_eq!(mismatch.dependency, "Dev-Jotunn");
        assert_eq!(mismatch.required_version, "2.4.0");
        assert_eq!(mismatch.installed_version, "2.3.9");
        assert_eq!(mismatch.required_by, vec!["Owner-ModA"]);
        assert!(!mismatch.pinned);
    }

    #[test]
    fn a_pinned_dependency_is_reported_as_the_cause_of_a_mismatch() {
        let mut pinned = installed("Dev-Jotunn", "2.3.9");
        pinned.pinned = true;
        let mods = vec![installed("Owner-ModA", "1.0.0"), pinned];
        let packages = vec![
            package("Owner-ModA", "1.0.0", &["Dev-Jotunn-2.4.0"]),
            package("Dev-Jotunn", "2.3.9", &[]),
        ];

        let report = detect_conflicts(tempfile::tempdir().unwrap().path(), &mods, &packages);

        assert_eq!(report.version_mismatches.len(), 1);
        assert!(report.version_mismatches[0].pinned);
    }

    #[test]
    fn disabled_mods_do_not_contribute_requirements() {
        let mut disabled = installed("Owner-ModB", "1.0.0");
        disabled.enabled = false;
        let mods = vec![installed("Owner-ModA", "1.0.0"), disabled];
        let packages = vec![
            package("Owner-ModA", "1.0.0", &["Dev-Jotunn-2.4.0"]),
            package("Owner-ModB", "1.0.0", &["Dev-Jotunn-2.3.9"]),
        ];

        let report = detect_conflicts(tempfile::tempdir().unwrap().path(), &mods, &packages);

        assert!(report.dependency_conflicts.is_empty());
        assert!(report.version_mismatches.is_empty());
    }

    #[test]
    fn satisfied_dependencies_and_bepinex_pins_are_ignored() {
        let mods = vec![
            installed("Owner-ModA", "1.0.0"),
            installed("Owner-ModB", "1.0.0"),
            installed("Dev-Jotunn", "2.4.0"),
        ];
        let packages = vec![
            package(
                "Owner-ModA",
                "1.0.0",
                &["Dev-Jotunn-2.4.0", "denikson-BepInExPack_Valheim-5.4.2100"],
            ),
            package(
                "Owner-ModB",
                "1.0.0",
                &["denikson-BepInExPack_Valheim-5.4.2350"],
            ),
            package("Dev-Jotunn", "2.4.0", &[]),
        ];

        let report = detect_conflicts(tempfile::tempdir().unwrap().path(), &mods, &packages);

        assert!(report.dependency_conflicts.is_empty());
        assert!(report.version_mismatches.is_empty());
    }
}
