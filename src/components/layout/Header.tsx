import { Download, Loader2, RefreshCw, RotateCcw } from "lucide-react";

import { useUpdater } from "../../hooks/use-updater";
import { useAppStore } from "../../store/appStore";
import { Button } from "../ui/button";

const pageTitles: Record<string, string> = {
  browse: "Browse Mods",
  installed: "Installed Mods",
  modpacks: "Modpacks",
  config: "Config Editor",
  compatibility: "Mac Compatibility",
  profiles: "Profiles",
  settings: "Settings",
  setup: "Setup",
};

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function Header({ onRefresh, isRefreshing }: HeaderProps) {
  const currentPage = useAppStore((s) => s.currentPage);
  const { status, version, progress, install, restart } = useUpdater();

  const updateButton =
    status === "available" ? (
      <Button
        variant="outline-accent-primary"
        size="sm"
        onClick={() => void install()}
        title={version ? `Install Macheim ${version}` : "Install update"}
      >
        <Download />
        {version ? `Update v${version}` : "Update"}
      </Button>
    ) : status === "downloading" ? (
      <Button variant="outline-accent-primary" size="sm" disabled>
        <Loader2 className="animate-spin" />
        Downloading{progress !== null ? ` ${Math.round(progress * 100)}%` : "..."}
      </Button>
    ) : status === "ready" ? (
      <Button
        variant="accent-primary"
        size="sm"
        onClick={() => void restart()}
        title="Restart to finish updating"
      >
        <RotateCcw />
        Restart
      </Button>
    ) : null;

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4" data-tauri-drag-region>
      {updateButton && <div className="mr-1 flex items-center">{updateButton}</div>}

      <h2 className="text-foreground text-base font-semibold whitespace-nowrap">
        {pageTitles[currentPage] ?? "Macheim"}
      </h2>

      <div className="flex-1" />

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
