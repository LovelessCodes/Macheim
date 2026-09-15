import { useEffect, useState } from "react";
import { Package, ChevronDown } from "lucide-react";
import ModCard from "./ModCard";
import ModSearch from "./ModSearch";
import { GridSkeleton } from "../common/LoadingSkeleton";
import { useModStore } from "../../store/modStore";
import { useAppStore } from "../../store/appStore";
import { fetchPackages } from "../../lib/tauri";

const PAGE_SIZE = 48;

export default function ModGrid() {
  const packages = useModStore((s) => s.packages);
  const isLoading = useModStore((s) => s.isLoadingPackages);
  const setPackages = useModStore((s) => s.setPackages);
  const setLoading = useModStore((s) => s.setLoadingPackages);
  const getFilteredPackages = useModStore((s) => s.getFilteredPackages);
  const addToast = useAppStore((s) => s.addToast);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

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

  // Reset display count when search changes
  const searchQuery = useModStore((s) => s.searchQuery);
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [searchQuery]);

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
          <Package
            size={48}
            className="text-[var(--color-text-muted)] mb-4"
          />
          <h3 className="text-lg font-semibold text-[var(--color-text-secondary)] mb-1">
            No mods found
          </h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            Try adjusting your search or refresh the package list.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {displayed.map((pkg) => (
              <ModCard key={pkg.full_name} pkg={pkg} />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center mt-6 mb-4">
              <button
                onClick={() => setDisplayCount((c) => c + PAGE_SIZE)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium
                  bg-[var(--color-bg-card)] border border-[var(--color-border-default)]
                  text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]
                  hover:border-[var(--color-border-hover)] transition-colors cursor-pointer"
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
