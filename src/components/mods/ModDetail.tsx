import {
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

import { formatDate, formatDownloads } from "../../lib/format";
import { installMod, uninstallMod, getInstalledMods, getPackageDetails } from "../../lib/tauri";
import type { ThunderstorePackage, PackageDetail } from "../../lib/types";
import { useModStore } from "../../store/modStore";
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
import { toast } from "../ui/toast";

interface ModDetailProps {
  pkg: ThunderstorePackage;
  onClose: () => void;
}

export default function ModDetail({ pkg, onClose }: ModDetailProps) {
  const installedMods = useModStore((s) => s.installedMods);
  const isInstallingMod = useModStore((s) => s.isInstallingMod);
  const setInstallingMod = useModStore((s) => s.setInstallingMod);
  const setInstalledMods = useModStore((s) => s.setInstalledMods);

  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Open on the next frame so the Sheet plays its enter transition, and let
  // the exit transition finish before the parent unmounts us.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);

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
      toast.add({ type: "success", title: `Installed ${pkg.name}` });
    } catch (err) {
      toast.add({
        type: "error",
        title: `Failed to install ${pkg.name}: ${err}`,
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
      toast.add({ type: "info", title: `Uninstalled ${pkg.name}` });
    } catch (err) {
      toast.add({
        type: "error",
        title: `Failed to uninstall ${pkg.name}: ${err}`,
      });
    }
  };

  const thunderstoreUrl = `https://thunderstore.io/c/valheim/p/${pkg.owner}/${pkg.name}/`;

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
              {pkg.icon ? (
                <img
                  src={pkg.icon}
                  alt={pkg.name}
                  className="bg-muted size-20 shrink-0 object-cover"
                />
              ) : (
                <div className="bg-muted flex size-20 shrink-0 items-center justify-center">
                  <Package className="text-muted-foreground size-8" />
                </div>
              )}
              <div className="min-w-0">
                <h3 className="text-foreground text-xl font-bold">{pkg.name}</h3>
                <p className="text-muted-foreground mt-0.5 text-sm">by {pkg.owner}</p>
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
                  {detail.versions.slice(0, 15).map((v, i) => (
                    <div
                      key={v.version_number}
                      className={
                        i === 0
                          ? "border-accent-primary/20 bg-accent-primary/10 flex items-center justify-between border px-3 py-2 text-sm"
                          : "bg-muted flex items-center justify-between px-3 py-2 text-sm"
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-mono text-xs font-medium">
                          v{v.version_number}
                        </span>
                        {i === 0 && (
                          <Badge className="bg-accent-primary border-transparent text-white">
                            LATEST
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground flex items-center gap-3 text-xs">
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
                Installed (v
                {installedMods.find((m) => m.full_name === pkg.full_name)?.version ??
                  pkg.version_number}
                )
              </Button>
              <Button variant="destructive" size="lg" onClick={handleUninstall}>
                Uninstall
              </Button>
            </div>
          ) : (
            <Button
              variant="accent-primary"
              size="lg"
              className="w-full"
              onClick={handleInstall}
              disabled={isInstalling}
            >
              {isInstalling ? (
                <>
                  <Loader2 className="animate-spin" />
                  Installing...
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
            render={<a href={thunderstoreUrl} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLink />
            View on Thunderstore
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
