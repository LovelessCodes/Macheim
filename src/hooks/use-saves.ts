import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notify } from "../components/ui/toast";
import { savesQueryKey } from "../lib/query-keys";
import {
  createSaveSnapshot,
  deleteSaveSnapshot,
  getSaveOverview,
  restoreSaveSnapshot,
} from "../lib/tauri";

export function useSaveOverview() {
  return useQuery({
    queryKey: savesQueryKey,
    queryFn: getSaveOverview,
    staleTime: 15_000,
  });
}

export function useCreateSaveSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (label?: string) => createSaveSnapshot(label),
    onSuccess: (overview) => {
      queryClient.setQueryData(savesQueryKey, overview);
      notify("snapshot-create", { type: "success", title: "Save snapshot created" });
    },
    onError: (error) => {
      notify("snapshot-create", { type: "error", title: `Could not create snapshot: ${error}` });
    },
  });
}

export function useRestoreSaveSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreSaveSnapshot(id),
    onSuccess: (overview) => {
      queryClient.setQueryData(savesQueryKey, overview);
      notify("snapshot-restore", {
        type: "success",
        title: "Saves restored",
        description: "The previous state was kept as a safety snapshot.",
      });
    },
    onError: (error) => {
      notify("snapshot-restore", { type: "error", title: `Could not restore snapshot: ${error}` });
    },
  });
}

export function useDeleteSaveSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSaveSnapshot(id),
    onSuccess: (overview) => {
      queryClient.setQueryData(savesQueryKey, overview);
      notify("snapshot-delete", { type: "info", title: "Snapshot deleted" });
    },
    onError: (error) => {
      notify("snapshot-delete", { type: "error", title: `Could not delete snapshot: ${error}` });
    },
  });
}
