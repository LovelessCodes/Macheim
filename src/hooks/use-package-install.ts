import { useMutation } from "@tanstack/react-query";

import { notify } from "../components/ui/toast";
import type { ThunderstorePackage } from "../lib/types";
import { isDownloadActive } from "../lib/types";
import { useQueuedStatus, useQueuedVersion } from "../store/downloadStore";
import { useEnqueueInstall } from "./use-download-queue";
import { useInstalledMods } from "./use-installed-mods";

/**
 * Install state for one store package. Installs are queued, so the is* flags
 * reflect the queue rather than a blocking request.
 */
export function usePackageInstall(pkg: ThunderstorePackage, kind: "mod" | "modpack" = "mod") {
  const { data: installedMods = [] } = useInstalledMods();
  const enqueue = useEnqueueInstall();
  const queueStatus = useQueuedStatus(pkg.full_name);
  const queuedVersion = useQueuedVersion(pkg.full_name);

  const isInstalled = installedMods.some((m) => m.full_name === pkg.full_name);

  const installVersion = (version: string = pkg.version_number) => {
    void enqueue({ fullName: pkg.full_name, name: pkg.name, version, kind });
  };

  return {
    install: installVersion,
    isInstalled,
    isQueued: queueStatus !== null,
    isInstalling: queueStatus !== null && isDownloadActive(queueStatus),
    queueStatus,
    queuedVersion,
  };
}

/** Queue a batch of version updates (Update All). */
export function useUpdateMods() {
  const enqueue = useEnqueueInstall();

  return useMutation({
    mutationFn: async (targets: { fullName: string; name: string; version: string }[]) => {
      for (const target of targets) {
        await enqueue({ ...target, kind: "mod" }, { silent: true });
      }
      return { total: targets.length };
    },
    onSuccess: ({ total }) => {
      notify("mod-update", {
        type: "success",
        title: `Queued ${total} update${total === 1 ? "" : "s"}`,
        description: "Track progress from Downloads.",
      });
    },
    onError: (err) => {
      notify("mod-update", { type: "error", title: `Update failed: ${err}` });
    },
  });
}
