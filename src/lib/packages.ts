import type {
  InstalledMod,
  PackageSourceFilter,
  SortDirection,
  SortOption,
  ThunderstorePackage,
} from "./types";

export interface PackageFilter {
  searchQuery?: string;
  selectedCategories?: string[];
  selectedSource?: PackageSourceFilter;
}

export function isModpackCategory(pkg: ThunderstorePackage): boolean {
  return (pkg.categories ?? []).some((cat) => {
    const normalized = cat.toLowerCase();
    return normalized === "modpack" || normalized === "modpacks";
  });
}

/** Lowercased alphanumerics only, so "NoRainDamage.dll" and "no_rain_damage" compare equal. */
function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Group packages by normalized name for manual-install matching. */
export function groupPackagesByName(
  packages: ThunderstorePackage[],
): Map<string, ThunderstorePackage[]> {
  const groups = new Map<string, ThunderstorePackage[]>();
  for (const pkg of packages) {
    const key = normalizeKey(pkg.name);
    const group = groups.get(key);
    if (group) group.push(pkg);
    else groups.set(key, [pkg]);
  }
  return groups;
}

/**
 * Match a filesystem-discovered mod to a store package. Manual installs only
 * record file names, so the plugin name is matched against package names and
 * the record that owns it — a manually created folder (`full_name`) or the
 * parsed author — against package owners. Same-named packages stay unmatched
 * unless one candidate remains.
 */
export function matchManualMod(
  mod: Pick<InstalledMod, "full_name" | "name" | "author" | "manual">,
  packagesByName: Map<string, ThunderstorePackage[]>,
): ThunderstorePackage | undefined {
  if (!mod.manual) return undefined;

  const candidates = packagesByName.get(normalizeKey(mod.name));
  if (!candidates || candidates.length === 0) return undefined;

  const authorKey = normalizeKey(mod.author);
  const folderKey = normalizeKey(mod.full_name);
  const byOwner = candidates.filter((pkg) => {
    const ownerKey = normalizeKey(pkg.owner);
    return ownerKey === authorKey || ownerKey === folderKey;
  });

  if (byOwner.length === 1) return byOwner[0];
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function filterPackages(
  packages: ThunderstorePackage[],
  { searchQuery = "", selectedCategories = [], selectedSource = "all" }: PackageFilter,
): ThunderstorePackage[] {
  // Browse Mods excludes modpacks (they have their own page).
  let filtered = packages.filter((pkg) => !pkg.is_deprecated && !isModpackCategory(pkg));

  if (selectedSource !== "all") {
    filtered = filtered.filter((pkg) => pkg.source === selectedSource);
  }

  if (selectedCategories.length > 0) {
    filtered = filtered.filter((pkg) =>
      (pkg.categories ?? []).some((cat) => selectedCategories.includes(cat)),
    );
  }

  const q = searchQuery.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(q) ||
        pkg.full_name.toLowerCase().includes(q) ||
        pkg.owner.toLowerCase().includes(q) ||
        (pkg.description ?? "").toLowerCase().includes(q),
    );
  }

  return filtered;
}

export function sortPackages(
  packages: ThunderstorePackage[],
  sortBy: SortOption,
  sortDirection: SortDirection,
): ThunderstorePackage[] {
  return [...packages].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "downloads":
        cmp = (b.downloads ?? 0) - (a.downloads ?? 0);
        break;
      case "rating":
        cmp = b.rating_score - a.rating_score;
        break;
      case "updated":
        cmp = new Date(b.date_updated).getTime() - new Date(a.date_updated).getTime();
        break;
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
    }
    return sortDirection === "desc" ? cmp : -cmp;
  });
}
