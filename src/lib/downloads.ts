import type { DownloadItem, DownloadStatus, ModProgressEvent } from "./types";
import { isDownloadActive } from "./types";

/** True when a dragged or picked path is a ZIP archive. */
export function isZipPath(path: string): boolean {
  return path.toLowerCase().endsWith(".zip");
}

/** True when a dragged or picked path is a shared profile export. */
export function isProfilePath(path: string): boolean {
  return path.toLowerCase().endsWith(".r2z");
}

/** Last path segment, for labels. */
export function fileName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

/** Percentage complete for a queue item, or null when it cannot be measured. */
export function downloadProgress(item: DownloadItem): number | null {
  if (item.bytes_total && item.bytes_total > 0) {
    return Math.round((item.bytes_downloaded / item.bytes_total) * 100);
  }
  if (isDownloadActive(item.status) && item.total > 0) {
    return Math.round((item.current / item.total) * 100);
  }
  return null;
}

/** Percentage complete for progress outside the queue (Sync & Clean). */
export function eventProgress(progress: ModProgressEvent): number | null {
  if (progress.bytes_total && progress.bytes_total > 0) {
    return Math.round((progress.bytes_downloaded / progress.bytes_total) * 100);
  }
  if (progress.total > 0) {
    return Math.round((progress.current / progress.total) * 100);
  }
  return null;
}

/** Short label for a queue item status, for buttons and rows. */
export function downloadStatusLabel(status: DownloadStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "downloading":
      return "Downloading";
    case "installing":
      return "Installing";
    case "paused":
      return "Paused";
    case "waiting_for_game":
      return "Waiting for Valheim";
    case "waiting_for_network":
      return "No connection";
    case "completed":
      return "Installed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}
