import {
  Layers,
  Download,
  CheckCircle,
  Loader2,
  Package,
  Search,
  Flame,
  Clock,
  Star,
  ArrowDownAZ,
} from "lucide-react";
import { useEffect, useState } from "react";

import { fetchPackages, installModpack, getInstalledMods } from "../../lib/tauri";
import { useAppStore } from "../../store/appStore";
import { useModStore } from "../../store/modStore";
import { GridSkeleton } from "../common/LoadingSkeleton";

type ModpackSort = "popular" | "updated" | "rated" | "name";

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

const sortTabs: { value: ModpackSort; label: string; icon: typeof Flame }[] = [
  { value: "popular", label: "Popular", icon: Flame },
  { value: "updated", label: "Newest", icon: Clock },
  { value: "rated", label: "Top Rated", icon: Star },
  { value: "name", label: "A-Z", icon: ArrowDownAZ },
];

export default function ModpackBrowser() {
  const packages = useModStore((s) => s.packages);
  const isLoading = useModStore((s) => s.isLoadingPackages);
  const setPackages = useModStore((s) => s.setPackages);
  const setLoading = useModStore((s) => s.setLoadingPackages);
  const installedMods = useModStore((s) => s.installedMods);
  const isInstallingMod = useModStore((s) => s.isInstallingMod);
  const setInstallingMod = useModStore((s) => s.setInstallingMod);
  const setInstalledMods = useModStore((s) => s.setInstalledMods);
  const setSelectedPackage = useModStore((s) => s.setSelectedPackage);
  const addToast = useAppStore((s) => s.addToast);

  const [localSearch, setLocalSearch] = useState("");
  const [sortBy, setSortBy] = useState<ModpackSort>("popular");

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

  // Filter modpacks
  const modpacks = packages.filter((pkg) => {
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
  });

  // Search
  const searched = localSearch.trim()
    ? modpacks.filter((pkg) => {
        const q = localSearch.toLowerCase();
        return (
          pkg.name.toLowerCase().includes(q) ||
          pkg.owner.toLowerCase().includes(q) ||
          (pkg.description ?? "").toLowerCase().includes(q)
        );
      })
    : modpacks;

  // Sort
  const sorted = [...searched].sort((a, b) => {
    switch (sortBy) {
      case "popular":
        return (b.downloads ?? 0) - (a.downloads ?? 0);
      case "updated":
        return new Date(b.date_updated).getTime() - new Date(a.date_updated).getTime();
      case "rated":
        return b.rating_score - a.rating_score;
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });

  const handleInstall = async (fullName: string, version: string, name: string) => {
    setInstallingMod(fullName);
    try {
      await installModpack(fullName, version);
      const mods = await getInstalledMods();
      setInstalledMods(mods);
      addToast({ type: "success", message: `Installed modpack ${name}` });
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to install ${name}: ${err}`,
      });
    } finally {
      setInstallingMod(null);
    }
  };

  if (isLoading && packages.length === 0) {
    return <GridSkeleton count={6} />;
  }

  return (
    <div>
      {/* Search + Sort Bar */}
      <div className="mb-6 flex flex-col gap-4">
        {/* Search */}
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--color-text-muted)]"
          />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search modpacks..."
            className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-input)] py-2.5 pr-4 pl-10 text-sm text-[var(--color-text-primary)] transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)]/30 focus:outline-none"
          />
        </div>

        {/* Sort Tabs */}
        <div className="flex items-center gap-2">
          {sortTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = sortBy === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setSortBy(tab.value)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-[var(--color-accent-amber)] text-white shadow-sm shadow-orange-900/20"
                    : "border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-default)] hover:text-[var(--color-text-primary)]"
                } `}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}

          <div className="flex-1" />
          <span className="text-xs text-[var(--color-text-muted)]">{sorted.length} modpacks</span>
        </div>
      </div>

      {/* Results */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Layers size={48} className="mb-4 text-[var(--color-text-muted)]" />
          <h3 className="mb-1 text-lg font-semibold text-[var(--color-text-secondary)]">
            {localSearch ? "No matching modpacks" : "No modpacks found"}
          </h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            {localSearch
              ? "Try a different search term."
              : "Modpacks will appear here when available on Thunderstore."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sorted.map((pkg) => {
            const isInstalled = installedMods.some((m) => m.full_name === pkg.full_name);
            const isInstalling = isInstallingMod === pkg.full_name;

            return (
              <div
                key={pkg.full_name}
                onClick={() => setSelectedPackage(pkg)}
                className="cursor-pointer overflow-hidden rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] transition-all duration-150 hover:border-[var(--color-border-default)] hover:bg-[var(--color-bg-card-hover)]"
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {pkg.icon ? (
                      <img
                        src={pkg.icon}
                        alt={pkg.name}
                        className="h-16 w-16 shrink-0 rounded-xl bg-[var(--color-bg-input)] object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[var(--color-bg-input)]">
                        <Package size={28} className="text-[var(--color-text-muted)]" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold text-[var(--color-text-primary)]">
                        {pkg.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        by {pkg.owner}
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                        {pkg.description || "No description"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)]/30 px-4 py-2.5">
                  <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                    <span className="flex items-center gap-1">
                      <Download size={12} />
                      {formatDownloads(pkg.downloads)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Star size={12} />
                      {pkg.rating_score}
                    </span>
                    <span>{formatDate(pkg.date_updated)}</span>
                  </div>

                  <button
                    onClick={() => handleInstall(pkg.full_name, pkg.version_number, pkg.name)}
                    disabled={isInstalled || isInstalling}
                    className={`cursor-pointer rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
                      isInstalled
                        ? "bg-[var(--color-success)]/15 text-[var(--color-success)]"
                        : isInstalling
                          ? "bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)]"
                          : "bg-[var(--color-accent-amber)] text-white hover:bg-[var(--color-accent-amber-hover)] active:scale-95"
                    } `}
                  >
                    {isInstalled ? (
                      <span className="flex items-center gap-1">
                        <CheckCircle size={12} />
                        Installed
                      </span>
                    ) : isInstalling ? (
                      <span className="flex items-center gap-1">
                        <Loader2 size={12} className="animate-spin" />
                        Installing
                      </span>
                    ) : (
                      "Install"
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
