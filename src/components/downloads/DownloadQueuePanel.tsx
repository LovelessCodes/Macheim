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
import { useShallow } from "zustand/react/shallow";

import { useInstalledMods } from "../../hooks/use-installed-mods";
import { useModUninstall } from "../../hooks/use-mod-uninstall";
import { downloadProgress, downloadStatusLabel, eventProgress } from "../../lib/downloads";
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
  id,
  installedVersions,
  uninstallingFullName,
  onUninstall,
  onReinstall,
}: {
  id: number;
  /** Version on disk per mod in the active profile. */
  installedVersions: Map<string, string>;
  uninstallingFullName: string | null;
  onUninstall: (item: DownloadItem) => void;
  onReinstall: () => void;
}) {
  // Subscribe per row: a byte update for one item must not re-render the list.
  const item = useDownloadStore((state) => state.items.find((candidate) => candidate.id === id));
  if (!item) return null;

  const pending = isDownloadPending(item.status);
  const pct = downloadProgress(item);
  const { pause, resume, cancel, retry, remove } = useDownloadStore.getState();
  const installedVersion = installedVersions.get(item.full_name) ?? null;
  const isUninstalling = uninstallingFullName === item.full_name;
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
                    onClick={() => onUninstall(item)}
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
  const paused = useDownloadStore((state) => state.paused);
  const standalone = useDownloadStore((state) => state.standaloneProgress);
  const reinstall = useDownloadStore((state) => state.reinstall);
  // Only the id lists drive the panel's own renders; byte progress lives in the
  // rows, which subscribe individually.
  const pendingIds = useDownloadStore(
    useShallow((state) =>
      state.items.filter((item) => isDownloadPending(item.status)).map((item) => item.id),
    ),
  );
  const finishedIds = useDownloadStore(
    useShallow((state) =>
      state.items
        .filter((item) => !isDownloadPending(item.status))
        .reverse()
        .map((item) => item.id),
    ),
  );

  const { data: installedMods = [] } = useInstalledMods();
  const installedVersions = useMemo(
    () => new Map(installedMods.map((mod) => [mod.full_name, mod.version])),
    [installedMods],
  );
  const { uninstall, uninstallingFullName } = useModUninstall();

  const standalonePct = standalone ? eventProgress(standalone) : null;

  const { pauseAll, resumeAll, cancelAll, clearFinished } = useDownloadStore.getState();

  const handleUninstall = async (item: DownloadItem) => {
    const confirmed = await confirm(`Uninstall "${item.name}"? This removes its files.`, {
      title: "Uninstall mod",
      kind: "warning",
    });
    if (confirmed) uninstall(item.full_name, item.name);
  };

  const renderRow = (id: number) => (
    <DownloadRow
      key={id}
      id={id}
      // The row whose version is on disk can be uninstalled; older rows offer
      // a re-install of their own version.
      installedVersions={installedVersions}
      uninstallingFullName={uninstallingFullName}
      onUninstall={(item) => void handleUninstall(item)}
      onReinstall={() => void reinstall(id)}
    />
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Downloads</SheetTitle>
          <SheetDescription>
            {pendingIds.length > 0
              ? `${pendingIds.length} item${pendingIds.length === 1 ? "" : "s"} in queue${paused ? " — paused" : ""}`
              : "Installs are queued and continue in the background."}
          </SheetDescription>
        </SheetHeader>

        {pendingIds.length > 0 && (
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

        {standalone && (
          <div className="border-b px-4 py-3">
            <div className="flex items-start gap-3">
              <Loader2 className="text-accent-primary mt-0.5 size-4 shrink-0 animate-spin" />
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-sm font-medium">
                  {standalone.message || "Working..."}
                </p>
                {standalone.mod_name && (
                  <p className="text-muted-foreground truncate text-xs">{standalone.mod_name}</p>
                )}
                {standalonePct !== null && (
                  <div className="mt-2 flex items-center gap-2">
                    <Progress
                      value={standalonePct}
                      className="[&_[data-slot=progress-indicator]]:bg-accent-amber flex-1 [&_[data-slot=progress-track]]:h-1"
                    />
                    <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                      {formatBytes(standalone.bytes_downloaded)}
                      {standalone.bytes_total ? ` / ${formatBytes(standalone.bytes_total)}` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <ScrollArea scrollFade className="min-h-0 flex-1">
          {pendingIds.length === 0 && finishedIds.length === 0 && !standalone ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <Download className="text-muted-foreground mb-4" size={40} />
              <h3 className="text-foreground mb-1 text-base font-semibold">No downloads</h3>
              <p className="text-muted-foreground text-sm">
                Installs you start appear here, and keep going while you browse.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {pendingIds.map((id) => renderRow(id))}

              {finishedIds.length > 0 && (
                <div className="text-muted-foreground bg-muted/40 px-4 py-1.5 text-[10px] font-semibold tracking-wider uppercase">
                  History
                </div>
              )}
              {finishedIds.map((id) => renderRow(id))}
            </div>
          )}
        </ScrollArea>

        {finishedIds.length > 0 && (
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
