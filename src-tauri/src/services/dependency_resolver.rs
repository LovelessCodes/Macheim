use std::collections::{HashMap, HashSet, VecDeque};

use tracing::{debug, info, warn};

use crate::error::{AppError, AppResult};
use crate::models::thunderstore::{ParsedDependency, ThunderstorePackage};

/// A resolved dependency with all info needed for installation.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ResolvedDependency {
    pub full_name: String,
    pub author: String,
    pub name: String,
    pub version: String,
    pub download_url: String,
    pub description: String,
    pub icon: String,
}

/// Resolve a list of Thunderstore dependency strings (from a package version
/// or a local zip's manifest) into topological install order. Skips packages
/// that are already installed.
pub fn resolve_dependencies(
    dependencies: &[String],
    packages: &[ThunderstorePackage],
    installed: &HashSet<String>,
) -> AppResult<Vec<ResolvedDependency>> {
    info!("Resolving {} direct dependencies", dependencies.len());

    let package_map: HashMap<&str, &ThunderstorePackage> =
        packages.iter().map(|p| (p.full_name.as_str(), p)).collect();

    // Build the dependency graph using BFS
    let mut graph: HashMap<String, Vec<String>> = HashMap::new();
    let mut in_degree: HashMap<String, usize> = HashMap::new();
    let mut all_deps: HashMap<String, ResolvedDependency> = HashMap::new();
    let mut queue: VecDeque<String> = VecDeque::new();
    let mut visited: HashSet<String> = HashSet::new();

    // Seed the queue with the declared dependencies
    for dep_str in dependencies {
        if let Some(parsed) = ParsedDependency::parse(dep_str) {
            if !installed.contains(&parsed.full_name) {
                queue.push_back(dep_str.clone());
            }
        } else {
            warn!("Failed to parse dependency string: {}", dep_str);
        }
    }

    // BFS to collect all transitive dependencies
    while let Some(dep_str) = queue.pop_front() {
        let parsed = match ParsedDependency::parse(&dep_str) {
            Some(p) => p,
            None => {
                warn!("Failed to parse dependency string: {}", dep_str);
                continue;
            }
        };

        if visited.contains(&parsed.full_name) || installed.contains(&parsed.full_name) {
            continue;
        }
        visited.insert(parsed.full_name.clone());

        // Find the package in the Thunderstore cache
        let pkg = match package_map.get(parsed.full_name.as_str()) {
            Some(p) => p,
            None => {
                warn!(
                    "Dependency '{}' not found in Thunderstore cache, skipping",
                    parsed.full_name
                );
                continue;
            }
        };

        // Find the best matching version
        let version = pkg
            .versions
            .iter()
            .find(|v| v.version_number == parsed.version)
            .or_else(|| pkg.versions.first());

        let ver = match version {
            Some(v) => v,
            None => {
                warn!("No versions for dependency '{}'", parsed.full_name);
                continue;
            }
        };

        // Add to resolved dependencies
        all_deps.insert(
            parsed.full_name.clone(),
            ResolvedDependency {
                full_name: parsed.full_name.clone(),
                author: parsed.author.clone(),
                name: parsed.name.clone(),
                version: ver.version_number.clone(),
                download_url: ver.download_url.clone(),
                description: ver.description.clone(),
                icon: ver.icon.clone(),
            },
        );

        // Initialize graph node
        graph.entry(parsed.full_name.clone()).or_default();
        in_degree.entry(parsed.full_name.clone()).or_insert(0);

        // Process this dependency's dependencies
        for sub_dep_str in &ver.dependencies {
            if let Some(sub_parsed) = ParsedDependency::parse(sub_dep_str) {
                if !installed.contains(&sub_parsed.full_name)
                    && !visited.contains(&sub_parsed.full_name)
                {
                    queue.push_back(sub_dep_str.clone());
                    graph
                        .entry(parsed.full_name.clone())
                        .or_default()
                        .push(sub_parsed.full_name.clone());
                }
            }
        }
    }

    // Calculate in-degrees
    for deps in graph.values() {
        for dep in deps {
            *in_degree.entry(dep.clone()).or_insert(0) += 1;
        }
    }

    // Kahn's algorithm for topological sort
    let mut sorted = Vec::new();
    let mut zero_in: VecDeque<String> = in_degree
        .iter()
        .filter(|(_, &deg)| deg == 0)
        .map(|(name, _)| name.clone())
        .collect();

    let mut processed = 0;
    while let Some(node) = zero_in.pop_front() {
        processed += 1;

        if let Some(resolved) = all_deps.get(&node) {
            sorted.push(resolved.clone());
        }

        if let Some(neighbors) = graph.get(&node) {
            for neighbor in neighbors {
                if let Some(deg) = in_degree.get_mut(neighbor) {
                    *deg -= 1;
                    if *deg == 0 {
                        zero_in.push_back(neighbor.clone());
                    }
                }
            }
        }
    }

    // Check for cycles
    let total_nodes = in_degree.len();
    if processed < total_nodes {
        return Err(AppError::DependencyResolution(
            "Circular dependency detected in mod dependencies".to_string(),
        ));
    }

    info!("Resolved {} dependencies", sorted.len());
    for dep in &sorted {
        debug!("  {} v{}", dep.full_name, dep.version);
    }

    Ok(sorted)
}
