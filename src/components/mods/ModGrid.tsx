import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Package } from "lucide-react";
import ModCard from "./ModCard";
import ModSearch from "./ModSearch";
import { GridSkeleton } from "../common/LoadingSkeleton";
import { useModStore } from "../../store/modStore";
import { fetchPackages } from "../../lib/tauri";
import { toast } from "../ui/toast";
import { ScrollArea } from "../ui/scroll-area";

const ROW_GAP = 16;
const ESTIMATED_ROW_HEIGHT = 168;

function getColumnCount(width: number) {
  if (width >= 1280) return 4;
  if (width >= 768) return 3;
  return 2;
}

export default function ModGrid() {
  const packages = useModStore((s) => s.packages);
  const isLoading = useModStore((s) => s.isLoadingPackages);
  const setPackages = useModStore((s) => s.setPackages);
  const setLoading = useModStore((s) => s.setLoadingPackages);
  const getFilteredPackages = useModStore((s) => s.getFilteredPackages);
  const searchQuery = useModStore((s) => s.searchQuery);
  const sortBy = useModStore((s) => s.sortBy);
  const sortDirection = useModStore((s) => s.sortDirection);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);

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

  const filtered = useMemo(
    () => getFilteredPackages(),
    [getFilteredPackages, packages, searchQuery, sortBy, sortDirection]
  );

  // Derive the responsive column count from the scroll viewport width
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setColumns(getColumnCount(el.clientWidth));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rowCount = Math.ceil(filtered.length / columns);
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 4,
    gap: ROW_GAP,
  });

  const isEmpty = !isLoading && filtered.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModSearch />

      <ScrollArea
        scrollFade
        viewportRef={viewportRef}
        className="min-h-0 flex-1"
      >
        {isLoading && packages.length === 0 ? (
          <GridSkeleton count={9} />
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Package size={48} className="mb-4 text-muted-foreground" />
            <h3 className="mb-1 text-lg font-semibold text-foreground">
              No mods found
            </h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search or refresh the package list.
            </p>
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: rowVirtualizer.getTotalSize() + ROW_GAP }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const start = virtualRow.index * columns;
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute inset-x-0 top-0 grid gap-4"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  }}
                >
                  {filtered
                    .slice(start, start + columns)
                    .map((pkg) => (
                      <ModCard key={pkg.full_name} pkg={pkg} />
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
