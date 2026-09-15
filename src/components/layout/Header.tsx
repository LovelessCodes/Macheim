import { RefreshCw } from "lucide-react";

import { useAppStore } from "../../store/appStore";

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

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] px-6">
      <h2 className="text-lg font-semibold whitespace-nowrap text-[var(--color-text-primary)]">
        {pageTitles[currentPage] ?? "Macheim"}
      </h2>

      <div className="flex-1" />

      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      )}
    </header>
  );
}
