import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notify } from "../components/ui/toast";
import { compatibilityQueryKey } from "../lib/query-keys";
import { applyCompatibility, getCompatibility } from "../lib/tauri";
import type { CompatibilitySettings } from "../lib/types";

export const compatibilityQueryOptions = queryOptions({
  queryKey: compatibilityQueryKey,
  queryFn: () => getCompatibility(),
});

export function useCompatibility() {
  return useQuery(compatibilityQueryOptions);
}

export function useApplyCompatibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      profileName,
      settings,
    }: {
      profileName: string;
      settings: CompatibilitySettings;
    }) => applyCompatibility(profileName, settings),
    onSuccess: (status) => {
      queryClient.setQueryData(compatibilityQueryKey, status);
      notify("compatibility", {
        type: "success",
        title: "Compatibility settings saved for the next game launch.",
      });
    },
  });
}
