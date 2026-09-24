import { useMutation, useQueryClient } from "@tanstack/react-query";

import { notify } from "../components/ui/toast";
import { installedModsQueryKey, modConflictsQueryKey } from "../lib/query-keys";
import { syncMods } from "../lib/tauri";

export function useSyncMods() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      cleanUnmanaged,
      approvedUnmanaged,
    }: {
      cleanUnmanaged: boolean;
      approvedUnmanaged: string[];
    }) => syncMods(cleanUnmanaged, approvedUnmanaged),
    onSuccess: async (result) => {
      const msgs: string[] = [];
      if (result.reinstalled.length > 0) msgs.push(`${result.reinstalled.length} reinstalled`);
      if (result.cleaned.length > 0) msgs.push(`${result.cleaned.length} cleaned`);
      if (result.failed.length > 0) msgs.push(`${result.failed.length} failed`);
      notify("sync", {
        type: result.failed.length > 0 ? "warning" : "success",
        title: `Sync complete: ${msgs.join(", ") || "all up to date"}`,
      });
      await queryClient.refetchQueries({ queryKey: installedModsQueryKey });
      await queryClient.invalidateQueries({ queryKey: modConflictsQueryKey });
    },
    onError: (err) => {
      notify("sync", { type: "error", title: `Sync failed: ${err}` });
    },
  });
}
