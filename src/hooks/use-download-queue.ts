import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";

import { notify, toast } from "../components/ui/toast";
import { installedModsQueryKey, modConflictsQueryKey } from "../lib/query-keys";
import { enqueueInstall, getDownloadQueue } from "../lib/tauri";
import type {
  DownloadItem,
  DownloadKind,
  DownloadQueueSnapshot,
  DownloadStatus,
  ModProgressEvent,
} from "../lib/types";
import { isDownloadPending } from "../lib/types";
import { useDownloadStore } from "../store/downloadStore";

/** Terminal outcomes share one upserted toast instead of stacking per item. */
const OUTCOME_TOAST_ID = "download-outcome";
/** One toast per waiting episode (Valheim open / offline). */
const WAITING_TOAST_ID = "download-waiting";
/** Enqueue confirmations replace each other instead of stacking. */
const ENQUEUE_TOAST_ID = "download-enqueue";

interface OutcomeBatch {
  completed: DownloadItem[];
  failed: DownloadItem[];
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function showOutcomeToast(batch: OutcomeBatch) {
  const completed = batch.completed.length;
  const failed = batch.failed.length;

  if (completed === 0 && failed === 0) return;

  if (completed === 1 && failed === 0) {
    const item = batch.completed[0];
    notify(OUTCOME_TOAST_ID, {
      type: "success",
      title: `Installed ${item.name}${item.version ? ` v${item.version}` : ""}`,
    });
    return;
  }

  if (completed === 0 && failed === 1) {
    const item = batch.failed[0];
    notify(OUTCOME_TOAST_ID, {
      type: "error",
      title: `Failed to install ${item.name}`,
      description: item.error ?? undefined,
      timeout: 8000,
    });
    return;
  }

  const parts: string[] = [];
  if (completed > 0) parts.push(`installed ${completed} mod${plural(completed)}`);
  if (failed > 0) parts.push(`${failed} failed`);
  notify(OUTCOME_TOAST_ID, {
    type: failed > 0 ? "warning" : "success",
    title: parts.join(", ").replace(/^./, (c) => c.toUpperCase()),
    description: failed > 0 ? `First failure: ${batch.failed[0].name} — see Downloads.` : undefined,
    timeout: 5000,
  });
}

function showWaitingToast(waitingGame: number, waitingNetwork: number) {
  if (waitingNetwork > 0) {
    notify(WAITING_TOAST_ID, {
      type: "warning",
      title: "No connection — retrying automatically",
      description: `${waitingNetwork} install${plural(waitingNetwork)} waiting`,
      timeout: 8000,
    });
    return;
  }
  notify(WAITING_TOAST_ID, {
    type: "info",
    title: "Waiting for Valheim to close",
    description: `${waitingGame} install${plural(waitingGame)} queued`,
  });
}

/**
 * Mirror the backend install queue into the store. Status changes are
 * aggregated into long-lived toasts, so batch installs do not spam the
 * screen with one notification per item.
 */
export function useDownloadQueueSync() {
  const queryClient = useQueryClient();
  const seenStatuses = useRef(new Map<number, DownloadStatus>());
  const outcomes = useRef<OutcomeBatch>({ completed: [], failed: [] });
  const waitingSignatures = useRef({ game: "", network: "" });
  const initialized = useRef(false);

  useEffect(() => {
    let disposed = false;

    const apply = (snapshot: DownloadQueueSnapshot) => {
      if (disposed) return;
      useDownloadStore.getState().setSnapshot(snapshot);

      const firstSnapshot = !initialized.current;
      initialized.current = true;

      let hasNewOutcomes = false;
      for (const item of snapshot.items) {
        const before = seenStatuses.current.get(item.id);
        seenStatuses.current.set(item.id, item.status);
        if (firstSnapshot || before === item.status) continue;

        if (item.status === "completed") {
          outcomes.current.completed.push(item);
          hasNewOutcomes = true;
        } else if (item.status === "failed") {
          outcomes.current.failed.push(item);
          hasNewOutcomes = true;
        }
      }

      if (hasNewOutcomes) {
        showOutcomeToast(outcomes.current);
        void queryClient.invalidateQueries({ queryKey: installedModsQueryKey });
        void queryClient.invalidateQueries({ queryKey: modConflictsQueryKey });
      }

      // Start a fresh tally once the queue drains, so the next batch reports
      // its own numbers.
      if (!snapshot.items.some((item) => isDownloadPending(item.status))) {
        outcomes.current = { completed: [], failed: [] };
      }

      // Waiting is a queue-wide condition: notify once per episode, with a
      // count, instead of once per item. Network episodes track every item
      // that has failed at least once (even while it sleeps between retries)
      // so repeated backoff cycles do not re-alert.
      const gameIds = snapshot.items
        .filter((item) => item.status === "waiting_for_game")
        .map((item) => item.id)
        .sort((a, b) => a - b)
        .join(",");
      const networkIds = snapshot.items
        .filter((item) => item.retry_count > 0 && isDownloadPending(item.status))
        .map((item) => item.id)
        .sort((a, b) => a - b)
        .join(",");
      const waitingGame = gameIds ? gameIds.split(",").length : 0;
      const waitingNetwork = snapshot.items.filter(
        (item) => item.status === "waiting_for_network",
      ).length;
      const previous = waitingSignatures.current;
      const waitingChanged = gameIds !== previous.game || networkIds !== previous.network;
      waitingSignatures.current = { game: gameIds, network: networkIds };

      if (!firstSnapshot && waitingChanged) {
        if (waitingNetwork > 0 || waitingGame > 0) {
          showWaitingToast(waitingGame, waitingNetwork);
        } else if (previous.game || previous.network) {
          toast.close(WAITING_TOAST_ID);
        }
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
        notify(ENQUEUE_TOAST_ID, {
          type: "info",
          title: `${target.name} is already queued`,
        });
      } else {
        notify(ENQUEUE_TOAST_ID, {
          type: "success",
          title: `Queued ${target.name}${target.version ? ` v${target.version}` : ""}`,
          description: "Track or cancel it from Downloads.",
        });
      }
    }
    return item;
  }, []);
}
