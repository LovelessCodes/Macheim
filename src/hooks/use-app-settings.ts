import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "../components/ui/toast";
import { appSettingsQueryKey } from "../lib/query-keys";
import { getAppSettings, setConsoleEnabled } from "../lib/tauri";
import type { AppSettings } from "../lib/types";

export function useAppSettings() {
  return useQuery({
    queryKey: appSettingsQueryKey,
    queryFn: getAppSettings,
    staleTime: Infinity,
  });
}

/** Toggle `-console` for modded launches, with an optimistic switch. */
export function useSetConsoleEnabled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (enabled: boolean) => setConsoleEnabled(enabled),
    onMutate: (enabled) => {
      const previous = queryClient.getQueryData<AppSettings>(appSettingsQueryKey);
      queryClient.setQueryData<AppSettings>(appSettingsQueryKey, (current) =>
        current ? { ...current, console_enabled: enabled } : current,
      );
      return { previous };
    },
    onError: (error, _enabled, context) => {
      if (context?.previous) {
        queryClient.setQueryData(appSettingsQueryKey, context.previous);
      }
      toast.add({ type: "error", title: `Could not update launch setting: ${error}` });
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(appSettingsQueryKey, settings);
    },
  });
}
