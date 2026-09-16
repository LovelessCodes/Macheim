import { create } from "zustand";

import type { ThunderstorePackage, SortOption, SortDirection } from "../lib/types";

interface ModState {
  searchQuery: string;
  selectedCategories: string[];
  sortBy: SortOption;
  sortDirection: SortDirection;
  isInstallingMod: string | null;
  selectedPackage: ThunderstorePackage | null;

  setSearchQuery: (query: string) => void;
  setSelectedCategories: (categories: string[]) => void;
  setSortBy: (sort: SortOption) => void;
  setSortDirection: (dir: SortDirection) => void;
  setInstallingMod: (fullName: string | null) => void;
  setSelectedPackage: (pkg: ThunderstorePackage | null) => void;
}

export const useModStore = create<ModState>((set) => ({
  searchQuery: "",
  selectedCategories: [],
  sortBy: "downloads",
  sortDirection: "desc",
  isInstallingMod: null,
  selectedPackage: null,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCategories: (categories) => set({ selectedCategories: categories }),
  setSortBy: (sort) => set({ sortBy: sort }),
  setSortDirection: (dir) => set({ sortDirection: dir }),
  setInstallingMod: (fullName) => set({ isInstallingMod: fullName }),
  setSelectedPackage: (pkg) => set({ selectedPackage: pkg }),
}));
