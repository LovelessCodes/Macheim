import { create } from "zustand";

import type { Page, GameStatus } from "../lib/types";

interface AppState {
  currentPage: Page;
  gameStatus: GameStatus | null;
  isLoading: boolean;
  isInitialized: boolean;

  setCurrentPage: (page: Page) => void;
  setGameStatus: (status: GameStatus) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: "browse",
  gameStatus: null,
  isLoading: false,
  isInitialized: false,

  setCurrentPage: (page) => set({ currentPage: page }),

  setGameStatus: (status) => set({ gameStatus: status }),

  setLoading: (loading) => set({ isLoading: loading }),

  setInitialized: (initialized) => set({ isInitialized: initialized }),
}));
