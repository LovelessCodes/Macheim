import type { InstalledMod, ThunderstorePackage } from "./types";

export interface ModUpdate {
  fullName: string;
  name: string;
  version: string;
}

/**
 * Outdated store-managed mods for Update All. Manual mods never auto-update,
 * and pinned mods are held at their installed version.
 */
export function updatableMods(mods: InstalledMod[], packages: ThunderstorePackage[]): ModUpdate[] {
  const byFullName = new Map(packages.map((pkg) => [pkg.full_name, pkg]));
  return mods.flatMap((mod) => {
    if (mod.manual || mod.pinned) return [];
    const pkg = byFullName.get(mod.full_name);
    return pkg && pkg.version_number !== mod.version
      ? [{ fullName: mod.full_name, name: mod.name, version: pkg.version_number }]
      : [];
  });
}
