import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "../components/ui/toast";
import {
  gameStatusQueryKey,
  installedModsQueryKey,
  modConflictsQueryKey,
  profilesQueryKey,
} from "../lib/query-keys";
import {
  createProfile,
  deleteProfile,
  getActiveProfile,
  getGameStatus,
  listProfiles,
  switchProfile,
} from "../lib/tauri";

export function useProfiles() {
  return useQuery({
    queryKey: profilesQueryKey,
    queryFn: async () => {
      const [profiles, activeProfile] = await Promise.all([listProfiles(), getActiveProfile()]);
      return { profiles, activeProfile };
    },
  });
}

export function useSwitchProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: switchProfile,
    onSuccess: async (_data, name) => {
      queryClient.setQueryData(gameStatusQueryKey, await getGameStatus());
      await queryClient.invalidateQueries({ queryKey: installedModsQueryKey });
      await queryClient.invalidateQueries({ queryKey: modConflictsQueryKey });
      await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
      toast.add({ type: "success", title: `Switched to profile "${name}"` });
    },
    onError: (err) => {
      toast.add({ type: "error", title: `Failed to switch profile: ${err}` });
    },
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProfile,
    onSuccess: async (_profile, name) => {
      await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
      toast.add({ type: "success", title: `Created profile "${name}"` });
    },
    onError: (err) => {
      toast.add({ type: "error", title: `Failed to create profile: ${err}` });
    },
  });
}

export function useDeleteProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProfile,
    onSuccess: async (_data, name) => {
      await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
      toast.add({
        type: "info",
        title: `Removed "${name}". Recoverable from the deleted-profiles data folder.`,
      });
    },
    onError: (err) => {
      toast.add({ type: "error", title: `Failed to delete profile: ${err}` });
    },
  });
}
