import { Package, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchPackages } from "../../lib/tauri";
import { useAppStore } from "../../store/appStore";
import { useModStore } from "../../store/modStore";
import { GridSkeleton } from "../common/LoadingSkeleton";
import ModCard from "./ModCard";
import ModSearch from "./ModSearch";

const PAGE_SIZE = 48;

export default function ModGrid() {
  const packages = useModStore((s) => s.packages);
  const isLoading = useModStore((s) => s.isLoadingPackages);
  const setPackages = useModStore((s) => s.setPackages);
  const setLoading = useModStore((s) => s.setLoadingPackages);
  const getFilteredPackages = useModStore((s) => s.getFilteredPackages);
  const addToast = useAppStore((s) => s.addToast);
  const searchQuery = useModStore((s) => s.searchQuery);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [prevQuery, setPrevQuery] = useState(searchQuery);

  // Reset display count during render when search changes
  if (prevQuery !== searchQuery) {
    setPrevQuery(searchQuery);
    setDisplayCount(PAGE_SIZE);
  }

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
          addToast({
            type: "error",
            message: `Failed to fetch packages: ${err}`,
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
  }, [packages.length, setPackages, setLoading, addToast]);

  const filtered = getFilteredPackages();
  const displayed = filtered.slice(0, displayCount);
  const hasMore = displayCount < filtered.length;

  if (isLoading && packages.length === 0) {
    return (
      <div>
        <ModSearch />
        <GridSkeleton count={9} />
      </div>
    );
  }

  return (
    <div>
      <ModSearch />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package size={48} className="mb-4 text-[var(--color-text-muted)]" />
          <h3 className="mb-1 text-lg font-semibold text-[var(--color-text-secondary)]">
            No mods found
          </h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            Try adjusting your search or refresh the package list.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {displayed.map((pkg) => (
              <ModCard key={pkg.full_name} pkg={pkg} />
            ))}
          </div>

          {hasMore && (
            <div className="mt-6 mb-4 flex justify-center">
              <button
                onClick={() => setDisplayCount((c) => c + PAGE_SIZE)}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] px-6 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)]"
              >
                <ChevronDown size={16} />
                Load More ({(filtered.length - displayCount).toLocaleString()} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
