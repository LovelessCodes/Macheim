import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "../components/ui/toast";
import { configFilesQueryKey, configQueryKey } from "../lib/query-keys";
import { getConfig, getConfigFiles, saveConfig } from "../lib/tauri";
import type { ConfigFile } from "../lib/types";

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

export function useSaveConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: ConfigFile) => {
      await saveConfig(config);
      return config;
    },
    onSuccess: (config) => {
      queryClient.setQueryData(configQueryKey(config.path), config);
      toast.add({ type: "success", title: "Config saved." });
    },
    onError: (err) => {
      toast.add({ type: "error", title: `Failed to save config: ${err}` });
    },
  });
}
