import { useMutation, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

import { notify } from "../components/ui/toast";
import { installedModsQueryKey } from "../lib/query-keys";
import {
  analyzeCrashLogs,
  getLastCrashReport,
  getSafeMode,
  launchSafeMode,
  restoreSafeModeMods,
} from "../lib/tauri";
import type { CrashReport } from "../lib/types";
import { useDiagnosticsStore } from "../store/diagnosticsStore";

/**
 * Mirrors crash reports and safe mode into the store. Mount once near the
 * app root: the launch watcher emits `game-crash` after an early exit.
 */
export function useDiagnosticsSync() {
  useEffect(() => {
    let disposed = false;

    void getLastCrashReport()
      .then((report) => {
        if (!disposed && report) useDiagnosticsStore.getState().setReport(report);
      })
      .catch(() => {});
    void getSafeMode()
      .then((mods) => {
        if (!disposed) useDiagnosticsStore.getState().setSafeModeMods(mods);
      })
      .catch(() => {});

    const unlisten = listen<CrashReport>("game-crash", (event) => {
      const report = event.payload;
      const store = useDiagnosticsStore.getState();
      store.setReport(report);
      store.setReportOpen(true);
      notify("crash-report", {
        type: "warning",
        title: "Valheim exited unexpectedly",
        description:
          report.likely_culprits.length > 0
            ? `Likely culprit: ${report.likely_culprits[0].full_name}`
            : "Open the crash report for the log details.",
        timeout: 10000,
      });
    });

    return () => {
      disposed = true;
      void unlisten.then((fn) => fn());
    };
  }, []);
}

/** Analyze the latest log on demand (no crash required). */
export function useAnalyzeCrashLogs() {
  return useMutation({
    mutationFn: analyzeCrashLogs,
    onSuccess: (report) => {
      const store = useDiagnosticsStore.getState();
      store.setReport(report);
      store.setReportOpen(true);
      notify("crash-analyze", {
        type: report.likely_culprits.length > 0 ? "warning" : "info",
        title:
          report.likely_culprits.length > 0
            ? `Likely culprit: ${report.likely_culprits[0].full_name}`
            : "Log analyzed — no clear culprit found",
      });
    },
    onError: (error) => {
      notify("crash-analyze", { type: "error", title: `Could not analyze the log: ${error}` });
    },
  });
}

/** Disable every mod and launch, to prove whether mods are involved. */
export function useLaunchSafeMode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: launchSafeMode,
    onSuccess: async (disabled) => {
      useDiagnosticsStore.getState().setSafeModeMods(disabled);
      await queryClient.invalidateQueries({ queryKey: installedModsQueryKey });
      notify("safe-mode-launch", {
        type: "info",
        title: `Safe mode: ${disabled.length} mod${disabled.length === 1 ? "" : "s"} disabled`,
        description: "Valheim is launching without mods. Restore them from the banner afterwards.",
        timeout: 10000,
      });
    },
    onError: (error) => {
      notify("safe-mode-launch", { type: "error", title: `Safe mode launch failed: ${error}` });
    },
  });
}

/** Re-enable everything safe mode disabled. */
export function useRestoreSafeMode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreSafeModeMods,
    onSuccess: async (restored) => {
      useDiagnosticsStore.getState().setSafeModeMods([]);
      await queryClient.invalidateQueries({ queryKey: installedModsQueryKey });
      notify("safe-mode-restore", {
        type: "success",
        title: `Restored ${restored.length} mod${restored.length === 1 ? "" : "s"}`,
        description: "Safe mode is off.",
      });
    },
    onError: (error) => {
      notify("safe-mode-restore", { type: "error", title: `Could not restore mods: ${error}` });
    },
  });
}
