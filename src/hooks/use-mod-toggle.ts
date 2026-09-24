import { useMutation, useQueryClient } from "@tanstack/react-query";

import { notify } from "../components/ui/toast";
import { installedModsQueryKey, modConflictsQueryKey } from "../lib/query-keys";
import { setModsEnabled, toggleMod } from "../lib/tauri";
import type { InstalledMod } from "../lib/types";

export function useModToggle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fullName, enable }: { fullName: string; enable: boolean }) =>
      toggleMod(fullName, enable),
    onSuccess: (_data, { fullName, enable }) => {
      queryClient.setQueryData<InstalledMod[]>(installedModsQueryKey, (prev) =>
        prev?.map((m) => (m.full_name === fullName ? { ...m, enabled: enable } : m)),
      );
      void queryClient.invalidateQueries({ queryKey: modConflictsQueryKey });
    },
    onError: (err) => {
      notify("mod-toggle", { type: "error", title: `Failed to toggle mod: ${err}` });
    },
  });
}

/** Enable or disable several mods at once (Installed Mods selection). */
export function useModsToggle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fullNames, enable }: { fullNames: string[]; enable: boolean }) =>
      setModsEnabled(fullNames, enable),
    onSuccess: (result, { enable }) => {
      const changed = new Set(result.changed);
      queryClient.setQueryData<InstalledMod[]>(installedModsQueryKey, (prev) =>
        prev?.map((m) => (changed.has(m.full_name) ? { ...m, enabled: enable } : m)),
      );
      void queryClient.invalidateQueries({ queryKey: modConflictsQueryKey });
      notify("mods-toggle", {
        type: result.failed.length > 0 ? "warning" : "success",
        title: `${result.changed.length} mod${result.changed.length === 1 ? "" : "s"} ${
          enable ? "enabled" : "disabled"
        }`,
        description:
          result.failed.length > 0
            ? `${result.failed.length} could not be changed: ${result.failed[0]}`
            : undefined,
      });
    },
    onError: (err) => {
      notify("mods-toggle", { type: "error", title: `Failed to update mods: ${err}` });
    },
  });
}
