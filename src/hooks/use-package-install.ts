import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "../components/ui/toast";
import { installedModsQueryKey } from "../lib/query-keys";
import { installMod, installModpack } from "../lib/tauri";
import type { ThunderstorePackage } from "../lib/types";
import { useInstalledMods } from "./use-installed-mods";

export function usePackageInstall(pkg: ThunderstorePackage, kind: "mod" | "modpack" = "mod") {
  const queryClient = useQueryClient();
  const { data: installedMods = [] } = useInstalledMods();

  const isInstalled = installedMods.some((m) => m.full_name === pkg.full_name);

  const mutation = useMutation({
    mutationFn: (version: string) =>
      kind === "modpack"
        ? installModpack(pkg.full_name, version)
        : installMod(pkg.full_name, version),
    onSuccess: async (_data, version) => {
      await queryClient.invalidateQueries({ queryKey: installedModsQueryKey });
      toast.add({
        type: "success",
        title: `Installed ${kind === "modpack" ? "modpack " : ""}${pkg.name} v${version}`,
      });
    },
    onError: (err) => {
      toast.add({
        type: "error",
        title: `Failed to install ${pkg.name}: ${err}`,
      });
    },
  });

  const isInstalling = mutation.isPending;
  const installingVersion = mutation.isPending ? mutation.variables : null;

  const install = (version: string = pkg.version_number) => {
    if (isInstalling) return;
    mutation.mutate(version);
  };

  return { install, isInstalled, isInstalling, installingVersion };
}
