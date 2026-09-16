import { Layers, Star } from "lucide-react";
import { useMemo, useState } from "react";

import { usePackages } from "../../hooks/use-packages";
import { formatDate } from "../../lib/format";
import { sortPackages } from "../../lib/packages";
import type { SortDirection, SortOption, ThunderstorePackage } from "../../lib/types";
import { GridSkeleton } from "../common/LoadingSkeleton";
import VirtualGrid from "../common/VirtualGrid";
import { ScrollArea } from "../ui/scroll-area";
import ModCard from "./ModCard";
import ModToolbar from "./ModToolbar";

function isModpack(pkg: ThunderstorePackage): boolean {
  if (pkg.is_deprecated) return false;
  const cats = (pkg.categories ?? []).map((c) => c.toLowerCase());
  const nameL = pkg.name.toLowerCase();
  const descL = (pkg.description ?? "").toLowerCase();
  return (
    cats.includes("modpacks") ||
    nameL.includes("modpack") ||
    nameL.includes("mod pack") ||
    descL.includes("modpack")
  );
}

export default function ModpackBrowser() {
  const { data: packages = [], isLoading } = usePackages();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("downloads");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const modpacks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matching = packages.filter((pkg) => {
      if (!isModpack(pkg)) return false;
      if (!q) return true;
      return (
        pkg.name.toLowerCase().includes(q) ||
        pkg.owner.toLowerCase().includes(q) ||
        (pkg.description ?? "").toLowerCase().includes(q)
      );
    });
    return sortPackages(matching, sortBy, sortDirection);
  }, [packages, search, sortBy, sortDirection]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search modpacks..."
        sortBy={sortBy}
        onSortByChange={setSortBy}
        sortDirection={sortDirection}
        onSortDirectionChange={setSortDirection}
      >
        {modpacks.length.toLocaleString()} modpacks
      </ModToolbar>

      {isLoading ? (
        <ScrollArea scrollFade className="min-h-0 flex-1">
          <GridSkeleton count={20} />
        </ScrollArea>
      ) : (
        <VirtualGrid
          items={modpacks}
          keyOf={(pkg) => pkg.full_name}
          renderItem={(pkg) => (
            <ModCard
              pkg={pkg}
              kind="modpack"
              showVersion={false}
              extraMeta={
                <>
                  <span className="flex items-center gap-1">
                    <Star className="size-3" />
                    {pkg.rating_score}
                  </span>
                  <span>{formatDate(pkg.date_updated)}</span>
                </>
              }
            />
          )}
          empty={
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Layers size={48} className="text-muted-foreground mb-4" />
              <h3 className="text-foreground mb-1 text-lg font-semibold">
                {search ? "No matching modpacks" : "No modpacks found"}
              </h3>
              <p className="text-muted-foreground text-sm">
                {search
                  ? "Try a different search term."
                  : "Modpacks will appear here when available on Thunderstore."}
              </p>
            </div>
          }
        />
      )}
    </div>
  );
}
