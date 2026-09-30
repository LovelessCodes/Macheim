import { queryOptions, useQuery } from "@tanstack/react-query";

import { installedModsQueryKey } from "../lib/query-keys";
import { getInstalledMods } from "../lib/tauri";

export const installedModsQueryOptions = queryOptions({
  queryKey: installedModsQueryKey,
  queryFn: () => getInstalledMods(),
  meta: { errorTitle: "Failed to load installed mods" },
});

export function useInstalledMods() {
  return useQuery(installedModsQueryOptions);
}
