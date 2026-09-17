import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

import { toast } from "../components/ui/toast";

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "up-to-date"
  | "error";

const NOTIFIED_VERSION_KEY = "macheim:update-notified-version";

/** Pending `Update` resource from the last check; reused when installing. */
let pending: Update | null = null;

function firstMeaningfulLine(notes: string | undefined): string | undefined {
  return notes
    ?.split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

interface UpdaterState {
  status: UpdaterStatus;
  version: string | null;
  notes: string | null;
  progress: number | null;
  error: string | null;
  check: (options?: { announce?: boolean }) => Promise<void>;
  install: () => Promise<void>;
  restart: () => Promise<void>;
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  status: "idle",
  version: null,
  notes: null,
  progress: null,
  error: null,

  check: async ({ announce = false } = {}) => {
    const { status } = get();
    if (status === "checking" || status === "downloading" || status === "ready") return;

    set({ status: "checking", error: null });
    try {
      const update = await check();
      if (pending) void pending.close().catch(() => {});
      pending = update;

      if (!update) {
        set({ status: "up-to-date", version: null, notes: null, progress: null });
        if (announce) toast.add({ type: "success", title: "Macheim is up to date." });
        return;
      }

      const version = update.version;
      set({ status: "available", version, notes: update.body ?? null, progress: null });

      // Quiet checks notify once per version so a skipped update does not nag.
      if (announce || localStorage.getItem(NOTIFIED_VERSION_KEY) !== version) {
        localStorage.setItem(NOTIFIED_VERSION_KEY, version);
        toast.add({
          type: "info",
          title: `Macheim ${version} is available`,
          description: firstMeaningfulLine(update.body) ?? "A new version is ready to install.",
          timeout: 15000,
          actionProps: { children: "Update", onClick: () => void get().install() },
        });
      }
    } catch (err) {
      set({ status: "error", error: String(err) });
      if (announce) toast.add({ type: "error", title: `Update check failed: ${String(err)}` });
    }
  },

  install: async () => {
    const update = pending;
    if (!update || get().status === "downloading") return;

    set({ status: "downloading", progress: null, error: null });
    let downloaded = 0;
    let total: number | undefined;

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength;
          downloaded = 0;
          set({ progress: total ? 0 : null });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          set({ progress: total ? Math.min(downloaded / total, 1) : null });
        } else {
          set({ progress: 1 });
        }
      });

      pending = null;
      set({ status: "ready", progress: 1 });
      toast.add({
        type: "success",
        title: `Macheim ${update.version} is ready`,
        description: "Restart to finish updating. Your mods and profiles are untouched.",
        timeout: 0,
        actionProps: { children: "Restart now", onClick: () => void get().restart() },
      });
    } catch (err) {
      set({ status: "error", error: String(err), progress: null });
      toast.add({ type: "error", title: `Update failed: ${String(err)}` });
    }
  },

  restart: async () => {
    await relaunch();
  },
}));
