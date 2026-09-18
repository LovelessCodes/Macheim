import { confirm } from "@tauri-apps/plugin-dialog";
import { cn } from "cn";
import {
  Download,
  Loader2,
  PackageMinus,
  PackageX,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";

import { useInstalledMods } from "../../hooks/use-installed-mods";
import { useModUninstall } from "../../hooks/use-mod-uninstall";
import { downloadStatusLabel } from "../../lib/downloads";
import { formatBytes } from "../../lib/format";
import type { DownloadItem } from "../../lib/types";
import { isDownloadActive, isDownloadPending } from "../../lib/types";
import { useDownloadStore } from "../../store/downloadStore";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { ScrollArea } from "../ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import DownloadStatusIcon from "./DownloadStatusIcon";

function progressValue(item: DownloadItem): number | null {
  if (item.status === "downloading" && item.bytes_total) {
    return Math.round((item.bytes_downloaded / item.bytes_total) * 100);
  }
  if (isDownloadActive(item.status) && item.total > 0) {
    return Math.round((item.current / item.total) * 100);
  }
  return null;
}

function IconAction({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={onClick}
            className={cn("text-muted-foreground", className)}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function DownloadRow({
  item,
  installedVersion,
  isUninstalling,
  onUninstall,
  onReinstall,
}: {
  item: DownloadItem;
  /** Version on disk for this mod in the active profile, if any. */
  installedVersion: string | null;
  isUninstalling: boolean;
  onUninstall: () => void;
  onReinstall: () => void;
}) {
  const pending = isDownloadPending(item.status);
  const pct = progressValue(item);
  const { pause, resume, cancel, retry, remove } = useDownloadStore.getState();
  const isInstalled = installedVersion === item.version;

  const canPause = isDownloadActive(item.status) || item.status === "queued";
  const wasUninstalled = item.status === "completed" && installedVersion === null;
  const detail =
    item.status === "failed" && item.error
      ? item.error
      : wasUninstalled
        ? "Uninstalled — re-install to restore"
        : item.message || downloadStatusLabel(item.status);

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          {wasUninstalled ? (
            <PackageX className="text-muted-foreground size-4 shrink-0" />
          ) : (
            <DownloadStatusIcon status={item.status} className="size-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-foreground truncate text-sm font-medium">{item.name}</span>
            {item.version && (
              <Badge variant="outline" className="shrink-0">
                v{item.version}
              </Badge>
            )}
            {item.kind === "modpack" && (
              <Badge variant="secondary" className="shrink-0">
                Modpack
              </Badge>
            )}
            {item.local_path && (
              <Badge variant="outline" className="shrink-0">
                From file
              </Badge>
            )}
          </div>
          <p
            className={cn(
              "truncate text-xs",
              item.status === "failed" ? "text-destructive" : "text-muted-foreground",
            )}
            title={detail}
          >
            {detail}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {item.status === "paused" && (
            <IconAction label="Resume" onClick={() => void resume(item.id)}>
              <Play />
            </IconAction>
          )}
          {canPause && (
            <IconAction label="Pause" onClick={() => void pause(item.id)}>
              <Pause />
            </IconAction>
          )}
          {item.status === "waiting_for_network" && (
            <IconAction label="Retry now" onClick={() => void retry(item.id)}>
              <RefreshCw />
            </IconAction>
          )}
          {pending ? (
            <IconAction
              label="Cancel"
              onClick={() => void cancel(item.id)}
              className="hover:text-destructive"
            >
              <X />
            </IconAction>
          ) : (
            <>
              {(item.status === "failed" || item.status === "cancelled") && (
                <IconAction label="Retry" onClick={() => void retry(item.id)}>
                  <RefreshCw />
                </IconAction>
              )}
              {item.status === "completed" &&
                (isInstalled ? (
                  <IconAction
                    label="Uninstall mod"
                    onClick={onUninstall}
                    className="hover:text-destructive"
                  >
                    {isUninstalling ? <Loader2 className="animate-spin" /> : <PackageMinus />}
                  </IconAction>
                ) : (
                  <IconAction label="Re-install" onClick={onReinstall}>
                    <RotateCcw />
                  </IconAction>
                ))}
              <IconAction
                label="Remove from list"
                onClick={() => void remove(item.id)}
                className="hover:text-destructive"
              >
                <Trash2 />
              </IconAction>
            </>
          )}
        </div>
      </div>

      {pct !== null && pending && (
        <div className="flex items-center gap-2 pl-7">
          <Progress
            value={pct}
            className="[&_[data-slot=progress-indicator]]:bg-accent-amber flex-1 [&_[data-slot=progress-track]]:h-1"
          />
          <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
            {item.bytes_total
              ? `${formatBytes(item.bytes_downloaded)} / ${formatBytes(item.bytes_total)}`
              : `${item.current}/${item.total}`}
          </span>
        </div>
      )}
    </div>
  );
}

export default function DownloadQueuePanel() {
  const open = useDownloadStore((state) => state.panelOpen);
  const setOpen = useDownloadStore((state) => state.setPanelOpen);
  const items = useDownloadStore((state) => state.items);
  const paused = useDownloadStore((state) => state.paused);
  const reinstall = useDownloadStore((state) => state.reinstall);

  const { data: installedMods = [] } = useInstalledMods();
  const installedVersions = useMemo(
    () => new Map(installedMods.map((mod) => [mod.full_name, mod.version])),
    [installedMods],
  );
  const { uninstall, uninstallingFullName } = useModUninstall();

  const pending = useMemo(() => items.filter((item) => isDownloadPending(item.status)), [items]);
  const finished = useMemo(
    () => items.filter((item) => !isDownloadPending(item.status)).reverse(),
    [items],
  );

  const { pauseAll, resumeAll, cancelAll, clearFinished } = useDownloadStore.getState();

  const handleUninstall = async (item: DownloadItem) => {
    const confirmed = await confirm(`Uninstall "${item.name}"? This removes its files.`, {
      title: "Uninstall mod",
      kind: "warning",
    });
    if (confirmed) uninstall(item.full_name, item.name);
  };

  const renderRow = (item: DownloadItem) => (
    <DownloadRow
      key={item.id}
      item={item}
      // The row whose version is on disk can be uninstalled; older rows offer
      // a re-install of their own version.
      installedVersion={installedVersions.get(item.full_name) ?? null}
      isUninstalling={uninstallingFullName === item.full_name}
      onUninstall={() => void handleUninstall(item)}
      onReinstall={() => void reinstall(item.id)}
    />
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Downloads</SheetTitle>
          <SheetDescription>
            {pending.length > 0
              ? `${pending.length} item${pending.length === 1 ? "" : "s"} in queue${paused ? " — paused" : ""}`
              : "Installs are queued and continue in the background."}
          </SheetDescription>
        </SheetHeader>

        {pending.length > 0 && (
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void (paused ? resumeAll() : pauseAll())}
            >
              {paused ? <Play /> : <Pause />}
              {paused ? "Resume all" : "Pause all"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void cancelAll()}>
              <X />
              Cancel all
            </Button>
          </div>
        )}

        <ScrollArea scrollFade className="min-h-0 flex-1">
          {pending.length === 0 && finished.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <Download className="text-muted-foreground mb-4" size={40} />
              <h3 className="text-foreground mb-1 text-base font-semibold">No downloads</h3>
              <p className="text-muted-foreground text-sm">
                Installs you start appear here, and keep going while you browse.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {pending.map((item) => renderRow(item))}

              {finished.length > 0 && (
                <div className="text-muted-foreground bg-muted/40 px-4 py-1.5 text-[10px] font-semibold tracking-wider uppercase">
                  History
                </div>
              )}
              {finished.map((item) => renderRow(item))}
            </div>
          )}
        </ScrollArea>

        {finished.length > 0 && (
          <SheetFooter className="border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => void clearFinished()}
            >
              <Trash2 />
              Clear finished
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
