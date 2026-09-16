import { Package } from "lucide-react";
import { useEffect } from "react";

import { fetchPackages } from "../../lib/tauri";
import { useModStore } from "../../store/modStore";
import { GridSkeleton } from "../common/LoadingSkeleton";
import VirtualGrid from "../common/VirtualGrid";
import { ScrollArea } from "../ui/scroll-area";
import { toast } from "../ui/toast";
import ModCard from "./ModCard";
import ModToolbar from "./ModToolbar";

export default function ModGrid() {
  const packages = useModStore((s) => s.packages);
  const isLoading = useModStore((s) => s.isLoadingPackages);
  const setPackages = useModStore((s) => s.setPackages);
  const setLoading = useModStore((s) => s.setLoadingPackages);
  const getFilteredPackages = useModStore((s) => s.getFilteredPackages);
  const searchQuery = useModStore((s) => s.searchQuery);
  const setSearchQuery = useModStore((s) => s.setSearchQuery);
  const sortBy = useModStore((s) => s.sortBy);
  const setSortBy = useModStore((s) => s.setSortBy);
  const sortDirection = useModStore((s) => s.sortDirection);
  const setSortDirection = useModStore((s) => s.setSortDirection);

  useEffect(() => {
    if (packages.length > 0) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const pkgs = await fetchPackages();
        if (!cancelled) setPackages(pkgs);
      } catch (err) {
        if (!cancelled) {
          toast.add({
            type: "error",
            title: `Failed to fetch packages: ${err}`,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [packages.length, setPackages, setLoading]);

  const filtered = getFilteredPackages();

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
      >
        {filtered.length.toLocaleString()} mods
      </ModToolbar>

      {isLoading && packages.length === 0 ? (
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
