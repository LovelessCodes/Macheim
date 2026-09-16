import { useEffect } from "react";

import ProgressOverlay from "./components/common/ProgressOverlay";
import MainLayout from "./components/layout/MainLayout";
import SetupWizard from "./components/setup/SetupWizard";
import { Toaster } from "./components/ui/toast";
import { getGameStatus } from "./lib/tauri";
import { useAppStore } from "./store/appStore";

export default function App() {
  const gameStatus = useAppStore((s) => s.gameStatus);
  const isInitialized = useAppStore((s) => s.isInitialized);
  const setGameStatus = useAppStore((s) => s.setGameStatus);
  const setInitialized = useAppStore((s) => s.setInitialized);

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
