import { create } from "zustand";

import { sortPackages } from "../lib/packages";
import type { ThunderstorePackage, InstalledMod, SortOption, SortDirection } from "../lib/types";

interface ModState {
  packages: ThunderstorePackage[];
  installedMods: InstalledMod[];
  searchQuery: string;
  sortBy: SortOption;
  sortDirection: SortDirection;
  isLoadingPackages: boolean;
  isLoadingInstalled: boolean;
  isInstallingMod: string | null;
  selectedPackage: ThunderstorePackage | null;

  setPackages: (packages: ThunderstorePackage[]) => void;
  setInstalledMods: (mods: InstalledMod[]) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: SortOption) => void;
  setSortDirection: (dir: SortDirection) => void;
  setLoadingPackages: (loading: boolean) => void;
  setLoadingInstalled: (loading: boolean) => void;
  setInstallingMod: (fullName: string | null) => void;
  setSelectedPackage: (pkg: ThunderstorePackage | null) => void;

  getFilteredPackages: () => ThunderstorePackage[];
}

export const useModStore = create<ModState>((set, get) => ({
  packages: [],
  installedMods: [],
  searchQuery: "",
  sortBy: "downloads",
  sortDirection: "desc",
  isLoadingPackages: false,
  isLoadingInstalled: false,
  isInstallingMod: null,
  selectedPackage: null,

  setPackages: (packages) => set({ packages }),
  setInstalledMods: (mods) => set({ installedMods: mods }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortBy: (sort) => set({ sortBy: sort }),
  setSortDirection: (dir) => set({ sortDirection: dir }),
  setLoadingPackages: (loading) => set({ isLoadingPackages: loading }),
  setLoadingInstalled: (loading) => set({ isLoadingInstalled: loading }),
  setInstallingMod: (fullName) => set({ isInstallingMod: fullName }),
  setSelectedPackage: (pkg) => set({ selectedPackage: pkg }),

  getFilteredPackages: () => {
    const { packages, searchQuery, sortBy, sortDirection } = get();

    let filtered = packages.filter((pkg) => !pkg.is_deprecated);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (pkg) =>
          pkg.name.toLowerCase().includes(q) ||
          pkg.full_name.toLowerCase().includes(q) ||
          pkg.owner.toLowerCase().includes(q) ||
          (pkg.description ?? "").toLowerCase().includes(q),
      );
    }

    return sortPackages(filtered, sortBy, sortDirection);
  },
}));
