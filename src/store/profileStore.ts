import { create } from "zustand";

import type { Profile } from "../lib/types";

interface ProfileState {
  profiles: Profile[];
  activeProfile: string;
  isLoading: boolean;

  setProfiles: (profiles: Profile[]) => void;
  setActiveProfile: (name: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profiles: [],
  activeProfile: "Default",
  isLoading: false,

  setProfiles: (profiles) => set({ profiles }),
  setActiveProfile: (name) => set({ activeProfile: name }),
  setLoading: (loading) => set({ isLoading: loading }),
}));
