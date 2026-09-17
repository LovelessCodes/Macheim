import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "../components/ui/toast";
import { backupsQueryKey, profilesQueryKey } from "../lib/query-keys";
import { createBackup, listBackups, restoreBackup } from "../lib/tauri";

export function useBackups(enabled: boolean) {
  return useQuery({
    queryKey: backupsQueryKey,
    queryFn: listBackups,
    enabled,
    meta: { errorTitle: "Could not load backups" },
  });
}

export function useCreateBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createBackup,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: backupsQueryKey });
      toast.add({ type: "success", title: "Backup created." });
    },
    onError: (err) => {
      toast.add({ type: "error", title: `Backup failed: ${err}` });
    },
  });
}

export function useRestoreBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreBackup,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
      toast.add({ type: "success", title: "Backup restored." });
    },
    onError: (err) => {
      toast.add({ type: "error", title: `Restore failed: ${err}` });
    },
  });
}
