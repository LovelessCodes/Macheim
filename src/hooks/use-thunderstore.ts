import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notify } from "../components/ui/toast";
import { thunderstoreAuthQueryKey } from "../lib/query-keys";
import {
  publishModpack,
  thunderstoreAuthStatus,
  thunderstoreSignIn,
  thunderstoreSignOut,
} from "../lib/tauri";
import type { ModpackMetadata, ThunderstoreAuthStatus } from "../lib/types";

const SIGNED_OUT: ThunderstoreAuthStatus = { signed_in: false, username: null, teams: [] };

/** The saved Thunderstore sign-in, re-validated against the API. */
export function useThunderstoreAuth() {
  return useQuery({
    queryKey: thunderstoreAuthQueryKey,
    queryFn: thunderstoreAuthStatus,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useThunderstoreSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => thunderstoreSignIn(token),
    onSuccess: (status) => {
      queryClient.setQueryData(thunderstoreAuthQueryKey, status);
      notify("thunderstore-sign-in", {
        type: "success",
        title: `Signed in${status.username ? ` as ${status.username}` : ""}`,
      });
    },
    onError: (error) => {
      notify("thunderstore-sign-in", {
        type: "error",
        title: `Sign-in failed: ${error}`,
      });
    },
  });
}

export function useThunderstoreSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: thunderstoreSignOut,
    onSuccess: () => {
      queryClient.setQueryData(thunderstoreAuthQueryKey, SIGNED_OUT);
      notify("thunderstore-sign-out", { type: "info", title: "Signed out of Thunderstore" });
    },
    onError: (error) => {
      notify("thunderstore-sign-out", {
        type: "error",
        title: `Could not sign out: ${error}`,
      });
    },
  });
}

/** Publish a profile's modpack; progress arrives as `modpack-publish` events. */
export function usePublishModpack() {
  return useMutation({
    mutationFn: (input: {
      profileName: string;
      metadata: ModpackMetadata;
      iconPath: string | null;
      team: string;
      hasNsfwContent: boolean;
    }) => publishModpack(input),
  });
}
