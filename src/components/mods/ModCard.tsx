import { Download, CheckCircle, Loader2, Package } from "lucide-react";
import type { ThunderstorePackage } from "../../lib/types";
import { useModStore } from "../../store/modStore";
import { installMod, getInstalledMods } from "../../lib/tauri";
import { toast } from "../ui/toast";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";

interface ModCardProps {
  pkg: ThunderstorePackage;
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function ModCard({ pkg }: ModCardProps) {
  const installedMods = useModStore((s) => s.installedMods);
  const isInstallingMod = useModStore((s) => s.isInstallingMod);
  const setInstallingMod = useModStore((s) => s.setInstallingMod);
  const setInstalledMods = useModStore((s) => s.setInstalledMods);
  const setSelectedPackage = useModStore((s) => s.setSelectedPackage);

  const isInstalled = installedMods.some(
    (m) => m.full_name === pkg.full_name
  );
  const isInstalling = isInstallingMod === pkg.full_name;

  const handleInstall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isInstalled || isInstalling) return;

    setInstallingMod(pkg.full_name);
    try {
      await installMod(pkg.full_name, pkg.version_number);
      // Refresh installed mods list
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

  return (
    <Card
      size="sm"
      onClick={() => setSelectedPackage(pkg)}
      className="group cursor-pointer gap-0 transition-colors hover:bg-muted/40"
    >
      <CardHeader className="grid-cols-[auto_1fr] items-start gap-3">
        {pkg.icon ? (
          <img
            src={pkg.icon}
            alt={pkg.name}
            className="size-14 shrink-0 bg-muted object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex size-14 shrink-0 items-center justify-center bg-muted">
            <Package className="size-6 text-muted-foreground" />
          </div>
        )}

        <div className="grid min-w-0 gap-0.5">
          <CardTitle className="truncate transition-colors group-hover:text-[var(--color-accent-amber)]">
            {pkg.name}
          </CardTitle>
          <CardDescription className="truncate">
            by {pkg.owner}
          </CardDescription>
          <CardDescription className="mt-1 line-clamp-2 leading-relaxed">
            {pkg.description || "No description"}
          </CardDescription>
        </div>
      </CardHeader>

      <CardFooter className="justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Download className="size-3" />
            {formatDownloads(pkg.downloads)}
          </span>
          <Badge variant="outline">v{pkg.version_number}</Badge>
        </div>

        <Button
          size="sm"
          variant={
            isInstalled
              ? "outline-success"
              : isInstalling
                ? "secondary"
                : "accent-primary"
          }
          onClick={handleInstall}
          disabled={isInstalled || isInstalling}
        >
          {isInstalled ? (
            <>
              <CheckCircle />
              Installed
            </>
          ) : isInstalling ? (
            <>
              <Loader2 className="animate-spin" />
              Installing
            </>
          ) : (
            "Install"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
