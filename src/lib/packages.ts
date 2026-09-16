import type { SortDirection, SortOption, ThunderstorePackage } from "./types";

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
