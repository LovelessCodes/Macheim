import type { DownloadStatus } from "./types";

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
