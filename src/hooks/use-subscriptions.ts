import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notify } from "../components/ui/toast";
import { profilesQueryKey, subscriptionsQueryKey } from "../lib/query-keys";
import { listSubscriptions, subscribeProfile, unsubscribeProfile } from "../lib/tauri";

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
