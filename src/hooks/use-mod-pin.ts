import { useMutation, useQueryClient } from "@tanstack/react-query";

import { notify } from "../components/ui/toast";
import { installedModsQueryKey, modConflictsQueryKey } from "../lib/query-keys";
import { setModPinned } from "../lib/tauri";
import type { InstalledMod } from "../lib/types";

/** Hold a mod at its installed version, or release it. */
export function useModPin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fullName, pinned }: { fullName: string; pinned: boolean }) =>
      setModPinned(fullName, pinned),
    onSuccess: (_data, { fullName, pinned }) => {
      queryClient.setQueryData<InstalledMod[]>(installedModsQueryKey, (prev) =>
        prev?.map((m) => (m.full_name === fullName ? { ...m, pinned } : m)),
      );
      void queryClient.invalidateQueries({ queryKey: modConflictsQueryKey });
    },
    onError: (err) => {
      notify("mod-pin", { type: "error", title: `Failed to update the pin: ${err}` });
    },
  });
}
