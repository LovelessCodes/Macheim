import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Check,
  CheckCircle,
  Loader2,
  ExternalLink,
  Clock,
  Star,
  Layers,
  AlertTriangle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useInstalledMods } from "../../hooks/use-installed-mods";
import { useModUninstall } from "../../hooks/use-mod-uninstall";
import { usePackageInstall } from "../../hooks/use-package-install";
import { downloadStatusLabel } from "../../lib/downloads";
import { formatDate, formatDownloads } from "../../lib/format";
import { packageDetailQueryKey } from "../../lib/query-keys";
import { getPackageDetails } from "../../lib/tauri";
import type { ThunderstorePackage } from "../../lib/types";
import { useDownloadStore } from "../../store/downloadStore";
import { Alert, AlertDescription } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import ModIcon from "./ModIcon";

interface ModDetailProps {
  pkg: ThunderstorePackage;
  onClose: () => void;
}

export default function ModDetail({ pkg, onClose }: ModDetailProps) {
  const { install, isInstalled, isQueued, isInstalling, queueStatus, queuedVersion } =
    usePackageInstall(pkg);
  const { uninstall } = useModUninstall();
  const openDownloads = useDownloadStore((s) => s.setPanelOpen);

  const {
    data: detail = null,
    isPending: loadingDetail,
    error: detailErrorObj,
  } = useQuery({
    queryKey: packageDetailQueryKey(pkg.full_name),
    queryFn: () => getPackageDetails(pkg.full_name),
  });
  const detailError = detailErrorObj ? String(detailErrorObj) : null;

  // Open on the next frame so the Sheet plays its enter transition, and let
  // the exit transition finish before the parent unmounts us.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const { data: installedMods = [] } = useInstalledMods();
  const installedVersion = installedMods.find((m) => m.full_name === pkg.full_name)?.version;

  const latestVersion = detail?.versions?.[0];
  const dependencies =
    latestVersion?.dependencies?.filter((d) => !d.startsWith("denikson-BepInExPack")) ?? [];

  const handleInstall = () => {
    if (isInstalled) return;
    if (isQueued) {
      openDownloads(true);
      return;
    }
    install(pkg.version_number);
  };

  const handleInstallVersion = (version: string) => {
    install(version);
  };

  const handleUninstall = () => {
    uninstall(pkg.full_name, pkg.name);
  };

  const isHexium = pkg.source === "hexium";
  const sourceLabel = isHexium ? "Hexium" : "Thunderstore";
  const packageUrl =
    pkg.package_url ||
    (isHexium
      ? `https://valheim.hexium.gg/mods/${pkg.owner}/${pkg.name}`
      : `https://thunderstore.io/c/valheim/p/${pkg.owner}/${pkg.name}/`);

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>Mod Details</SheetTitle>
          <SheetDescription className="sr-only">
            {pkg.name} by {pkg.owner}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="space-y-6 p-5">
            {/* Top section - always visible from listing data */}
            <div className="flex items-start gap-4">
              <ModIcon src={pkg.icon} alt={pkg.name} className="size-20" iconClassName="size-8" />
              <div className="min-w-0">
                <h3 className="text-foreground text-xl font-bold">{pkg.name}</h3>
                <div className="mt-0.5 flex items-center gap-2">
                  <p className="text-muted-foreground text-sm">by {pkg.owner}</p>
                  {isHexium && (
                    <Badge
                      variant="outline"
                      className="border-accent-primary/40 text-accent-primary"
                    >
                      Hexium
                    </Badge>
                  )}
                </div>
                <div className="text-muted-foreground mt-2.5 flex flex-wrap items-center gap-4 text-xs">
                  <span className="flex items-center gap-1">
                    <Download className="size-3.5" />
                    {formatDownloads(pkg.downloads)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="size-3.5" />
                    {pkg.rating_score}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {formatDate(pkg.date_updated)}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                Description
              </h4>
              <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">
                {pkg.description || "No description available."}
              </p>
            </div>

            {/* Categories */}
            {pkg.categories && pkg.categories.length > 0 && (
              <div>
                <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                  Categories
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {pkg.categories.map((cat) => (
                    <Badge
                      key={cat}
                      variant="outline"
                      className="border-accent-primary/20 bg-accent-primary/10 text-accent-primary"
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Loading detail */}
            {loadingDetail && (
              <div className="flex items-center justify-center gap-2 py-8">
                <Loader2 className="text-accent-primary size-5 animate-spin" />
                <span className="text-muted-foreground text-sm">Loading details...</span>
              </div>
            )}

            {detailError && (
              <Alert className="border-[var(--color-warning)]/20 bg-[var(--color-warning)]/10">
                <AlertTriangle className="text-[var(--color-warning)]" />
                <AlertDescription className="text-muted-foreground">
                  Could not load full details: {detailError}
                </AlertDescription>
              </Alert>
            )}

            {/* Version History */}
            {detail && detail.versions.length > 0 && (
              <div>
                <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                  Version History ({detail.versions.length})
                </h4>
                <div className="space-y-1.5">
                  {detail.versions.slice(0, 15).map((v, i) => {
                    const isCurrent = v.version_number === installedVersion;
                    const isVersionQueued = queuedVersion === v.version_number;
                    return (
                      <div
                        key={v.version_number}
                        className={
                          i === 0
                            ? "border-accent-primary/20 bg-accent-primary/10 relative flex items-center justify-between gap-2 border px-3 py-2 text-sm"
                            : "bg-muted flex items-center justify-between gap-2 px-3 py-2 text-sm"
                        }
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-foreground font-mono text-xs font-medium">
                            v{v.version_number}
                          </span>
                          {i === 0 && (
                            <Badge className="bg-accent-primary absolute top-0 left-0 h-3 border-transparent p-0 text-[9px] text-white opacity-75">
                              LATEST
                            </Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground flex items-center gap-3 text-xs">
                          <span>{formatDownloads(v.downloads)}</span>
                          <span>{formatDate(v.date_created)}</span>
                          {isCurrent ? (
                            <Button variant="outline-success" size="sm" disabled>
                              <Check />
                              Installed
                            </Button>
                          ) : (
                            <Button
                              variant="outline-accent-primary"
                              size="sm"
                              onClick={() => handleInstallVersion(v.version_number)}
                              disabled={isVersionQueued || isInstalling}
                              title={isVersionQueued ? "Manage in Downloads" : undefined}
                            >
                              {isVersionQueued ? (
                                isInstalling ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <Clock />
                                )
                              ) : (
                                <Download />
                              )}
                              {isVersionQueued
                                ? downloadStatusLabel(queueStatus ?? "queued")
                                : "Install"}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dependencies */}
            {dependencies.length > 0 && (
              <div>
                <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                  <span className="flex items-center gap-1.5">
                    <Layers className="size-3.5" />
                    Dependencies ({dependencies.length})
                  </span>
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {dependencies.map((dep) => {
                    const parts = dep.split("-");
                    const depName = parts.length >= 3 ? parts.slice(0, -1).join("-") : dep;
                    const depVersion = parts.length >= 3 ? parts[parts.length - 1] : "";
                    return (
                      <Badge key={dep} variant="secondary">
                        {depName}
                        {depVersion && <span className="text-muted-foreground">{depVersion}</span>}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Action Footer */}
        <SheetFooter className="flex-col items-center gap-1 border-t">
          {isInstalled ? (
            <div className="grid w-full grid-cols-[1fr_min-content] items-center gap-1">
              <Button variant="outline-success" size="lg" disabled>
                <CheckCircle />
                Installed (v{installedVersion ?? pkg.version_number})
              </Button>
              <Button variant="destructive" size="lg" onClick={handleUninstall}>
                Uninstall
              </Button>
            </div>
          ) : (
            <Button
              variant={isQueued ? "secondary" : "accent-primary"}
              size="lg"
              className="w-full"
              onClick={handleInstall}
              title={isQueued ? "Open downloads" : undefined}
            >
              {isQueued ? (
                <>
                  {isInstalling ? <Loader2 className="animate-spin" /> : <Clock />}
                  {downloadStatusLabel(queueStatus ?? "queued")}
                </>
              ) : (
                <>
                  <Download />
                  Install v{pkg.version_number}
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            render={<a href={packageUrl} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLink />
            View on {sourceLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
