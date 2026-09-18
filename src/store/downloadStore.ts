import { create } from "zustand";

import { toast } from "../components/ui/toast";
import * as tauri from "../lib/tauri";
import type {
  DownloadItem,
  DownloadQueueSnapshot,
  DownloadStatus,
  ModProgressEvent,
} from "../lib/types";
import { isDownloadPending } from "../lib/types";

interface DownloadStore {
  paused: boolean;
  items: DownloadItem[];
  panelOpen: boolean;
  /** User hid the bottom status card for the current queue. */
  overlayDismissed: boolean;
  /** Byte progress for downloads started outside the queue (Sync & Clean). */
  standaloneProgress: ModProgressEvent | null;

  setSnapshot: (snapshot: DownloadQueueSnapshot) => void;
  applyProgress: (progress: ModProgressEvent) => void;
  setPanelOpen: (open: boolean) => void;
  dismissOverlay: () => void;

  pause: (id: number) => Promise<void>;
  resume: (id: number) => Promise<void>;
  cancel: (id: number) => Promise<void>;
  retry: (id: number) => Promise<void>;
  reinstall: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  pauseAll: () => Promise<void>;
  resumeAll: () => Promise<void>;
  cancelAll: () => Promise<void>;
  clearFinished: () => Promise<void>;
}

async function run(action: () => Promise<DownloadQueueSnapshot>, failure: string) {
  try {
    const snapshot = await action();
    useDownloadStore.getState().setSnapshot(snapshot);
  } catch (error) {
    toast.add({ type: "error", title: `${failure}: ${String(error)}` });
  }
}

export const useDownloadStore = create<DownloadStore>((set) => ({
  paused: false,
  items: [],
  panelOpen: false,
  overlayDismissed: false,
  standaloneProgress: null,

  setSnapshot: (snapshot) =>
    set((state) => {
      const hadPending = state.items.some((item) => isDownloadPending(item.status));
      const hasPending = snapshot.items.some((item) => isDownloadPending(item.status));
      return {
        paused: snapshot.paused,
        items: snapshot.items,
        // A new batch of downloads re-surfaces the status card.
        overlayDismissed: hasPending && !hadPending ? false : state.overlayDismissed,
        // Queue activity takes over the overlay; standalone progress is stale then.
        standaloneProgress: snapshot.items.some(
          (item) => item.status === "downloading" || item.status === "installing",
        )
          ? null
          : state.standaloneProgress,
      };
    }),

  applyProgress: (progress) =>
    set((state) => {
      // Only queue events carry an item id; anything else (Sync & Clean) is
      // tracked separately.
      const index =
        progress.item_id == null
          ? -1
          : state.items.findIndex((item) => item.id === progress.item_id);
      if (index === -1 || !isDownloadPending(state.items[index].status)) {
        return {
          standaloneProgress:
            progress.item_id != null || progress.stage === "done" || progress.stage === "error"
              ? null
              : progress,
        };
      }
      const item = state.items[index];
      const items = [...state.items];
      items[index] = {
        ...item,
        message: progress.message || item.message,
        current: progress.current || item.current,
        total: progress.total || item.total,
        bytes_downloaded: progress.bytes_downloaded || item.bytes_downloaded,
        bytes_total: progress.bytes_total ?? item.bytes_total,
      };
      return { items };
    }),

  setPanelOpen: (panelOpen) => set({ panelOpen }),
  dismissOverlay: () => set({ overlayDismissed: true }),

  pause: (id) => run(() => tauri.pauseDownload(id), "Could not pause download"),
  resume: (id) => run(() => tauri.resumeDownload(id), "Could not resume download"),
  cancel: (id) => run(() => tauri.cancelDownload(id), "Could not cancel download"),
  retry: (id) => run(() => tauri.retryDownload(id), "Could not retry download"),
  reinstall: (id) => run(() => tauri.reinstallDownload(id), "Could not reinstall mod"),
  remove: (id) => run(() => tauri.removeDownload(id), "Could not remove download"),
  pauseAll: () => run(tauri.pauseAllDownloads, "Could not pause downloads"),
  resumeAll: () => run(tauri.resumeAllDownloads, "Could not resume downloads"),
  cancelAll: () => run(tauri.cancelAllDownloads, "Could not cancel downloads"),
  clearFinished: () => run(tauri.clearFinishedDownloads, "Could not clear downloads"),
}));

/**
 * The item the bottom status card should describe: whatever is running, or
 * failing that, the next thing the queue will do. Keeps the card mounted for
 * the whole batch instead of flashing between items.
 */
export function selectOverlayItem(items: DownloadItem[]): DownloadItem | null {
  return (
    items.find((item) => item.status === "downloading" || item.status === "installing") ??
    items.find(
      (item) => item.status === "waiting_for_game" || item.status === "waiting_for_network",
    ) ??
    items.find((item) => item.status === "paused") ??
    items.find((item) => item.status === "queued") ??
    null
  );
}

/** Number of items that still need work. */
export function usePendingDownloadCount(): number {
  return useDownloadStore(
    (state) => state.items.filter((item) => isDownloadPending(item.status)).length,
  );
}

export type DownloadIndicator =
  | "idle"
  | "active"
  | "paused"
  | "waiting_for_game"
  | "waiting_for_network";

/**
 * Coarse queue state for chrome that only needs an icon. Returns a string so
 * byte-progress updates do not re-render the frame around them.
 */
export function useDownloadIndicator(): DownloadIndicator {
  return useDownloadStore((state) => {
    if (state.items.some((item) => item.status === "downloading" || item.status === "installing")) {
      return "active";
    }
    const waiting = state.items.find(
      (item) => item.status === "waiting_for_game" || item.status === "waiting_for_network",
    );
    if (waiting) {
      return waiting.status === "waiting_for_game" ? "waiting_for_game" : "waiting_for_network";
    }
    if (state.paused && state.items.some((item) => isDownloadPending(item.status))) {
      return "paused";
    }
    return "idle";
  });
}

/**
 * Pending queue status for one mod, or null when it is not queued. Returns a
 * primitive so live byte updates do not re-render package cards.
 */
export function useQueuedStatus(fullName: string): DownloadStatus | null {
  return useDownloadStore((state) => {
    const item = state.items.find(
      (candidate) => candidate.full_name === fullName && isDownloadPending(candidate.status),
    );
    return item?.status ?? null;
  });
}

/** Version queued for one mod, if any. */
export function useQueuedVersion(fullName: string): string | null {
  return useDownloadStore((state) => {
    const item = state.items.find(
      (candidate) => candidate.full_name === fullName && isDownloadPending(candidate.status),
    );
    return item?.version ?? null;
  });
}
