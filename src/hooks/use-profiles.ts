import { useQuery } from "@tanstack/react-query";

import { profilesQueryKey } from "../lib/query-keys";
import { getActiveProfile, listProfiles } from "../lib/tauri";

export function useProfiles() {
  return useQuery({
    queryKey: profilesQueryKey,
    queryFn: async () => {
      const [profiles, activeProfile] = await Promise.all([listProfiles(), getActiveProfile()]);
      return { profiles, activeProfile };
    },
  });
}
