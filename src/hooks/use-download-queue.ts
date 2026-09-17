import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";

import { toast } from "../components/ui/toast";
import { installedModsQueryKey } from "../lib/query-keys";
import { enqueueInstall, getDownloadQueue } from "../lib/tauri";
import type {
  DownloadKind,
  DownloadQueueSnapshot,
  DownloadStatus,
  ModProgressEvent,
} from "../lib/types";
import { isDownloadPending } from "../lib/types";
import { useDownloadStore } from "../store/downloadStore";

/**
 * Mirror the backend install queue into the store, and turn status changes
 * into toasts and cache invalidations. Mount once, near the app root.
 */
export function useDownloadQueueSync() {
  const queryClient = useQueryClient();
  const seenStatuses = useRef(new Map<number, DownloadStatus>());
  const notifiedWaiting = useRef(new Set<string>());
  const initialized = useRef(false);

  useEffect(() => {
    let disposed = false;

    const apply = (snapshot: DownloadQueueSnapshot) => {
      if (disposed) return;
      useDownloadStore.getState().setSnapshot(snapshot);

      const firstSnapshot = !initialized.current;
      initialized.current = true;

      let installedChanged = false;
      for (const item of snapshot.items) {
        const before = seenStatuses.current.get(item.id);
        seenStatuses.current.set(item.id, item.status);
        if (firstSnapshot || before === item.status) continue;

        switch (item.status) {
          case "completed": {
            installedChanged = true;
            const dependencies = item.installed_count - 1;
            toast.add({
              type: "success",
              title:
                dependencies > 0
                  ? `Installed ${item.name} + ${dependencies} dependenc${dependencies === 1 ? "y" : "ies"}`
                  : item.installed_count === 0
                    ? `${item.name} is already up to date`
                    : `Installed ${item.name}${item.version ? ` v${item.version}` : ""}`,
            });
            break;
          }
          case "failed": {
            installedChanged = true;
            toast.add({
              type: "error",
              title: `Failed to install ${item.name}`,
              description: item.error ?? undefined,
            });
            break;
          }
          case "waiting_for_game": {
            const key = `${item.id}:game`;
            if (!notifiedWaiting.current.has(key)) {
              notifiedWaiting.current.add(key);
              toast.add({
                type: "info",
                title: `${item.name} is queued`,
                description: "The install starts once Valheim closes.",
              });
            }
            break;
          }
          case "waiting_for_network": {
            const key = `${item.id}:network`;
            if (!notifiedWaiting.current.has(key)) {
              notifiedWaiting.current.add(key);
              toast.add({
                type: "warning",
                title: `No connection — ${item.name} will retry automatically`,
                timeout: 8000,
              });
            }
            break;
          }
          default:
            break;
        }
      }

      if (installedChanged) {
        void queryClient.invalidateQueries({ queryKey: installedModsQueryKey });
      }
    };

    void getDownloadQueue()
      .then((snapshot) => apply(snapshot))
      .catch((error) => {
        console.error("Failed to load download queue", error);
      });

    const unlistenQueue = listen<DownloadQueueSnapshot>("download-queue-changed", (event) =>
      apply(event.payload),
    );
    const unlistenProgress = listen<ModProgressEvent>("mod-progress", (event) => {
      useDownloadStore.getState().applyProgress(event.payload);
    });

    return () => {
      disposed = true;
      void unlistenQueue.then((unlisten) => unlisten());
      void unlistenProgress.then((unlisten) => unlisten());
    };
  }, [queryClient]);
}

interface EnqueueTarget {
  fullName: string;
  name: string;
  version: string | null;
  kind?: DownloadKind;
}

interface EnqueueOptions {
  /** Skip per-item toasts (the caller reports an aggregate instead). */
  silent?: boolean;
}

/** Queue an install. Returns the queue item the backend created or refreshed. */
export function useEnqueueInstall() {
  return useCallback(async (target: EnqueueTarget, options: EnqueueOptions = {}) => {
    const existing = useDownloadStore
      .getState()
      .items.find((item) => item.full_name === target.fullName && isDownloadPending(item.status));
    const item = await enqueueInstall(
      target.fullName,
      target.name,
      target.version,
      target.kind ?? "mod",
    );
    if (!options.silent) {
      if (existing && existing.version === target.version) {
        toast.add({ type: "info", title: `${target.name} is already queued` });
      } else {
        toast.add({
          type: "success",
          title: `Queued ${target.name}${target.version ? ` v${target.version}` : ""}`,
          description: "Track, pause or cancel it from Downloads.",
        });
      }
    }
    return item;
  }, []);
}
