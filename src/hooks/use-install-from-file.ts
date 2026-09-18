import { open } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";

import { toast } from "../components/ui/toast";
import { fileName, isZipPath } from "../lib/downloads";
import { enqueueLocalInstall } from "../lib/tauri";

/**
 * Install mods from local ZIP files, either picked from disk or dropped onto
 * the window. Everything goes through the normal queue, so it waits for
 * Valheim to close and can be paused or cancelled.
 */
export function useInstallFromFile() {
  const installPaths = useCallback(async (paths: string[]) => {
    const zips = paths.filter(isZipPath);
    if (zips.length === 0) {
      if (paths.length > 0) {
        toast.add({
          type: "warning",
          title: "Only .zip mod archives can be installed from files",
        });
      }
      return 0;
    }

    const failures: string[] = [];
    for (const path of zips) {
      try {
        await enqueueLocalInstall(path);
      } catch (error) {
        failures.push(`${fileName(path)}: ${String(error)}`);
      }
    }

    const queued = zips.length - failures.length;
    if (queued > 0) {
      toast.add({
        id: "download-enqueue",
        type: "success",
        title: `Queued ${queued} archive${queued === 1 ? "" : "s"}`,
        description: "Track, pause or cancel them from Downloads.",
      });
    }
    if (failures.length > 0) {
      toast.add({
        type: "error",
        title:
          failures.length === 1
            ? "Could not add archive"
            : `${failures.length} archives could not be added`,
        description: failures[0],
        timeout: 8000,
      });
    }
    return queued;
  }, []);

  const pickFiles = useCallback(async () => {
    const selection = await open({
      multiple: true,
      title: "Install mods from files",
      filters: [{ name: "Mod archives", extensions: ["zip"] }],
    });
    if (!selection) return 0;
    const paths = Array.isArray(selection) ? selection : [selection];
    return installPaths(paths);
  }, [installPaths]);

  return { pickFiles, installPaths };
}
