import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "../components/ui/toast";
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
      toast.add({
        type: result.failed.length > 0 ? "warning" : "success",
        title: `Sync complete: ${msgs.join(", ") || "all up to date"}`,
      });
      await queryClient.refetchQueries({ queryKey: installedModsQueryKey });
      await queryClient.invalidateQueries({ queryKey: modConflictsQueryKey });
    },
    onError: (err) => {
      toast.add({ type: "error", title: `Sync failed: ${err}` });
    },
  });
}
