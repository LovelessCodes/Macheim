import { useMutation } from "@tanstack/react-query";

import { notify } from "../components/ui/toast";
import { launchModded, launchVanilla } from "../lib/tauri";

export function useLaunchModded() {
  return useMutation({
    mutationFn: launchModded,
    onSuccess: () => {
      notify("launch-modded", { type: "success", title: "Launching Valheim (modded)..." });
    },
    onError: (err) => {
      notify("launch-modded", { type: "error", title: `Failed to launch: ${err}` });
    },
  });
}

export function useLaunchVanilla() {
  return useMutation({
    mutationFn: launchVanilla,
    onSuccess: () => {
      notify("launch-vanilla", { type: "success", title: "Launching Valheim (vanilla)..." });
    },
    onError: (err) => {
      notify("launch-vanilla", { type: "error", title: `Failed to launch: ${err}` });
    },
  });
}
