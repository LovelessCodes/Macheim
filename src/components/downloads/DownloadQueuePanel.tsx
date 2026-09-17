import { cn } from "cn";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Gamepad2,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";

import { formatBytes } from "../../lib/format";
import type { DownloadItem, DownloadStatus } from "../../lib/types";
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

function statusLabel(item: DownloadItem): string {
  switch (item.status) {
    case "queued":
      return "Queued";
    case "downloading":
      return "Downloading";
    case "installing":
      return "Installing";
    case "paused":
      return "Paused";
    case "waiting_for_game":
      return "Waiting for Valheim to close";
    case "waiting_for_network":
      return "No connection — retrying automatically";
    case "completed":
      return "Installed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function StatusIcon({ status }: { status: DownloadStatus }) {
  switch (status) {
    case "downloading":
      return <Download className="text-accent-primary size-4 shrink-0 animate-pulse" />;
    case "installing":
      return <Loader2 className="text-accent-primary size-4 shrink-0 animate-spin" />;
    case "queued":
      return <Clock className="text-muted-foreground size-4 shrink-0" />;
    case "paused":
      return <Pause className="text-muted-foreground size-4 shrink-0" />;
    case "waiting_for_game":
      return <Gamepad2 className="size-4 shrink-0 text-[var(--color-accent-amber)]" />;
    case "waiting_for_network":
      return <WifiOff className="size-4 shrink-0 text-[var(--color-warning)]" />;
    case "completed":
      return <CheckCircle className="size-4 shrink-0 text-[var(--color-success)]" />;
    case "failed":
      return <AlertTriangle className="text-destructive size-4 shrink-0" />;
    case "cancelled":
      return <XCircle className="text-muted-foreground size-4 shrink-0" />;
  }
}

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

function DownloadRow({ item }: { item: DownloadItem }) {
  const pending = isDownloadPending(item.status);
  const pct = progressValue(item);
  const { pause, resume, cancel, retry, remove } = useDownloadStore.getState();

  const canPause = isDownloadActive(item.status) || item.status === "queued";
  const detail = item.status === "failed" && item.error ? item.error : statusLabel(item);

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <StatusIcon status={item.status} />
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

  const pending = useMemo(() => items.filter((item) => isDownloadPending(item.status)), [items]);
  const finished = useMemo(
    () => items.filter((item) => !isDownloadPending(item.status)).reverse(),
    [items],
  );

  const { pauseAll, resumeAll, cancelAll, clearFinished } = useDownloadStore.getState();

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
              {pending.map((item) => (
                <DownloadRow key={item.id} item={item} />
              ))}

              {finished.length > 0 && (
                <div className="text-muted-foreground bg-muted/40 px-4 py-1.5 text-[10px] font-semibold tracking-wider uppercase">
                  History
                </div>
              )}
              {finished.map((item) => (
                <DownloadRow key={item.id} item={item} />
              ))}
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
