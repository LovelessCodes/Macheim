import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "../components/ui/toast";
import { compatibilityQueryKey } from "../lib/query-keys";
import { applyCompatibility, getCompatibility } from "../lib/tauri";
import type { CompatibilitySettings } from "../lib/types";

export function useCompatibility() {
  return useQuery({
    queryKey: compatibilityQueryKey,
    queryFn: getCompatibility,
  });
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
      toast.add({
        type: "success",
        title: "Compatibility settings saved for the next game launch.",
      });
    },
  });
}
