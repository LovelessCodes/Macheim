import { create } from "zustand";

import type { CrashReport } from "../lib/types";

interface DiagnosticsStore {
  /** Latest crash report, from a watched crash or a manual analysis. */
  report: CrashReport | null;
  reportOpen: boolean;
  /** Mods currently disabled by safe mode. */
  safeModeMods: string[];

  setReport: (report: CrashReport | null) => void;
  setReportOpen: (open: boolean) => void;
  setSafeModeMods: (mods: string[]) => void;
}

export const useDiagnosticsStore = create<DiagnosticsStore>((set) => ({
  report: null,
  reportOpen: false,
  safeModeMods: [],
  setReport: (report) => set({ report }),
  setReportOpen: (reportOpen) => set({ reportOpen }),
  setSafeModeMods: (safeModeMods) => set({ safeModeMods }),
}));
