import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notify } from "../components/ui/toast";
import {
  installedModsQueryKey,
  modConflictsQueryKey,
  profilesQueryKey,
  subscriptionsQueryKey,
  syncPlanQueryKey,
} from "../lib/query-keys";
import {
  completeSubscriptionSync,
  getSyncPlan,
  listSubscriptions,
  subscribeProfile,
  unsubscribeProfile,
} from "../lib/tauri";

/** Every profile linked to a published modpack. */
export function useSubscriptions() {
  return useQuery({
    queryKey: subscriptionsQueryKey,
    queryFn: listSubscriptions,
  });
}

export function useSubscribeToModpack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ profile, modpack }: { profile: string; modpack: string }) =>
      subscribeProfile(profile, modpack),
    onSuccess: async (subscription) => {
      await queryClient.invalidateQueries({ queryKey: subscriptionsQueryKey });
      await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
      notify("modpack-subscribe", {
        type: "success",
        title: `Following ${subscription.modpack} v${subscription.version}`,
        description: "Use Sync on the profile to install the pack's mods.",
      });
    },
    onError: (err) => {
      notify("modpack-subscribe", {
        type: "error",
        title: `Could not follow the modpack: ${err}`,
      });
    },
  });
}

export function useUnsubscribeModpack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unsubscribeProfile,
    onSuccess: async (_data, profile) => {
      await queryClient.invalidateQueries({ queryKey: subscriptionsQueryKey });
      await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
      notify("modpack-unsubscribe", {
        type: "info",
        title: `"${profile}" no longer follows a modpack`,
        description: "Its mods are untouched.",
      });
    },
    onError: (err) => {
      notify("modpack-unsubscribe", {
        type: "error",
        title: `Could not unlink the modpack: ${err}`,
      });
    },
  });
}

/** The diff between a profile and its pack's latest version. */
export function useSyncPlan(profile: string, enabled: boolean) {
  return useQuery({
    queryKey: syncPlanQueryKey(profile),
    queryFn: () => getSyncPlan(profile),
    enabled,
  });
}

/**
 * Record a completed sync. No toasts: the sync sheet reports one aggregate
 * result for the whole operation.
 */
export function useCompleteSubscriptionSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      profile,
      version,
      mods,
    }: {
      profile: string;
      version: string;
      mods: string[];
    }) => completeSubscriptionSync(profile, version, mods),
    onSuccess: async (_subscription, variables) => {
      await queryClient.invalidateQueries({ queryKey: subscriptionsQueryKey });
      await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
      await queryClient.invalidateQueries({ queryKey: syncPlanQueryKey(variables.profile) });
      await queryClient.invalidateQueries({ queryKey: installedModsQueryKey });
      await queryClient.invalidateQueries({ queryKey: modConflictsQueryKey });
    },
  });
}
