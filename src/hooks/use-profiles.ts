import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirm, save } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";

import { notify, toast } from "../components/ui/toast";
import {
  deletedProfilesQueryKey,
  gameStatusQueryKey,
  installedModsQueryKey,
  modConflictsQueryKey,
  profilesQueryKey,
} from "../lib/query-keys";
import {
  cloneProfile,
  createProfile,
  deleteProfile,
  exportProfileCode,
  exportProfileFile,
  getActiveProfile,
  getGameStatus,
  importProfileCode,
  importProfileFile,
  listDeletedProfiles,
  listProfiles,
  purgeDeletedProfile,
  purgeDeletedProfiles,
  restoreDeletedProfile,
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
      notify("profile-switch", { type: "success", title: `Switched to profile "${name}"` });
    },
    onError: (err) => {
      notify("profile-switch", { type: "error", title: `Failed to switch profile: ${err}` });
    },
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProfile,
    onSuccess: async (_profile, name) => {
      await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
      notify("profile-create", { type: "success", title: `Created profile "${name}"` });
    },
    onError: (err) => {
      notify("profile-create", { type: "error", title: `Failed to create profile: ${err}` });
    },
  });
}

export function useDeletedProfiles() {
  return useQuery({
    queryKey: deletedProfilesQueryKey,
    queryFn: listDeletedProfiles,
  });
}

export function useDeleteProfile() {
  const queryClient = useQueryClient();

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
    await queryClient.invalidateQueries({ queryKey: deletedProfilesQueryKey });
  };

  return useMutation({
    mutationFn: deleteProfile,
    onSuccess: async (deleted, name) => {
      await refresh();
      notify("profile-delete", {
        type: "info",
        title: `Removed "${name}"`,
        description: "Undo restores it; the archive stays under Deleted profiles.",
        actionProps: {
          children: "Undo",
          onClick: () => {
            void restoreDeletedProfile(deleted.archive_name)
              .then(async (profile) => {
                await refresh();
                toast.close("profile-delete");
                notify("profile-restore", {
                  type: "success",
                  title: `Restored "${profile.name}"`,
                });
              })
              .catch((err) => {
                notify("profile-restore", {
                  type: "error",
                  title: `Could not restore "${name}": ${err}`,
                });
              });
          },
        },
      });
    },
    onError: (err) => {
      notify("profile-delete", { type: "error", title: `Failed to delete profile: ${err}` });
    },
  });
}

/** Restore an archived profile (also used by the Undo action on the toast). */
export function useRestoreDeletedProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ archiveName, newName }: { archiveName: string; newName?: string }) =>
      restoreDeletedProfile(archiveName, newName),
    onSuccess: async (profile) => {
      await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
      await queryClient.invalidateQueries({ queryKey: deletedProfilesQueryKey });
      notify("profile-restore", { type: "success", title: `Restored "${profile.name}"` });
    },
    onError: (err) => {
      notify("profile-restore", { type: "error", title: `Could not restore profile: ${err}` });
    },
  });
}

/** Permanently delete an archived profile. Not recoverable. */
export function usePurgeDeletedProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: purgeDeletedProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: deletedProfilesQueryKey });
      notify("profile-purge", { type: "info", title: "Deleted profile removed permanently" });
    },
    onError: (err) => {
      notify("profile-purge", { type: "error", title: `Could not remove the archive: ${err}` });
    },
  });
}

/** Permanently delete every archived profile. Not recoverable. */
export function usePurgeDeletedProfiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: purgeDeletedProfiles,
    onSuccess: async (purged) => {
      await queryClient.invalidateQueries({ queryKey: deletedProfilesQueryKey });
      notify("profile-purge", {
        type: "info",
        title: `Purged ${purged} archived profile${purged === 1 ? "" : "s"}`,
      });
    },
    onError: (err) => {
      notify("profile-purge", { type: "error", title: `Could not purge the archives: ${err}` });
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
      notify("profile-clone", { type: "success", title: `Cloned to "${profile.name}"` });
    },
    onError: (err) => {
      notify("profile-clone", { type: "error", title: `Failed to clone profile: ${err}` });
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
        notify("profile-export", {
          type: "success",
          title: "Profile exported",
          description:
            "Share the .r2z file — Macheim, r2modman, Gale and Thunderstore Mod Manager can import it.",
          timeout: 8000,
        });
      }
    },
    onError: (err) => {
      notify("profile-export", { type: "error", title: `Failed to export profile: ${err}` });
    },
  });
}

/**
 * Share a profile as a short-lived Thunderstore code. The code is returned so
 * the caller can show and copy it; no toast on success.
 */
export function useExportProfileCode() {
  return useMutation({
    mutationFn: exportProfileCode,
    onError: (err) => {
      notify("profile-code", {
        type: "error",
        title: `Could not create a profile code: ${err}`,
        timeout: 8000,
      });
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
      notify("profile-import", {
        type: "success",
        title: `Imported "${profile.name}"`,
        description: `${profile.mods.length} mod${profile.mods.length === 1 ? "" : "s"} in the profile.`,
      });
    },
    onError: (err) => {
      notify("profile-import", {
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
        notify("download-enqueue", {
          type: "success",
          title: `Queued ${enabled.length} download${enabled.length === 1 ? "" : "s"}`,
          description: "Track progress from Downloads.",
        });
      } catch (err) {
        notify("download-enqueue", {
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
