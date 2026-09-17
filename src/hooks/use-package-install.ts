import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "../components/ui/toast";
import { installedModsQueryKey } from "../lib/query-keys";
import { installMod, installModpack } from "../lib/tauri";
import type { ThunderstorePackage } from "../lib/types";
import { useInstalledMods } from "./use-installed-mods";

interface InstallTarget {
  fullName: string;
  name: string;
  version: string;
  kind?: "mod" | "modpack";
}

export function useModInstall() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ fullName, version, kind = "mod" }: InstallTarget) =>
      kind === "modpack" ? installModpack(fullName, version) : installMod(fullName, version),
    onSuccess: async (_data, { name, version, kind = "mod" }) => {
      await queryClient.invalidateQueries({ queryKey: installedModsQueryKey });
      toast.add({
        type: "success",
        title: `Installed ${kind === "modpack" ? "modpack " : ""}${name} v${version}`,
      });
    },
    onError: (err, { name }) => {
      toast.add({
        type: "error",
        title: `Failed to install ${name}: ${err}`,
      });
    },
  });

  return {
    install: (target: InstallTarget) => {
      if (mutation.isPending) return;
      mutation.mutate(target);
    },
    isInstalling: mutation.isPending,
    installingFullName: mutation.isPending ? (mutation.variables?.fullName ?? null) : null,
    installingVersion: mutation.isPending ? (mutation.variables?.version ?? null) : null,
  };
}

export function usePackageInstall(pkg: ThunderstorePackage, kind: "mod" | "modpack" = "mod") {
  const { install, isInstalling, installingVersion } = useModInstall();
  const { data: installedMods = [] } = useInstalledMods();

  const isInstalled = installedMods.some((m) => m.full_name === pkg.full_name);

  const installVersion = (version: string = pkg.version_number) => {
    install({ fullName: pkg.full_name, name: pkg.name, version, kind });
  };

  return { install: installVersion, isInstalled, isInstalling, installingVersion };
}
