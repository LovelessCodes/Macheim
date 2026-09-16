import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "./store/appStore";
import { getGameStatus } from "./lib/tauri";
import SetupWizard from "./components/setup/SetupWizard";
import MainLayout from "./components/layout/MainLayout";
import { Toaster } from "./components/ui/toast";
import ProgressOverlay from "./components/common/ProgressOverlay";
import ToastContainer from "./components/common/Toast";
import MainLayout from "./components/layout/MainLayout";
import SetupWizard from "./components/setup/SetupWizard";
import { getGameStatus } from "./lib/tauri";
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
  const addToast = useAppStore((s) => s.addToast);

  useEffect(() => {
    const unlisten = listen<CdnFallbackEvent>("cdn-fallback", (event) => {
      addToast({
        type: "info",
        message:
          `Thunderstore's main download server (${event.payload.from}) is blocked by antivirus software ` +
          `like Malwarebytes, so Macheim switched to Thunderstore's backup server (${event.payload.to}). ` +
          `Downloading works normally.`,
        duration: 12000,
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [addToast]);

  useEffect(() => {
    async function checkStatus() {
      try {
        const status = await getGameStatus();
        setGameStatus(status);
        if (status.installed && status.bepinex_installed) {
          setInitialized(true);
        }
      } catch {
        // Backend not ready; will show setup wizard
      }
    }
    checkStatus();
  }, [setGameStatus, setInitialized]);

  const needsSetup = !isInitialized || !gameStatus?.installed || !gameStatus?.bepinex_installed;

  return (
    <>
      {needsSetup ? <SetupWizard /> : <MainLayout />}
      <Toaster />
      <ProgressOverlay />
    </>
  );
}
