import { useMutation, useQueryClient } from "@tanstack/react-query";

import { notify } from "../components/ui/toast";
import { installedModsQueryKey, modConflictsQueryKey } from "../lib/query-keys";
import { uninstallMod, uninstallMods } from "../lib/tauri";
import type { InstalledMod } from "../lib/types";

export function useModUninstall() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ fullName }: { fullName: string; name: string }) => uninstallMod(fullName),
    onSuccess: (_data, { fullName, name }) => {
      queryClient.setQueryData<InstalledMod[]>(installedModsQueryKey, (prev) =>
        prev?.filter((m) => m.full_name !== fullName),
      );
      void queryClient.invalidateQueries({ queryKey: modConflictsQueryKey });
      notify("mod-uninstall", { type: "info", title: `Uninstalled ${name}` });
    },
    onError: (err, { name }) => {
      notify("mod-uninstall", {
        type: "error",
        title: `Failed to uninstall ${name}: ${err}`,
      });
      // The optimistic removal above may not match what is on disk.
      void queryClient.invalidateQueries({ queryKey: installedModsQueryKey });
      void queryClient.invalidateQueries({ queryKey: modConflictsQueryKey });
    },
  });

  return {
    uninstall: (fullName: string, name: string) => mutation.mutate({ fullName, name }),
    isUninstalling: mutation.isPending,
    uninstallingFullName: mutation.isPending ? (mutation.variables?.fullName ?? null) : null,
  };
}

/** Uninstall several mods at once (Installed Mods selection). */
export function useUninstallMods() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fullNames: string[]) => uninstallMods(fullNames),
    onSuccess: (result) => {
      const removed = new Set(result.changed);
      queryClient.setQueryData<InstalledMod[]>(installedModsQueryKey, (prev) =>
        prev?.filter((m) => !removed.has(m.full_name)),
      );
      void queryClient.invalidateQueries({ queryKey: modConflictsQueryKey });
      notify("mods-uninstall", {
        type: result.failed.length > 0 ? "warning" : "info",
        title: `Uninstalled ${result.changed.length} mod${result.changed.length === 1 ? "" : "s"}`,
        description:
          result.failed.length > 0
            ? `${result.failed.length} could not be removed: ${result.failed[0]}`
            : undefined,
      });
    },
    onError: (err) => {
      notify("mods-uninstall", { type: "error", title: `Failed to uninstall mods: ${err}` });
      void queryClient.invalidateQueries({ queryKey: installedModsQueryKey });
      void queryClient.invalidateQueries({ queryKey: modConflictsQueryKey });
    },
  });
}
