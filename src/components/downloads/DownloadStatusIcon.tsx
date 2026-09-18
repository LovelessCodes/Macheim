import { cn } from "cn";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Gamepad2,
  Loader2,
  Pause,
  WifiOff,
  XCircle,
} from "lucide-react";

import type { DownloadStatus } from "../../lib/types";

/** Status icon shared by the queue panel and the bottom status card. */
export default function DownloadStatusIcon({
  status,
  className,
}: {
  status: DownloadStatus;
  className?: string;
}) {
  const base = cn("shrink-0", className);
  switch (status) {
    case "downloading":
      return <Download className={cn(base, "text-accent-primary animate-pulse")} />;
    case "installing":
      return <Loader2 className={cn(base, "text-accent-primary animate-spin")} />;
    case "queued":
      return <Clock className={cn(base, "text-muted-foreground")} />;
    case "paused":
      return <Pause className={cn(base, "text-muted-foreground")} />;
    case "waiting_for_game":
      return <Gamepad2 className={cn(base, "text-[var(--color-accent-amber)]")} />;
    case "waiting_for_network":
      return <WifiOff className={cn(base, "text-[var(--color-warning)]")} />;
    case "completed":
      return <CheckCircle className={cn(base, "text-[var(--color-success)]")} />;
    case "failed":
      return <AlertTriangle className={cn(base, "text-destructive")} />;
    case "cancelled":
      return <XCircle className={cn(base, "text-muted-foreground")} />;
  }
}
