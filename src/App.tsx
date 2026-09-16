import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

import ProgressOverlay from "./components/common/ProgressOverlay";
import MainLayout from "./components/layout/MainLayout";
import SetupWizard from "./components/setup/SetupWizard";
import { toast, Toaster } from "./components/ui/toast";
import { detectGame } from "./lib/tauri";
import { useAppStore } from "./store/appStore";

interface CdnFallbackEvent {
  from: string;
  to: string;
}

export default function App() {
  const gameStatus = useAppStore((s) => s.gameStatus);
  const isInitialized = useAppStore((s) => s.isInitialized);
  const setGameStatus = useAppStore((s) => s.setGameStatus);
  const setInitialized = useAppStore((s) => s.setInitialized);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const unlisten = listen<CdnFallbackEvent>("cdn-fallback", (event) => {
      toast.add({
        type: "info",
        description:
          `Thunderstore's main download server (${event.payload.from}) is blocked by antivirus software ` +
          `like Malwarebytes, so Macheim switched to Thunderstore's backup server (${event.payload.to}). ` +
          `Downloading works normally.`,
        timeout: 12000,
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    async function checkStatus() {
      try {
        const status = await detectGame();
        setGameStatus(status);
        if (status.installed && status.bepinex_installed) {
          setInitialized(true);
        }
      } catch {
        // Backend not ready; will show setup wizard
      } finally {
        setBooting(false);
      }
    }
    checkStatus();
  }, [setGameStatus, setInitialized]);

  const needsSetup = !isInitialized || !gameStatus?.installed || !gameStatus?.bepinex_installed;

  return (
    <>
      {booting ? null : needsSetup ? <SetupWizard /> : <MainLayout />}
      <Toaster />
      <ProgressOverlay />
    </>
  );
}
