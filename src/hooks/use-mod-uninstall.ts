import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "../components/ui/toast";
import { installedModsQueryKey, modConflictsQueryKey } from "../lib/query-keys";
import { uninstallMod } from "../lib/tauri";
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
      toast.add({ type: "info", title: `Uninstalled ${name}` });
    },
    onError: (err, { name }) => {
      toast.add({
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
