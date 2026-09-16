import { useCallback } from "react";

import { toast } from "../components/ui/toast";
import { getInstalledMods, installMod, installModpack } from "../lib/tauri";
import type { ThunderstorePackage } from "../lib/types";
import { useModStore } from "../store/modStore";

export function usePackageInstall(pkg: ThunderstorePackage, kind: "mod" | "modpack" = "mod") {
  const installedMods = useModStore((s) => s.installedMods);
  const isInstallingMod = useModStore((s) => s.isInstallingMod);
  const setInstallingMod = useModStore((s) => s.setInstallingMod);
  const setInstalledMods = useModStore((s) => s.setInstalledMods);

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
      setInstalledMods(await getInstalledMods());
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
    setInstallingMod,
    setInstalledMods,
  ]);

  return { install, isInstalled, isInstalling };
}
