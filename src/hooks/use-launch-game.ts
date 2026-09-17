import { useMutation } from "@tanstack/react-query";

import { toast } from "../components/ui/toast";
import { launchModded, launchVanilla } from "../lib/tauri";

export function useLaunchModded() {
  return useMutation({
    mutationFn: launchModded,
    onSuccess: () => {
      toast.add({ type: "success", title: "Launching Valheim (modded)..." });
    },
    onError: (err) => {
      toast.add({ type: "error", title: `Failed to launch: ${err}` });
    },
  });
}

export function useLaunchVanilla() {
  return useMutation({
    mutationFn: launchVanilla,
    onSuccess: () => {
      toast.add({ type: "success", title: "Launching Valheim (vanilla)..." });
    },
    onError: (err) => {
      toast.add({ type: "error", title: `Failed to launch: ${err}` });
    },
  });
}
