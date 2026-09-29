import { RefreshCw, TriangleAlert } from "lucide-react";

import { useAppStore } from "../../store/appStore";
import { useDiagnosticsStore } from "../../store/diagnosticsStore";
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

  const crashReport = useDiagnosticsStore((s) => s.report);
  const openCrashReport = useDiagnosticsStore((s) => s.setReportOpen);

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
