import { cn } from "cn";
import { ChevronRight, Loader2, Package, X } from "lucide-react";
import { useMemo } from "react";

import { formatBytes } from "../../lib/format";
import { isDownloadActive, isDownloadPending } from "../../lib/types";
import { selectOverlayItem, useDownloadStore } from "../../store/downloadStore";
import DownloadStatusIcon from "../downloads/DownloadStatusIcon";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Progress } from "../ui/progress";

/**
 * Bottom-center status card for the install queue. Stays mounted for the whole
 * batch (showing queue position), can be dismissed, and opens the queue panel
 * when clicked. Sync & Clean downloads, which are not queue items, use it too.
 */
export default function ProgressOverlay() {
  const items = useDownloadStore((state) => state.items);
  const standalone = useDownloadStore((state) => state.standaloneProgress);
  const dismissed = useDownloadStore((state) => state.overlayDismissed);
  const dismissOverlay = useDownloadStore((state) => state.dismissOverlay);
  const openPanel = useDownloadStore((state) => state.setPanelOpen);

  const pending = useMemo(() => items.filter((item) => isDownloadPending(item.status)), [items]);
  const queueItem = useMemo(() => selectOverlayItem(pending), [pending]);
  const item = dismissed ? null : queueItem;
  const position = item ? pending.findIndex((candidate) => candidate.id === item.id) + 1 : 0;

  if (!item && !standalone) return null;

  const isDownloading = item?.status === "downloading";
  const itemPct = item && item.total > 0 ? Math.round((item.current / item.total) * 100) : null;
  const bytePct =
    item && item.bytes_total ? Math.round((item.bytes_downloaded / item.bytes_total) * 100) : null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center p-6">
      <Card
        onClick={item ? () => openPanel(true) : undefined}
        className={cn(
          "animate-in fade-in slide-in-from-bottom-4 pointer-events-auto w-full max-w-lg gap-0 overflow-hidden py-0 shadow-2xl shadow-black/40 duration-200",
          item && "cursor-pointer transition-colors hover:bg-muted/40",
        )}
      >
        <Progress
          value={item ? (bytePct ?? itemPct ?? 0) : null}
          className="[&_[data-slot=progress-track]]:bg-muted [&_[data-slot=progress-indicator]]:bg-accent-primary [&_[data-slot=progress-indicator]]:transition-all [&_[data-slot=progress-track]]:h-1"
        />

        <CardContent className="flex items-center gap-3 p-4">
          {item ? (
            <DownloadStatusIcon status={item.status} className="size-5" />
          ) : (
            <Loader2 className="text-accent-primary size-5 shrink-0 animate-spin" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <p className="text-foreground truncate text-sm font-medium">
                {item ? item.message : standalone?.message}
              </p>
              {item && pending.length > 0 && (
                <span className="text-muted-foreground ml-2 shrink-0 text-xs tabular-nums">
                  {position}/{pending.length}
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

          {item && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Hide status card"
              title="Hide for now"
              className="text-muted-foreground shrink-0"
              onClick={(event) => {
                event.stopPropagation();
                dismissOverlay();
              }}
            >
              <X />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
