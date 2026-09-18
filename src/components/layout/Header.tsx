import { Clock, Download, Loader2, Pause, RefreshCw, TriangleAlert } from "lucide-react";

import { useAppStore } from "../../store/appStore";
import { useDiagnosticsStore } from "../../store/diagnosticsStore";
import {
  useDownloadIndicator,
  usePendingDownloadCount,
  useDownloadStore,
} from "../../store/downloadStore";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

const pageTitles: Record<string, string> = {
  browse: "Browse Mods",
  installed: "Installed Mods",
  modpacks: "Modpacks",
  config: "Config Editor",
  compatibility: "Mac Compatibility",
  profiles: "Profiles",
  saves: "Save Snapshots",
  settings: "Settings",
  setup: "Setup",
};

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function Header({ onRefresh, isRefreshing }: HeaderProps) {
  const currentPage = useAppStore((s) => s.currentPage);

  const activeDownload = useDownloadIndicator();
  const pendingDownloads = usePendingDownloadCount();
  const openDownloads = useDownloadStore((s) => s.setPanelOpen);
  const crashReport = useDiagnosticsStore((s) => s.report);
  const openCrashReport = useDiagnosticsStore((s) => s.setReportOpen);

  const isWaiting =
    activeDownload === "waiting_for_game" || activeDownload === "waiting_for_network";

  const downloadIcon =
    activeDownload === "active" ? (
      <Loader2 className="animate-spin" />
    ) : isWaiting ? (
      <Clock />
    ) : activeDownload === "paused" ? (
      <Pause />
    ) : (
      <Download />
    );

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4" data-tauri-drag-region>
      <h2 className="text-foreground text-base font-semibold whitespace-nowrap">
        {pageTitles[currentPage] ?? "Macheim"}
      </h2>

      <div className="flex-1" />

      {crashReport && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openCrashReport(true)}
          title="Open the latest crash report"
        >
          <TriangleAlert className="text-[var(--color-warning)]" />
          Crash report
        </Button>
      )}

      <Button
        variant={isWaiting ? "outline-warning" : "ghost"}
        size="sm"
        onClick={() => openDownloads(true)}
        title="Downloads"
      >
        {downloadIcon}
        Downloads
        {pendingDownloads > 0 && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
            {pendingDownloads}
          </Badge>
        )}
      </Button>

      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh"
        >
          <RefreshCw className={isRefreshing ? "animate-spin" : undefined} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      )}
    </header>
  );
}
