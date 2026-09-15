import { useState, useEffect } from "react";
import { Shield } from "lucide-react";
import { detectGame, installBepinex, getGameStatus } from "../../lib/tauri";
import { useAppStore } from "../../store/appStore";
import { StepIndicator, DetectStep, BepinexStep, ReadyStep } from "./SetupSteps";
import type { Step } from "./SetupSteps";

export default function SetupWizard() {
  const setGameStatus = useAppStore((s) => s.setGameStatus);
  const setInitialized = useAppStore((s) => s.setInitialized);

  const [step, setStep] = useState<Step>("detect");
  const [detecting, setDetecting] = useState(true);
  const [gamePath, setGamePath] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [installError, setInstallError] = useState<string | null>(null);

  // Step 1: Detect game on mount
  useEffect(() => {
    let cancelled = false;
    async function detect() {
      setDetecting(true);
      setDetectError(null);
      try {
        const status = await detectGame();
        if (cancelled) return;
        setGameStatus(status);
        setGamePath(status.game_path);

        if (status.installed && status.bepinex_installed) {
          setStep("ready");
        } else if (status.installed) {
          setStep("bepinex");
        }
      } catch (err) {
        if (cancelled) return;
        setDetectError(
          `Could not detect Valheim. Make sure it is installed via Steam. (${err})`
        );
      } finally {
        if (!cancelled) setDetecting(false);
      }
    }
    detect();
    return () => {
      cancelled = true;
    };
  }, [setGameStatus]);

  // Simulate progress steps while an install is in flight.
  useEffect(() => {
    if (!installing) return;
    const id = setInterval(() => {
      setInstallProgress((p) => (p >= 90 ? p : p + Math.random() * 15));
    }, 400);
    return () => clearInterval(id);
  }, [installing]);

  // Step 2: Install BepInEx
  const handleInstallBepinex = async () => {
    setInstalling(true);
    setInstallError(null);
    setInstallProgress(0);

    try {
      await installBepinex();
      setInstallProgress(100);

      // Re-fetch status
      try {
        const status = await getGameStatus();
        setGameStatus(status);
      } catch {
        // Continue anyway
      }

      setTimeout(() => setStep("ready"), 500);
    } catch (err) {
      setInstallError(`BepInEx installation failed: ${err}`);
      setInstallProgress(0);
    } finally {
      setInstalling(false);
    }
  };

  // Step 3: Done
  const handleFinish = async () => {
    try {
      const status = await getGameStatus();
      setGameStatus(status);
    } catch {
      // ok
    }
    setInitialized(true);
  };

  const handleRetryDetect = async () => {
    setDetecting(true);
    setDetectError(null);
    try {
      const status = await detectGame();
      setGameStatus(status);
      setGamePath(status.game_path);
      if (status.installed && status.bepinex_installed) {
        setStep("ready");
      } else if (status.installed) {
        setStep("bepinex");
      }
    } catch (err) {
      setDetectError(`Detection failed: ${err}`);
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[var(--color-bg-primary)]">
      <div className="w-full max-w-lg px-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--color-accent-amber)] to-orange-700 flex items-center justify-center mb-4 shadow-lg shadow-orange-900/40">
            <Shield size={36} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
            Macheim
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Valheim Mod Manager for macOS
          </p>
        </div>

        <StepIndicator step={step} />

        {/* Card */}
        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-6 shadow-xl shadow-black/30">
          {step === "detect" && (
            <DetectStep
              detecting={detecting}
              detectError={detectError}
              gamePath={gamePath}
              onRetry={handleRetryDetect}
              onContinue={() => setStep("bepinex")}
            />
          )}
          {step === "bepinex" && (
            <BepinexStep
              installing={installing}
              installError={installError}
              installProgress={installProgress}
              onInstall={handleInstallBepinex}
            />
          )}
          {step === "ready" && <ReadyStep onFinish={handleFinish} />}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[var(--color-text-muted)] mt-6">
          Built for macOS &middot; Macheim v1.1.0
        </p>
      </div>
    </div>
  );
}
