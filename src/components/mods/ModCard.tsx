import type { ReactNode } from "react";
import { Download, CheckCircle, Loader2, Package } from "lucide-react";
import type { ThunderstorePackage } from "../../lib/types";
import { useModStore } from "../../store/modStore";
import { usePackageInstall } from "../../hooks/use-package-install";
import { formatDownloads } from "../../lib/format";
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
  kind?: "mod" | "modpack";
  extraMeta?: ReactNode;
  showVersion?: boolean;
}

export default function ModCard({
  pkg,
  kind = "mod",
  extraMeta,
  showVersion = true,
}: ModCardProps) {
  const setSelectedPackage = useModStore((s) => s.setSelectedPackage);
  const { install, isInstalled, isInstalling } = usePackageInstall(pkg, kind);

  const handleInstall = (e: React.MouseEvent) => {
    e.stopPropagation();
    void install();
  };

  return (
    <Card
      size="sm"
      onClick={() => setSelectedPackage(pkg)}
      className="group cursor-pointer gap-3 transition-colors hover:bg-muted/40"
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

      <CardFooter className="mt-auto justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Download className="size-3" />
            {formatDownloads(pkg.downloads)}
          </span>
          {showVersion && (
            <Badge variant="outline">v{pkg.version_number}</Badge>
          )}
          {extraMeta}
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
