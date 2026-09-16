import type { SortDirection, SortOption, ThunderstorePackage } from "./types";

export interface PackageFilter {
  searchQuery?: string;
  selectedCategories?: string[];
}

export function filterPackages(
  packages: ThunderstorePackage[],
  { searchQuery = "", selectedCategories = [] }: PackageFilter,
): ThunderstorePackage[] {
  let filtered = packages.filter((pkg) => !pkg.is_deprecated);

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
