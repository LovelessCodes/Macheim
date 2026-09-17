import { useQuery } from "@tanstack/react-query";

import { installedModsQueryKey } from "../lib/query-keys";
import { getInstalledMods } from "../lib/tauri";

export function useInstalledMods() {
  return useQuery({
    queryKey: installedModsQueryKey,
    queryFn: getInstalledMods,
    meta: { errorTitle: "Failed to load installed mods" },
  });
}
