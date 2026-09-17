import { cn } from "cn";
import {
  ChevronRight,
  Clock,
  Download,
  Gamepad2,
  Loader2,
  Pause,
  Package,
  WifiOff,
} from "lucide-react";

import { formatBytes } from "../../lib/format";
import type { DownloadItem } from "../../lib/types";
import { isDownloadActive } from "../../lib/types";
import { useDownloadStore } from "../../store/downloadStore";
import {
  useActiveDownload,
  usePendingDownloadCount,
  useWaitingDownload,
} from "../../store/downloadStore";
import { Card, CardContent } from "../ui/card";
import { Progress } from "../ui/progress";

function QueueIcon({ item }: { item: DownloadItem }) {
  switch (item.status) {
    case "downloading":
      return <Download className="text-accent-primary size-5 shrink-0 animate-pulse" />;
    case "installing":
      return <Loader2 className="text-accent-primary size-5 shrink-0 animate-spin" />;
    case "paused":
      return <Pause className="text-muted-foreground size-5 shrink-0" />;
    case "waiting_for_game":
      return <Gamepad2 className="size-5 shrink-0 text-[var(--color-accent-amber)]" />;
    case "waiting_for_network":
      return <WifiOff className="size-5 shrink-0 text-[var(--color-warning)]" />;
    default:
      return <Clock className="text-muted-foreground size-5 shrink-0" />;
  }
}

/**
 * Bottom-center status card for queued installs. Clicking opens the download
 * queue; it also surfaces Sync & Clean downloads, which are not queue items.
 */
export default function ProgressOverlay() {
  const active = useActiveDownload();
  const waiting = useWaitingDownload();
  const standalone = useDownloadStore((state) => state.standaloneProgress);
  const pendingCount = usePendingDownloadCount();
  const setPanelOpen = useDownloadStore((state) => state.setPanelOpen);

  const item = active ?? waiting;

  if (!item && !standalone) return null;

  const queuePct = item && item.total > 0 ? Math.round((item.current / item.total) * 100) : null;
  const bytePct =
    item && item.bytes_total ? Math.round((item.bytes_downloaded / item.bytes_total) * 100) : null;
  const isDownloading = item?.status === "downloading";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center p-6">
      <Card
        role={item ? "button" : undefined}
        tabIndex={item ? 0 : undefined}
        aria-label={item ? "Open downloads" : undefined}
        onClick={item ? () => setPanelOpen(true) : undefined}
        onKeyDown={
          item
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setPanelOpen(true);
                }
              }
            : undefined
        }
        className={cn(
          "animate-in fade-in slide-in-from-bottom-4 pointer-events-auto w-full max-w-lg gap-0 overflow-hidden py-0 shadow-2xl shadow-black/40 duration-200",
          item && "cursor-pointer transition-colors hover:bg-muted/40",
        )}
      >
        <Progress
          value={queuePct ?? (item ? 0 : null)}
          className="[&_[data-slot=progress-track]]:bg-muted [&_[data-slot=progress-indicator]]:bg-accent-primary [&_[data-slot=progress-indicator]]:transition-all [&_[data-slot=progress-track]]:h-1"
        />

        <CardContent className="flex items-center gap-3 p-4">
          {item ? (
            <QueueIcon item={item} />
          ) : (
            <Loader2 className="text-accent-primary size-5 shrink-0 animate-spin" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <p className="text-foreground truncate text-sm font-medium">
                {item ? item.message : standalone?.message}
              </p>
              {item && item.total > 0 && (
                <span className="text-muted-foreground ml-2 shrink-0 text-xs">
                  {item.current}/{item.total}
                </span>
              )}
            </div>

            {item ? (
              <div className="mt-1 flex items-center gap-2">
                <Package className="text-muted-foreground size-3 shrink-0" />
                <p className="text-muted-foreground truncate text-xs">
                  {item.name}
                  {item.version ? ` v${item.version}` : ""}
                </p>
                {pendingCount > 1 && (
                  <span className="text-muted-foreground shrink-0 text-[10px]">
                    +{pendingCount - 1} more queued
                  </span>
                )}
              </div>
            ) : (
              standalone?.mod_name && (
                <div className="mt-1 flex items-center gap-2">
                  <Package className="text-muted-foreground size-3 shrink-0" />
                  <p className="text-muted-foreground truncate text-xs">{standalone.mod_name}</p>
                </div>
              )
            )}

            {isDownloading && item && item.bytes_downloaded > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <Progress
                  value={bytePct ?? 50}
                  className="[&_[data-slot=progress-indicator]]:bg-accent-amber flex-1 [&_[data-slot=progress-track]]:h-1.5"
                />
                <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                  {formatBytes(item.bytes_downloaded)}
                  {item.bytes_total ? ` / ${formatBytes(item.bytes_total)}` : ""}
                </span>
              </div>
            )}

            {!item && standalone && standalone.bytes_downloaded > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <Progress
                  value={
                    standalone.bytes_total
                      ? Math.round((standalone.bytes_downloaded / standalone.bytes_total) * 100)
                      : 50
                  }
                  className="[&_[data-slot=progress-indicator]]:bg-accent-amber flex-1 [&_[data-slot=progress-track]]:h-1.5"
                />
                <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                  {formatBytes(standalone.bytes_downloaded)}
                  {standalone.bytes_total ? ` / ${formatBytes(standalone.bytes_total)}` : ""}
                </span>
              </div>
            )}
          </div>

          {item && !isDownloadActive(item.status) && (
            <ChevronRight className="text-muted-foreground size-4 shrink-0" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
