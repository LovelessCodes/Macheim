import { useMutation, useQueryClient } from "@tanstack/react-query";

import { notify } from "../components/ui/toast";
import { installedModsQueryKey, modConflictsQueryKey } from "../lib/query-keys";
import { toggleMod } from "../lib/tauri";
import type { InstalledMod } from "../lib/types";

export function useModToggle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fullName, enable }: { fullName: string; enable: boolean }) =>
      toggleMod(fullName, enable),
    onSuccess: (_data, { fullName, enable }) => {
      queryClient.setQueryData<InstalledMod[]>(installedModsQueryKey, (prev) =>
        prev?.map((m) => (m.full_name === fullName ? { ...m, enabled: enable } : m)),
      );
      void queryClient.invalidateQueries({ queryKey: modConflictsQueryKey });
    },
    onError: (err) => {
      notify("mod-toggle", { type: "error", title: `Failed to toggle mod: ${err}` });
    },
  });
}
