import { listen } from "@tauri-apps/api/event";
import { cn } from "cn";
import { Loader2, Download, CheckCircle, Package } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Card, CardContent } from "../ui/card";
import { Progress } from "../ui/progress";

interface ProgressEvent {
  stage: string;
  mod_name: string;
  current: number;
  total: number;
  bytes_downloaded: number;
  bytes_total: number | null;
  message: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default function ProgressOverlay() {
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const hideTimeout = useRef<number | null>(null);

  useEffect(() => {
    function clearHideTimeout() {
      if (hideTimeout.current !== null) {
        window.clearTimeout(hideTimeout.current);
        hideTimeout.current = null;
      }
    }

    const unlisten = listen<ProgressEvent>("mod-progress", (event) => {
      const p = event.payload;
      clearHideTimeout();
      if (p.stage === "done") {
        // Show done briefly then hide
        setProgress(p);
        hideTimeout.current = window.setTimeout(() => {
          hideTimeout.current = null;
          setVisible(false);
          setProgress(null);
        }, 2000);
      } else if (p.stage === "error") {
        // The failing command reports the error itself; just clear the overlay
        setVisible(false);
        setProgress(null);
      } else {
        setProgress(p);
        setVisible(true);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
      clearHideTimeout();
    };
  }, []);

  if (!visible || !progress) return null;

  const isDone = progress.stage === "done";
  const isDownloading = progress.stage === "downloading";
  const pct = progress.bytes_total
    ? Math.round((progress.bytes_downloaded / progress.bytes_total) * 100)
    : null;
  const overallPct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center p-6">
      <Card className="animate-in fade-in slide-in-from-bottom-4 pointer-events-auto w-full max-w-lg gap-0 overflow-hidden py-0 shadow-2xl shadow-black/40 duration-200">
        {/* Overall progress bar */}
        <Progress
          value={isDone ? 100 : overallPct}
          className={cn(
            "[&_[data-slot=progress-indicator]]:transition-all [&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-track]]:bg-muted",
            isDone
              ? "[&_[data-slot=progress-indicator]]:bg-[var(--color-success)]"
              : "[&_[data-slot=progress-indicator]]:bg-accent-primary",
          )}
        />

        <CardContent className="flex items-center gap-3 p-4">
          {isDone ? (
            <CheckCircle className="size-5 shrink-0 text-[var(--color-success)]" />
          ) : isDownloading ? (
            <Download className="text-accent-primary size-5 shrink-0 animate-pulse" />
          ) : (
            <Loader2 className="text-accent-primary size-5 shrink-0 animate-spin" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <p className="text-foreground truncate text-sm font-medium">{progress.message}</p>
              {progress.total > 0 && !isDone && (
                <span className="text-muted-foreground ml-2 shrink-0 text-xs">
                  {progress.current}/{progress.total}
                </span>
              )}
            </div>

            {progress.mod_name && !isDone && (
              <div className="mt-1 flex items-center gap-2">
                <Package className="text-muted-foreground size-3 shrink-0" />
                <p className="text-muted-foreground truncate text-xs">{progress.mod_name}</p>
              </div>
            )}

            {isDownloading && progress.bytes_downloaded > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <Progress
                  value={pct ?? 50}
                  className="[&_[data-slot=progress-indicator]]:bg-accent-amber flex-1 [&_[data-slot=progress-track]]:h-1.5"
                />
                <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                  {formatBytes(progress.bytes_downloaded)}
                  {progress.bytes_total ? ` / ${formatBytes(progress.bytes_total)}` : ""}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
