import {
  X,
  Download,
  CheckCircle,
  Loader2,
  ExternalLink,
  Package,
  Clock,
  Star,
  Layers,
  AlertTriangle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { installMod, uninstallMod, getInstalledMods, getPackageDetails } from "../../lib/tauri";
import type { ThunderstorePackage, PackageDetail } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import { useModStore } from "../../store/modStore";

interface ModDetailProps {
  pkg: ThunderstorePackage;
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function ModDetail({ pkg, onClose }: ModDetailProps) {
  const installedMods = useModStore((s) => s.installedMods);
  const isInstallingMod = useModStore((s) => s.isInstallingMod);
  const setInstallingMod = useModStore((s) => s.setInstallingMod);
  const setInstalledMods = useModStore((s) => s.setInstalledMods);
  const addToast = useAppStore((s) => s.addToast);

  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Fetch full details on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingDetail(true);
      setDetailError(null);
      try {
        const d = await getPackageDetails(pkg.full_name);
        if (!cancelled) setDetail(d);
      } catch (err) {
        if (!cancelled) setDetailError(String(err));
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [pkg.full_name]);

  const isInstalled = installedMods.some((m) => m.full_name === pkg.full_name);
  const isInstalling = isInstallingMod === pkg.full_name;

  const latestVersion = detail?.versions?.[0];
  const dependencies =
    latestVersion?.dependencies?.filter((d) => !d.startsWith("denikson-BepInExPack")) ?? [];

  const handleInstall = async () => {
    if (isInstalled || isInstalling) return;
    setInstallingMod(pkg.full_name);
    try {
      await installMod(pkg.full_name, pkg.version_number);
      const mods = await getInstalledMods();
      setInstalledMods(mods);
      addToast({ type: "success", message: `Installed ${pkg.name}` });
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to install ${pkg.name}: ${err}`,
      });
    } finally {
      setInstallingMod(null);
    }
  };

  const handleUninstall = async () => {
    try {
      await uninstallMod(pkg.full_name);
      const mods = await getInstalledMods();
      setInstalledMods(mods);
      addToast({ type: "info", message: `Uninstalled ${pkg.name}` });
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to uninstall ${pkg.name}: ${err}`,
      });
    }
  };

  const thunderstoreUrl = `https://thunderstore.io/c/valheim/p/${pkg.owner}/${pkg.name}/`;

  return (
    <>
      <div
        className="fixed inset-0 z-40 animate-[fadeIn_0.15s_ease-out] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl animate-[slideInRight_0.2s_ease-out] flex-col border-l border-[var(--color-border-default)] bg-[var(--color-bg-sidebar)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Mod Details</h2>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-[var(--color-bg-card)]"
          >
            <X size={18} className="text-[var(--color-text-muted)]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {/* Top section - always visible from listing data */}
          <div className="flex items-start gap-4">
            {pkg.icon ? (
              <img
                src={pkg.icon}
                alt={pkg.name}
                className="h-20 w-20 shrink-0 rounded-xl bg-[var(--color-bg-input)] object-cover shadow-md"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-[var(--color-bg-input)]">
                <Package size={32} className="text-[var(--color-text-muted)]" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-xl font-bold text-[var(--color-text-primary)]">{pkg.name}</h3>
              <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">by {pkg.owner}</p>
              <div className="mt-2.5 flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                <span className="flex items-center gap-1">
                  <Download size={13} />
                  {formatDownloads(pkg.downloads)}
                </span>
                <span className="flex items-center gap-1">
                  <Star size={13} />
                  {pkg.rating_score}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={13} />
                  {formatDate(pkg.date_updated)}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
              Description
            </h4>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--color-text-secondary)]">
              {pkg.description || "No description available."}
            </p>
          </div>

          {/* Categories */}
          {pkg.categories && pkg.categories.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
                Categories
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {pkg.categories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-block rounded-full border border-[var(--color-accent-primary)]/20 bg-[var(--color-accent-primary)]/10 px-2.5 py-1 text-xs text-[var(--color-accent-primary)]"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Loading detail */}
          {loadingDetail && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-[var(--color-accent-primary)]" />
              <span className="ml-2 text-sm text-[var(--color-text-muted)]">
                Loading details...
              </span>
            </div>
          )}

          {detailError && (
            <div className="flex items-start gap-2 rounded-lg border border-[var(--color-warning)]/20 bg-[var(--color-warning)]/10 p-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--color-warning)]" />
              <p className="text-xs text-[var(--color-text-secondary)]">
                Could not load full details: {detailError}
              </p>
            </div>
          )}

          {/* Version History */}
          {detail && detail.versions.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
                Version History ({detail.versions.length})
              </h4>
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {detail.versions.slice(0, 15).map((v, i) => (
                  <div
                    key={v.version_number}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      i === 0
                        ? "border border-[var(--color-accent-primary)]/20 bg-[var(--color-accent-primary)]/10"
                        : "bg-[var(--color-bg-input)]"
                    } `}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-[var(--color-text-primary)]">
                        v{v.version_number}
                      </span>
                      {i === 0 && (
                        <span className="rounded bg-[var(--color-accent-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          LATEST
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                      <span>{formatDownloads(v.downloads)}</span>
                      <span>{formatDate(v.date_created)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dependencies */}
          {dependencies.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
                <span className="flex items-center gap-1.5">
                  <Layers size={13} />
                  Dependencies ({dependencies.length})
                </span>
              </h4>
              <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {dependencies.map((dep) => {
                  const parts = dep.split("-");
                  const depName = parts.length >= 3 ? parts.slice(0, -1).join("-") : dep;
                  const depVersion = parts.length >= 3 ? parts[parts.length - 1] : "";
                  return (
                    <span
                      key={dep}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)]"
                    >
                      {depName}
                      {depVersion && (
                        <span className="text-[var(--color-text-muted)]">{depVersion}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Thunderstore Link */}
          <a
            href={thunderstoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent-primary)] transition-colors hover:text-[var(--color-accent-primary-hover)]"
          >
            <ExternalLink size={14} />
            View on Thunderstore
          </a>
        </div>

        {/* Action Footer */}
        <div className="flex gap-3 border-t border-[var(--color-border-subtle)] px-5 py-4">
          {isInstalled ? (
            <>
              <button
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-success)]/15 px-4 py-2.5 text-sm font-medium text-[var(--color-success)]"
                disabled
              >
                <CheckCircle size={16} />
                Installed (v
                {installedMods.find((m) => m.full_name === pkg.full_name)?.version ??
                  pkg.version_number}
                )
              </button>
              <button
                onClick={handleUninstall}
                className="cursor-pointer rounded-lg border border-[var(--color-error)]/40 px-4 py-2.5 text-sm font-medium text-[var(--color-error)] transition-colors hover:bg-[var(--color-error)]/10"
              >
                Uninstall
              </button>
            </>
          ) : (
            <button
              onClick={handleInstall}
              disabled={isInstalling}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--color-accent-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--color-accent-primary-hover)] active:scale-[0.98] disabled:opacity-60"
            >
              {isInstalling ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Installing...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Install v{pkg.version_number}
                </>
              )}
            </button>
          )}
        </div>

        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideInRight {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>
      </div>
    </>
  );
}
