import { useLocation } from "@tanstack/react-router";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { PAGE_PATHS } from "../../lib/routes";
import { useDiagnosticsStore } from "../../store/diagnosticsStore";
import { Button } from "../ui/button";

const pageTitles: Record<string, string> = {
  [PAGE_PATHS.browse]: "Browse Mods",
  [PAGE_PATHS.installed]: "Installed Mods",
  [PAGE_PATHS.modpacks]: "Modpacks",
  [PAGE_PATHS.config]: "Config Editor",
  [PAGE_PATHS.compatibility]: "Mac Compatibility",
  [PAGE_PATHS.profiles]: "Profiles",
  [PAGE_PATHS.saves]: "Save Snapshots",
  [PAGE_PATHS.logs]: "Logs",
  [PAGE_PATHS.settings]: "Settings",
};

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function Header({ onRefresh, isRefreshing }: HeaderProps) {
  const { pathname } = useLocation();

  const crashReport = useDiagnosticsStore((s) => s.report);
  const openCrashReport = useDiagnosticsStore((s) => s.setReportOpen);

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4" data-tauri-drag-region>
      <h2 className="text-foreground text-base font-semibold whitespace-nowrap">
        {pageTitles[pathname] ?? "Macheim"}
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
