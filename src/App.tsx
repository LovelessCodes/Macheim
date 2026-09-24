import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

import CrashReportSheet from "./components/diagnostics/CrashReportSheet";
import DownloadQueuePanel from "./components/downloads/DownloadQueuePanel";
import InstallDropZone from "./components/downloads/InstallDropZone";
import MainLayout from "./components/layout/MainLayout";
import SetupWizard from "./components/setup/SetupWizard";
import { notify, Toaster } from "./components/ui/toast";
import { useDiagnosticsSync } from "./hooks/use-diagnostics";
import { useDownloadQueueSync } from "./hooks/use-download-queue";
import { useGameStatus } from "./hooks/use-game-status";
import { useUpdaterStartup } from "./hooks/use-updater";

interface CdnFallbackEvent {
  from: string;
  to: string;
}

export default function App() {
  const { data: gameStatus, isPending: booting } = useGameStatus();
  useUpdaterStartup();
  useDownloadQueueSync();
  useDiagnosticsSync();

  useEffect(() => {
    const unlisten = listen<CdnFallbackEvent>("cdn-fallback", (event) => {
      notify("cdn-fallback", {
        type: "info",
        description:
          `Thunderstore's main download server (${event.payload.from}) is blocked by antivirus software ` +
          `like Malwarebytes, so Macheim switched to Thunderstore's backup server (${event.payload.to}). ` +
          `Downloading works normally.`,
        timeout: 12000,
      });
    });

    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const needsSetup = !gameStatus?.installed || !gameStatus?.bepinex_installed;

  return (
    <>
      {booting ? null : needsSetup ? <SetupWizard /> : <MainLayout />}
      <Toaster />
      <DownloadQueuePanel />
      <CrashReportSheet />
      <InstallDropZone />
    </>
  );
}
