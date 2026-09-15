import { Download, Star, Clock, Package, ExternalLink, AlertTriangle, Loader2, Layers } from "lucide-react";
import type { ThunderstorePackage, PackageDetail } from "../../lib/types";

interface ModDetailContentProps {
  pkg: ThunderstorePackage;
  detail: PackageDetail | null;
  loadingDetail: boolean;
  detailError: string | null;
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

function DetailTop({ pkg }: { pkg: ThunderstorePackage }) {
  return (
    <div className="flex items-start gap-4">
      {pkg.icon ? (
        <img
          src={pkg.icon}
          alt={pkg.name}
          className="w-20 h-20 rounded-xl shrink-0 bg-[var(--color-bg-input)] object-cover shadow-md"
        />
      ) : (
        <div className="w-20 h-20 rounded-xl shrink-0 bg-[var(--color-bg-input)] flex items-center justify-center">
          <Package size={32} className="text-[var(--color-text-muted)]" />
        </div>
      )}
      <div className="min-w-0">
        <h3 className="text-xl font-bold text-[var(--color-text-primary)]">
          {pkg.name}
        </h3>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
          by {pkg.owner}
        </p>
        <div className="flex items-center gap-4 mt-2.5 text-xs text-[var(--color-text-muted)]">
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
  );
}

function VersionHistory({ versions }: { versions: PackageDetail["versions"] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
        Version History ({versions.length})
      </h4>
      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {versions.slice(0, 15).map((v, i) => (
          <div
            key={v.version_number}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm
              ${
                i === 0
                  ? "bg-[var(--color-accent-primary)]/10 border border-[var(--color-accent-primary)]/20"
                  : "bg-[var(--color-bg-input)]"
              }
            `}
          >
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-text-primary)] font-mono text-xs font-medium">
                v{v.version_number}
              </span>
              {i === 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-accent-primary)] text-white">
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
  );
}

function DependencyList({ dependencies }: { dependencies: string[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
        <span className="flex items-center gap-1.5">
          <Layers size={13} />
          Dependencies ({dependencies.length})
        </span>
      </h4>
      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
        {dependencies.map((dep) => {
          const parts = dep.split("-");
          const depName = parts.length >= 3 ? parts.slice(0, -1).join("-") : dep;
          const depVersion = parts.length >= 3 ? parts[parts.length - 1] : "";
          return (
            <span
              key={dep}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-[var(--color-bg-input)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]"
            >
              {depName}
              {depVersion && (
                <span className="text-[var(--color-text-muted)]">
                  {depVersion}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function ModDetailContent({
  pkg,
  detail,
  loadingDetail,
  detailError,
}: ModDetailContentProps) {
  const latestVersion = detail?.versions?.[0];
  const dependencies =
    latestVersion?.dependencies?.filter(
      (d) => !d.startsWith("denikson-BepInExPack")
    ) ?? [];
  const thunderstoreUrl = `https://thunderstore.io/c/valheim/p/${pkg.owner}/${pkg.name}/`;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6">
      {/* Top section - always visible from listing data */}
      <DetailTop pkg={pkg} />

      {/* Description */}
      <div>
        <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
          Description
        </h4>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">
          {pkg.description || "No description available."}
        </p>
      </div>

      {/* Categories */}
      {pkg.categories && pkg.categories.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
            Categories
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {pkg.categories.map((cat) => (
              <span
                key={cat}
                className="inline-block px-2.5 py-1 rounded-full text-xs bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] border border-[var(--color-accent-primary)]/20"
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
          <Loader2
            size={24}
            className="text-[var(--color-accent-primary)] animate-spin"
          />
          <span className="ml-2 text-sm text-[var(--color-text-muted)]">
            Loading details...
          </span>
        </div>
      )}

      {detailError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20">
          <AlertTriangle
            size={16}
            className="text-[var(--color-warning)] mt-0.5 shrink-0"
          />
          <p className="text-xs text-[var(--color-text-secondary)]">
            Could not load full details: {detailError}
          </p>
        </div>
      )}

      {/* Version History */}
      {detail && detail.versions.length > 0 && (
        <VersionHistory versions={detail.versions} />
      )}

      {/* Dependencies */}
      {dependencies.length > 0 && (
        <DependencyList dependencies={dependencies} />
      )}

      {/* Thunderstore Link */}
      <a
        href={thunderstoreUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary-hover)] transition-colors"
      >
        <ExternalLink size={14} />
        View on Thunderstore
      </a>
    </div>
  );
}
