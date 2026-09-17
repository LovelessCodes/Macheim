import { create } from "zustand";

import type {
  ThunderstorePackage,
  SortOption,
  SortDirection,
  PackageSourceFilter,
} from "../lib/types";

interface ModState {
  searchQuery: string;
  selectedCategories: string[];
  selectedSource: PackageSourceFilter;
  sortBy: SortOption;
  sortDirection: SortDirection;
  selectedPackage: ThunderstorePackage | null;

  setSearchQuery: (query: string) => void;
  setSelectedCategories: (categories: string[]) => void;
  setSelectedSource: (source: PackageSourceFilter) => void;
  setSortBy: (sort: SortOption) => void;
  setSortDirection: (dir: SortDirection) => void;
  setSelectedPackage: (pkg: ThunderstorePackage | null) => void;
}

export const useModStore = create<ModState>((set) => ({
  searchQuery: "",
  selectedCategories: [],
  selectedSource: "all",
  sortBy: "downloads",
  sortDirection: "desc",
  selectedPackage: null,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCategories: (categories) => set({ selectedCategories: categories }),
  setSelectedSource: (source) => set({ selectedSource: source }),
  setSortBy: (sort) => set({ sortBy: sort }),
  setSortDirection: (dir) => set({ sortDirection: dir }),
  setSelectedPackage: (pkg) => set({ selectedPackage: pkg }),
}));
