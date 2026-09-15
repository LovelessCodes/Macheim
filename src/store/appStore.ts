import { create } from "zustand";

import type { Page, GameStatus, Toast } from "../lib/types";

interface AppState {
  currentPage: Page;
  gameStatus: GameStatus | null;
  isLoading: boolean;
  isInitialized: boolean;
  toasts: Toast[];

  setCurrentPage: (page: Page) => void;
  setGameStatus: (status: GameStatus) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useAppStore = create<AppState>((set) => ({
  currentPage: "browse",
  gameStatus: null,
  isLoading: false,
  isInitialized: false,
  toasts: [],

  setCurrentPage: (page) => set({ currentPage: page }),

  setGameStatus: (status) => set({ gameStatus: status }),

  setLoading: (loading) => set({ isLoading: loading }),

  setInitialized: (initialized) => set({ isInitialized: initialized }),

  addToast: (toast) => {
    const id = `toast-${++toastCounter}`;
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    const duration = toast.duration ?? 4000;
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
