import { useQuery } from "@tanstack/react-query";

import { configFilesQueryKey, configQueryKey } from "../lib/query-keys";
import { getConfig, getConfigFiles } from "../lib/tauri";

export function useConfigFiles() {
  return useQuery({
    queryKey: configFilesQueryKey,
    queryFn: getConfigFiles,
  });
}

export function useConfig(path: string | null) {
  return useQuery({
    queryKey: configQueryKey(path ?? ""),
    queryFn: () => getConfig(path as string),
    enabled: path !== null,
    meta: { errorTitle: "Failed to load config" },
  });
}
