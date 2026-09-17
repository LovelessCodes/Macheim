import { CheckCircle, Clock, Download, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { usePackageInstall } from "../../hooks/use-package-install";
import { downloadStatusLabel } from "../../lib/downloads";
import { formatDownloads } from "../../lib/format";
import type { ThunderstorePackage } from "../../lib/types";
import { useDownloadStore } from "../../store/downloadStore";
import { useModStore } from "../../store/modStore";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import ModIcon from "./ModIcon";

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
  const openDownloads = useDownloadStore((s) => s.setPanelOpen);
  const { install, isInstalled, isQueued, isInstalling, queueStatus } = usePackageInstall(
    pkg,
    kind,
  );

  const handleInstall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isQueued) {
      openDownloads(true);
      return;
    }
    install();
  };

  return (
    <Card
      size="sm"
      onClick={() => setSelectedPackage(pkg)}
      className="group hover:bg-muted/40 cursor-pointer gap-3 transition-colors"
    >
      <CardHeader className="grid-cols-[auto_1fr] items-start gap-3">
        <ModIcon src={pkg.icon} alt={pkg.name} className="size-14" iconClassName="size-6" />

        <div className="grid min-w-0 gap-0.5">
          <CardTitle className="truncate transition-colors group-hover:text-[var(--color-accent-amber)]">
            {pkg.name}
          </CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <span className="truncate">by {pkg.owner}</span>
            {pkg.source === "hexium" && (
              <Badge
                variant="outline"
                className="border-accent-primary/40 text-accent-primary px-1.5 text-[10px]"
              >
                Hexium
              </Badge>
            )}
          </CardDescription>
          <CardDescription className="mt-1 line-clamp-2 leading-relaxed">
            {pkg.description || "No description"}
          </CardDescription>
        </div>
      </CardHeader>

      <CardFooter className="mt-auto justify-between">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1">
            <Download className="size-3" />
            {formatDownloads(pkg.downloads)}
          </span>
          {showVersion && <Badge variant="outline">v{pkg.version_number}</Badge>}
          {extraMeta}
        </div>

        <Button
          size="sm"
          variant={isInstalled ? "outline-success" : isQueued ? "secondary" : "accent-primary"}
          onClick={handleInstall}
          disabled={isInstalled}
          title={isQueued ? "Open downloads" : undefined}
        >
          {isInstalled ? (
            <>
              <CheckCircle />
              Installed
            </>
          ) : isInstalling ? (
            <>
              <Loader2 className="animate-spin" />
              {downloadStatusLabel(queueStatus ?? "installing")}
            </>
          ) : isQueued ? (
            <>
              <Clock />
              {downloadStatusLabel(queueStatus ?? "queued")}
            </>
          ) : (
            "Install"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
