import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notify } from "../components/ui/toast";
import { appSettingsQueryKey } from "../lib/query-keys";
import {
  getAppSettings,
  setCdnPreference,
  setConsoleEnabled,
  setSnapshotSaves,
} from "../lib/tauri";
import type { AppSettings, CdnPreference } from "../lib/types";

export const appSettingsQueryOptions = queryOptions({
  queryKey: appSettingsQueryKey,
  queryFn: () => getAppSettings(),
  staleTime: Infinity,
});

export function useAppSettings() {
  return useQuery(appSettingsQueryOptions);
}

type BooleanSetting = "console_enabled" | "snapshot_saves";

function useSettingMutation<T>(
  mutationFn: (value: T) => Promise<AppSettings>,
  apply: (settings: AppSettings, value: T) => AppSettings,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onMutate: (value) => {
      const previous = queryClient.getQueryData<AppSettings>(appSettingsQueryKey);
      queryClient.setQueryData<AppSettings>(appSettingsQueryKey, (current) =>
        current ? apply(current, value) : current,
      );
      return { previous };
    },
    onError: (error, _value, context) => {
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

function useBooleanSetting(
  mutationFn: (enabled: boolean) => Promise<AppSettings>,
  field: BooleanSetting,
) {
  return useSettingMutation(mutationFn, (settings, enabled) => ({ ...settings, [field]: enabled }));
}

/** Toggle `-console` for modded launches, with an optimistic switch. */
export function useSetConsoleEnabled() {
  return useBooleanSetting(setConsoleEnabled, "console_enabled");
}

/** Toggle automatic save snapshots before modded launches. */
export function useSetSnapshotSaves() {
  return useBooleanSetting(setSnapshotSaves, "snapshot_saves");
}

/** Choose which Thunderstore CDN downloads start from. */
export function useSetCdnPreference() {
  return useSettingMutation<CdnPreference>(setCdnPreference, (settings, preference) => ({
    ...settings,
    cdn_preference: preference,
  }));
}
