import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notify } from "../components/ui/toast";
import { appSettingsQueryKey } from "../lib/query-keys";
import { getAppSettings, setConsoleEnabled, setSnapshotSaves } from "../lib/tauri";
import type { AppSettings } from "../lib/types";

export function useAppSettings() {
  return useQuery({
    queryKey: appSettingsQueryKey,
    queryFn: getAppSettings,
    staleTime: Infinity,
  });
}

type BooleanSetting = "console_enabled" | "snapshot_saves";

function useBooleanSetting(
  mutationFn: (enabled: boolean) => Promise<AppSettings>,
  field: BooleanSetting,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onMutate: (enabled) => {
      const previous = queryClient.getQueryData<AppSettings>(appSettingsQueryKey);
      queryClient.setQueryData<AppSettings>(appSettingsQueryKey, (current) =>
        current ? { ...current, [field]: enabled } : current,
      );
      return { previous };
    },
    onError: (error, _enabled, context) => {
      if (context?.previous) {
        queryClient.setQueryData(appSettingsQueryKey, context.previous);
      }
      notify("app-setting", { type: "error", title: `Could not update setting: ${error}` });
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(appSettingsQueryKey, settings);
    },
  });
}

/** Toggle `-console` for modded launches, with an optimistic switch. */
export function useSetConsoleEnabled() {
  return useBooleanSetting(setConsoleEnabled, "console_enabled");
}

/** Toggle automatic save snapshots before modded launches. */
export function useSetSnapshotSaves() {
  return useBooleanSetting(setSnapshotSaves, "snapshot_saves");
}
