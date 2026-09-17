import type { DownloadStatus } from "./types";

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
