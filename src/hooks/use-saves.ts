import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "../components/ui/toast";
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
      toast.add({ type: "success", title: "Save snapshot created" });
    },
    onError: (error) => {
      toast.add({ type: "error", title: `Could not create snapshot: ${error}` });
    },
  });
}

export function useRestoreSaveSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreSaveSnapshot(id),
    onSuccess: (overview) => {
      queryClient.setQueryData(savesQueryKey, overview);
      toast.add({
        type: "success",
        title: "Saves restored",
        description: "The previous state was kept as a safety snapshot.",
      });
    },
    onError: (error) => {
      toast.add({ type: "error", title: `Could not restore snapshot: ${error}` });
    },
  });
}

export function useDeleteSaveSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSaveSnapshot(id),
    onSuccess: (overview) => {
      queryClient.setQueryData(savesQueryKey, overview);
      toast.add({ type: "info", title: "Snapshot deleted" });
    },
    onError: (error) => {
      toast.add({ type: "error", title: `Could not delete snapshot: ${error}` });
    },
  });
}
