import {
  Search,
  CheckCircle,
  Loader2,
  XCircle,
  Shield,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { useState, useEffect } from "react";

import { detectGame, installBepinex, getGameStatus } from "../../lib/tauri";
import { useAppStore } from "../../store/appStore";
import ProgressBar from "../common/ProgressBar";

type Step = "detect" | "bepinex" | "ready";

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
        setDetectError(`Could not detect Valheim. Make sure it is installed via Steam. (${err})`);
      } finally {
        if (!cancelled) setDetecting(false);
      }
    }
    detect();
    return () => {
      cancelled = true;
    };
  }, [setGameStatus]);

  // Step 2: Install BepInEx
  const handleInstallBepinex = async () => {
    setInstalling(true);
    setInstallError(null);
    setInstallProgress(0);

    // Simulate progress steps while waiting for the install
    const interval = setInterval(() => {
      setInstallProgress((p) => {
        if (p >= 90) return 90;
        return p + Math.random() * 15;
      });
    }, 400);

    try {
      await installBepinex();
      clearInterval(interval);
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
      clearInterval(interval);
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
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--color-bg-primary)]">
      <div className="w-full max-w-lg px-4">
        {/* Logo */}
        <div className="mb-10 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-accent-amber)] to-orange-700 shadow-lg shadow-orange-900/40">
            <Shield size={36} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
            Macheim
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Valheim Mod Manager for macOS
          </p>
        </div>

        {/* Step indicator */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {(["detect", "bepinex", "ready"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  step === s
                    ? "bg-[var(--color-accent-amber)]"
                    : i < ["detect", "bepinex", "ready"].indexOf(step)
                      ? "bg-[var(--color-success)]"
                      : "bg-[var(--color-border-default)]"
                }`}
              />
              {i < 2 && <div className="h-px w-12 bg-[var(--color-border-default)]" />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-6 shadow-xl shadow-black/30">
          {/* Step 1: Detect */}
          {step === "detect" && (
            <div className="text-center">
              {detecting ? (
                <>
                  <Loader2
                    size={40}
                    className="mx-auto mb-4 animate-spin text-[var(--color-accent-amber)]"
                  />
                  <h2 className="mb-2 text-lg font-semibold text-[var(--color-text-primary)]">
                    Detecting Valheim...
                  </h2>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Searching for your Valheim installation
                  </p>
                </>
              ) : detectError ? (
                <>
                  <XCircle size={40} className="mx-auto mb-4 text-[var(--color-error)]" />
                  <h2 className="mb-2 text-lg font-semibold text-[var(--color-text-primary)]">
                    Valheim Not Found
                  </h2>
                  <p className="mb-6 text-sm text-[var(--color-text-secondary)]">{detectError}</p>
                  <button
                    onClick={handleRetryDetect}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--color-accent-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--color-accent-primary-hover)] active:scale-[0.98]"
                  >
                    <Search size={16} />
                    Retry Detection
                  </button>
                </>
              ) : (
                <>
                  <CheckCircle size={40} className="mx-auto mb-4 text-[var(--color-success)]" />
                  <h2 className="mb-2 text-lg font-semibold text-[var(--color-text-primary)]">
                    Valheim Found!
                  </h2>
                  <p className="mb-6 rounded-md bg-[var(--color-bg-input)] px-3 py-2 font-mono text-sm text-[var(--color-text-muted)]">
                    {gamePath}
                  </p>
                  <button
                    onClick={() => setStep("bepinex")}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--color-accent-amber)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--color-accent-amber-hover)] active:scale-[0.98]"
                  >
                    Continue
                    <ArrowRight size={16} />
                  </button>
                </>
              )}
            </div>
          )}

          {/* Step 2: BepInEx */}
          {step === "bepinex" && (
            <div className="text-center">
              {installing ? (
                <>
                  <Loader2
                    size={40}
                    className="mx-auto mb-4 animate-spin text-[var(--color-accent-primary)]"
                  />
                  <h2 className="mb-2 text-lg font-semibold text-[var(--color-text-primary)]">
                    Installing BepInEx...
                  </h2>
                  <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
                    Setting up the mod loader framework
                  </p>
                  <ProgressBar
                    value={installProgress}
                    label="Progress"
                    className="mx-auto max-w-xs"
                  />
                </>
              ) : installError ? (
                <>
                  <XCircle size={40} className="mx-auto mb-4 text-[var(--color-error)]" />
                  <h2 className="mb-2 text-lg font-semibold text-[var(--color-text-primary)]">
                    Installation Failed
                  </h2>
                  <p className="mb-6 text-sm text-[var(--color-text-secondary)]">{installError}</p>
                  <button
                    onClick={handleInstallBepinex}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--color-accent-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--color-accent-primary-hover)] active:scale-[0.98]"
                  >
                    Retry Installation
                  </button>
                </>
              ) : (
                <>
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent-primary)]/15">
                    <Shield size={24} className="text-[var(--color-accent-primary)]" />
                  </div>
                  <h2 className="mb-2 text-lg font-semibold text-[var(--color-text-primary)]">
                    Install BepInEx
                  </h2>
                  <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
                    BepInEx is the mod loading framework required for Valheim mods. It needs to be
                    installed once.
                  </p>

                  {/* macOS Gatekeeper warning */}
                  <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-[var(--color-warning)]/20 bg-[var(--color-warning)]/10 p-3 text-left">
                    <AlertTriangle
                      size={16}
                      className="mt-0.5 shrink-0 text-[var(--color-warning)]"
                    />
                    <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                      <span className="font-semibold text-[var(--color-warning)]">
                        macOS Gatekeeper:
                      </span>{" "}
                      After installation, you may need to allow BepInEx libraries in System
                      Preferences &gt; Privacy & Security if prompted.
                    </p>
                  </div>

                  <button
                    onClick={handleInstallBepinex}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--color-accent-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--color-accent-primary-hover)] active:scale-[0.98]"
                  >
                    Install BepInEx
                    <ArrowRight size={16} />
                  </button>
                </>
              )}
            </div>
          )}

          {/* Step 3: Ready */}
          {step === "ready" && (
            <div className="text-center">
              <CheckCircle size={48} className="mx-auto mb-4 text-[var(--color-success)]" />
              <h2 className="mb-2 text-xl font-bold text-[var(--color-text-primary)]">
                You&apos;re All Set!
              </h2>
              <p className="mb-6 text-sm text-[var(--color-text-secondary)]">
                Valheim and BepInEx are ready. Start browsing and installing mods.
              </p>
              <button
                onClick={handleFinish}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gradient-to-r from-[var(--color-accent-amber)] to-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-orange-900/30 transition-all hover:from-[var(--color-accent-amber-hover)] hover:to-orange-700 active:scale-[0.98]"
              >
                Start Managing Mods
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-[var(--color-text-muted)]">
          Built for macOS &middot; Macheim v1.1.0
        </p>
      </div>
    </div>
  );
}
