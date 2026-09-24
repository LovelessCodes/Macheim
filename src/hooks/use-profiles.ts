import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirm, save } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";

import { toast } from "../components/ui/toast";
import {
  gameStatusQueryKey,
  installedModsQueryKey,
  modConflictsQueryKey,
  profilesQueryKey,
} from "../lib/query-keys";
import {
  cloneProfile,
  createProfile,
  deleteProfile,
  exportProfileFile,
  getActiveProfile,
  getGameStatus,
  importProfileCode,
  importProfileFile,
  listProfiles,
  switchProfile,
} from "../lib/tauri";
import type { Profile } from "../lib/types";
import { useEnqueueInstall } from "./use-download-queue";

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

export function useCloneProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sourceName, newName }: { sourceName: string; newName: string }) =>
      cloneProfile(sourceName, newName),
    onSuccess: async (profile) => {
      await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
      toast.add({ type: "success", title: `Cloned to "${profile.name}"` });
    },
    onError: (err) => {
      toast.add({ type: "error", title: `Failed to clone profile: ${err}` });
    },
  });
}

/** Export a profile as an r2modman-compatible `.r2z` file. */
export function useExportProfile() {
  return useMutation({
    mutationFn: async (name: string) => {
      const chosen = await save({
        defaultPath: `${name}.r2z`,
        filters: [{ name: "Mod profile", extensions: ["r2z"] }],
      });
      if (!chosen) return null;

      const path = chosen.toLowerCase().endsWith(".r2z") ? chosen : `${chosen}.r2z`;
      await exportProfileFile(name, path);
      return path;
    },
    onSuccess: (path) => {
      if (path) {
        toast.add({
          type: "success",
          title: "Profile exported",
          description:
            "Share the .r2z file — Macheim, r2modman, Gale and Thunderstore Mod Manager can import it.",
          timeout: 8000,
        });
      }
    },
    onError: (err) => {
      toast.add({ type: "error", title: `Failed to export profile: ${err}` });
    },
  });
}

export interface ImportProfileInput {
  kind: "file" | "code";
  /** File path or profile code, depending on `kind`. */
  value: string;
  newName?: string;
}

export function useImportProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ kind, value, newName }: ImportProfileInput): Promise<Profile> =>
      kind === "code" ? importProfileCode(value, newName) : importProfileFile(value, newName),
    onSuccess: async (profile) => {
      await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
      toast.add({
        type: "success",
        title: `Imported "${profile.name}"`,
        description: `${profile.mods.length} mod${profile.mods.length === 1 ? "" : "s"} in the profile.`,
      });
    },
    onError: (err) => {
      toast.add({
        type: "error",
        title: `Import failed: ${err}`,
        timeout: 8000,
      });
    },
  });
}

/**
 * Import a shared profile and offer to activate it: switching installs the
 * profile's config files, then every enabled mod is queued for download.
 * Returns the imported profile, or null when the import failed.
 */
export function useImportSharedProfile() {
  const { mutateAsync: importProfile, isPending } = useImportProfile();
  const { mutateAsync: switchProfileAsync } = useSwitchProfile();
  const enqueueInstall = useEnqueueInstall();

  const importShared = useCallback(
    async (input: ImportProfileInput): Promise<Profile | null> => {
      let profile: Profile;
      try {
        profile = await importProfile(input);
      } catch {
        return null;
      }

      const enabled = profile.mods.filter((mod) => mod.enabled);
      if (enabled.length === 0) return profile;

      const activate = await confirm(
        `Switch to "${profile.name}" and download its ${enabled.length} mod${
          enabled.length === 1 ? "" : "s"
        } now?`,
        { title: "Profile imported", kind: "info" },
      );
      if (!activate) return profile;

      try {
        await switchProfileAsync(profile.name);
      } catch {
        return profile;
      }

      try {
        for (const mod of enabled) {
          await enqueueInstall(
            { fullName: mod.full_name, name: mod.name, version: mod.version, kind: "mod" },
            { silent: true },
          );
        }
        toast.add({
          type: "success",
          title: `Queued ${enabled.length} download${enabled.length === 1 ? "" : "s"}`,
          description: "Track progress from Downloads.",
        });
      } catch (err) {
        toast.add({
          type: "error",
          title: `Could not queue downloads: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      return profile;
    },
    [importProfile, switchProfileAsync, enqueueInstall],
  );

  return { importShared, isImporting: isPending };
}
