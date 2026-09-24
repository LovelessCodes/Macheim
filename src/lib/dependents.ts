import type { InstalledMod } from "./types";

export interface DependentRef {
  fullName: string;
  enabled: boolean;
}

export interface DependentGroup {
  /** The mod being removed. */
  fullName: string;
  /** Installed mods that require it, excluding the removal set itself. */
  dependents: DependentRef[];
}

/**
 * The package full name a versioned dependency string points at:
 * `Author-Mod-1.2.3` → `Author-Mod`. Names may contain dashes, so the version
 * is the last dotted segment, mirroring the backend's parser.
 */
export function dependencyFullName(dependency: string): string | null {
  const parts = dependency.split("-");
  if (parts.length < 3) return null;

  let versionIndex = -1;
  for (let index = parts.length - 1; index >= 1; index--) {
    if (parts[index].includes(".")) {
      versionIndex = index;
      break;
    }
  }

  if (versionIndex < 2) {
    // No dotted version: accept the plain Author-Mod-version shape only.
    return parts.length === 3 ? `${parts[0]}-${parts[1]}` : null;
  }
  return `${parts[0]}-${parts.slice(1, versionIndex).join("-")}`;
}

/**
 * Installed mods that depend on any of the target mods, grouped per target.
 * Mods inside the target set are never listed as each other's dependents.
 */
export function findDependents(mods: InstalledMod[], targets: string[]): DependentGroup[] {
  const targetSet = new Set(targets);
  return targets
    .map((fullName) => ({
      fullName,
      dependents: mods
        .filter((mod) => !targetSet.has(mod.full_name))
        .filter((mod) =>
          mod.dependencies.some((dependency) => dependencyFullName(dependency) === fullName),
        )
        .map((mod) => ({ fullName: mod.full_name, enabled: mod.enabled })),
    }))
    .filter((group) => group.dependents.length > 0);
}

/** Names for a confirmation dialog, capped, with disabled dependents labelled. */
export function formatDependentNames(dependents: DependentRef[], cap = 5): string {
  const shown = dependents
    .slice(0, cap)
    .map((dependent) =>
      dependent.enabled ? dependent.fullName : `${dependent.fullName} (disabled)`,
    );
  const hidden = dependents.length - shown.length;
  const list = shown.join(", ");
  return hidden > 0 ? `${list}, and ${hidden} more` : list;
}

/** Warning line for a single uninstall, or null when nothing depends on it. */
export function singleUninstallWarning(mods: InstalledMod[], target: string): string | null {
  const group = findDependents(mods, [target])[0];
  if (!group) return null;
  const verb = group.dependents.length === 1 ? "depends" : "depend";
  return `${formatDependentNames(group.dependents)} ${verb} on it.`;
}

/** Warning block for a bulk uninstall, or null when nothing outside it cares. */
export function bulkUninstallWarning(mods: InstalledMod[], targets: string[]): string | null {
  const groups = findDependents(mods, targets);
  if (groups.length === 0) return null;
  const lines = groups.map(
    (group) => `- ${group.fullName}: required by ${formatDependentNames(group.dependents)}`,
  );
  return `Required by mods outside the selection:\n${lines.join("\n")}`;
}

function dependsOn(mod: InstalledMod, fullName: string): boolean {
  return mod.dependencies.some((dependency) => dependencyFullName(dependency) === fullName);
}

/**
 * Dependency-installed mods that nothing needs any more, as a transitive
 * closure: when B depends on C and B itself is unused, both qualify. Dependents
 * count whether they are enabled or disabled. Pinned, manually installed and
 * explicitly installed mods are never swept, and they block their own
 * dependencies from being swept too.
 */
export function orphanedDependencies(mods: InstalledMod[]): InstalledMod[] {
  const candidates = new Set(
    mods
      .filter((mod) => mod.installed_as === "dependency" && !mod.pinned && !mod.manual)
      .map((mod) => mod.full_name),
  );

  const removable = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const mod of mods) {
      if (!candidates.has(mod.full_name) || removable.has(mod.full_name)) continue;
      const dependents = mods.filter(
        (other) => other.full_name !== mod.full_name && dependsOn(other, mod.full_name),
      );
      if (dependents.every((dependent) => removable.has(dependent.full_name))) {
        removable.add(mod.full_name);
        changed = true;
      }
    }
  }

  return mods.filter((mod) => removable.has(mod.full_name));
}

/** Names for the removal confirmation, capped. */
export function formatRemovalNames(mods: InstalledMod[], cap = 5): string {
  const shown = mods.slice(0, cap).map((mod) => mod.full_name);
  const hidden = mods.length - shown.length;
  const list = shown.join(", ");
  return hidden > 0 ? `${list}, and ${hidden} more` : list;
}
