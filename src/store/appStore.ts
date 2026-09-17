import { create } from "zustand";

import type { Page } from "../lib/types";

interface AppState {
  currentPage: Page;

  setCurrentPage: (page: Page) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: "browse",

  setCurrentPage: (page) => set({ currentPage: page }),
}));
