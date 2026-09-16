import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { toast } from "../components/ui/toast";
import { installedModsQueryKey } from "../lib/query-keys";
import { installMod, installModpack } from "../lib/tauri";
import type { ThunderstorePackage } from "../lib/types";
import { useModStore } from "../store/modStore";
import { useInstalledMods } from "./use-installed-mods";

export function usePackageInstall(pkg: ThunderstorePackage, kind: "mod" | "modpack" = "mod") {
  const queryClient = useQueryClient();
  const { data: installedMods = [] } = useInstalledMods();
  const isInstallingMod = useModStore((s) => s.isInstallingMod);
  const setInstallingMod = useModStore((s) => s.setInstallingMod);

  const isInstalled = installedMods.some((m) => m.full_name === pkg.full_name);
  const isInstalling = isInstallingMod === pkg.full_name;

  const install = useCallback(async () => {
    if (isInstalled || isInstalling) return;

    setInstallingMod(pkg.full_name);
    try {
      if (kind === "modpack") {
        await installModpack(pkg.full_name, pkg.version_number);
      } else {
        await installMod(pkg.full_name, pkg.version_number);
      }
      await queryClient.invalidateQueries({ queryKey: installedModsQueryKey });
      toast.add({
        type: "success",
        title: `Installed ${kind === "modpack" ? "modpack " : ""}${pkg.name}`,
      });
    } catch (err) {
      toast.add({
        type: "error",
        title: `Failed to install ${pkg.name}: ${err}`,
      });
    } finally {
      setInstallingMod(null);
    }
  }, [
    kind,
    pkg.full_name,
    pkg.name,
    pkg.version_number,
    isInstalled,
    isInstalling,
    queryClient,
    setInstallingMod,
  ]);

  return { install, isInstalled, isInstalling };
}
