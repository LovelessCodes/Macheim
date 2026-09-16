import { Package } from "lucide-react";
import { useMemo } from "react";

import { usePackages } from "../../hooks/use-packages";
import { filterPackages, sortPackages } from "../../lib/packages";
import { useModStore } from "../../store/modStore";
import { GridSkeleton } from "../common/LoadingSkeleton";
import VirtualGrid from "../common/VirtualGrid";
import { ScrollArea } from "../ui/scroll-area";
import ModCard from "./ModCard";
import ModToolbar from "./ModToolbar";

export default function ModGrid() {
  const { data: packages = [], isLoading } = usePackages();
  const searchQuery = useModStore((s) => s.searchQuery);
  const setSearchQuery = useModStore((s) => s.setSearchQuery);
  const selectedCategories = useModStore((s) => s.selectedCategories);
  const setSelectedCategories = useModStore((s) => s.setSelectedCategories);
  const sortBy = useModStore((s) => s.sortBy);
  const setSortBy = useModStore((s) => s.setSortBy);
  const sortDirection = useModStore((s) => s.sortDirection);
  const setSortDirection = useModStore((s) => s.setSortDirection);

  const filtered = useMemo(
    () =>
      sortPackages(
        filterPackages(packages, { searchQuery, selectedCategories }),
        sortBy,
        sortDirection,
      ),
    [packages, searchQuery, selectedCategories, sortBy, sortDirection],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const pkg of packages) {
      if (pkg.is_deprecated) continue;
      for (const cat of pkg.categories ?? []) set.add(cat);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [packages]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModToolbar
        search={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search mods..."
        sortBy={sortBy}
        onSortByChange={setSortBy}
        sortDirection={sortDirection}
        onSortDirectionChange={setSortDirection}
        categories={categories}
        selectedCategories={selectedCategories}
        onSelectedCategoriesChange={setSelectedCategories}
      >
        {filtered.length.toLocaleString()} mods
      </ModToolbar>

      {isLoading ? (
        <ScrollArea scrollFade className="min-h-0 flex-1">
          <GridSkeleton count={9} />
        </ScrollArea>
      ) : (
        <VirtualGrid
          items={filtered}
          keyOf={(pkg) => pkg.full_name}
          renderItem={(pkg) => <ModCard pkg={pkg} />}
          empty={
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Package size={48} className="text-muted-foreground mb-4" />
              <h3 className="text-foreground mb-1 text-lg font-semibold">No mods found</h3>
              <p className="text-muted-foreground text-sm">
                Try adjusting your search or refresh the package list.
              </p>
            </div>
          }
        />
      )}
    </div>
  );
}
