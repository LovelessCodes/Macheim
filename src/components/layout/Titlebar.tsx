import { Download, Loader2, RotateCcw, Search } from "lucide-react";

import { useUpdater } from "../../hooks/use-updater";
import { useRunCommand } from "../command-runtime";
import ThemeToggle from "../common/ThemeToggle";
import { Button } from "../ui/button";
import { SidebarTrigger } from "../ui/sidebar";

export default function Titlebar() {
  const runCommand = useRunCommand();
  const { status, version, progress, install, restart } = useUpdater();

  const updateButton =
    status === "available" ? (
      <Button
        variant="outline-accent-primary"
        size="xs"
        onClick={() => void install()}
        title={version ? `Install Macheim ${version}` : "Install update"}
      >
        <Download />
        {version ? `Update v${version}` : "Update"}
      </Button>
    ) : status === "downloading" ? (
      <Button variant="outline-accent-primary" size="xs" disabled>
        <Loader2 className="animate-spin" />
        Downloading{progress !== null ? ` ${Math.round(progress * 100)}%` : "..."}
      </Button>
    ) : status === "ready" ? (
      <Button
        variant="accent-primary"
        size="xs"
        onClick={() => void restart()}
        title="Restart to finish updating"
      >
        <RotateCcw />
        Restart
      </Button>
    ) : null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-20 flex h-8 items-center gap-2 pr-2 pl-19 select-none"
      data-tauri-drag-region
    >
      <SidebarTrigger />
      <div className="bg-muted block h-2/3 w-0.5" />
      <span className="text-muted-foreground hidden truncate text-[10px] font-medium tracking-widest whitespace-nowrap uppercase sm:inline">
        Valheim Mod Manager
      </span>
      {updateButton}

      <div className="ms-auto flex items-center gap-1">
        <Button
          variant="outline"
          size="xs"
          className="text-muted-foreground gap-2"
          onClick={() => runCommand("app.commandPalette")}
          title="Search pages and actions"
        >
          <Search />
          <span className="hidden sm:inline">Search</span>
          <kbd className="pointer-events-none hidden rounded-none border px-1 font-sans text-[10px] sm:inline">
            ⌘K
          </kbd>
        </Button>
        <ThemeToggle />
      </div>
    </div>
  );
}
