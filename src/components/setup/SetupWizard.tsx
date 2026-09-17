import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle,
  Loader2,
  Search,
  Shield,
  XCircle,
} from "lucide-react";
import { Fragment, useRef, useState } from "react";

import { useAppVersion } from "../../hooks/use-app-version";
import { useGameStatus } from "../../hooks/use-game-status";
import { gameStatusQueryKey } from "../../lib/query-keys";
import { getGameStatus, installBepinex } from "../../lib/tauri";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { Progress, ProgressLabel, ProgressValue } from "../ui/progress";
import { Separator } from "../ui/separator";

type Step = "detect" | "bepinex" | "ready";

const steps: { id: Step; label: string }[] = [
  { id: "detect", label: "Detect" },
  { id: "bepinex", label: "BepInEx" },
  { id: "ready", label: "Ready" },
];

export default function SetupWizard() {
  const queryClient = useQueryClient();
  const version = useAppVersion();
  const { data: status, isFetching: detecting, error: detectErrorObj, refetch } = useGameStatus();

  const [installProgress, setInstallProgress] = useState(0);
  const [bepinexReady, setBepinexReady] = useState(false);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const installBepinexMutation = useMutation({
    mutationFn: installBepinex,
    onSuccess: () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setInstallProgress(100);
      setTimeout(() => setBepinexReady(true), 500);
    },
    onError: () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setInstallProgress(0);
    },
  });

  const installing = installBepinexMutation.isPending;
  const installError = installBepinexMutation.error
    ? `BepInEx installation failed: ${installBepinexMutation.error}`
    : null;

  const gamePath = status?.game_path ?? null;
  const installed = status?.installed ?? false;
  const bepinexInstalled = status?.bepinex_installed ?? false;
  const detectError = detectErrorObj ? String(detectErrorObj) : null;
  const gameMissing = !gamePath;

  const step: Step =
    installed && (bepinexInstalled || bepinexReady) ? "ready" : installed ? "bepinex" : "detect";
  const currentIndex = steps.findIndex((s) => s.id === step);

  // Step 2: Install BepInEx
  const handleInstallBepinex = () => {
    setInstallProgress(0);
    // Simulate progress steps while waiting for the install
    progressTimer.current = setInterval(() => {
      setInstallProgress((p) => (p >= 90 ? 90 : p + Math.random() * 15));
    }, 400);
    installBepinexMutation.mutate();
  };

  // Step 3: Done
  const handleFinish = async () => {
    try {
      queryClient.setQueryData(gameStatusQueryKey, await getGameStatus());
    } catch {
      // ok
    }
  };

  const handleRetryDetect = async () => {
    await refetch();
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--color-bg-primary)] px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/icon.png" alt="Macheim" className="size-14" />
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
              Macheim
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Valheim Mod Manager for macOS
            </p>
          </div>
        </div>

        <Card className="gap-5 border border-[var(--color-border-default)] bg-[var(--color-bg-card)] py-5 shadow-xl ring-0 shadow-black/30">
          {/* Step indicator */}
          <CardHeader>
            <div className="flex items-center gap-2">
              {steps.map((s, i) => {
                const isDone = i < currentIndex;
                const isCurrent = i === currentIndex;
                return (
                  <Fragment key={s.id}>
                    {i > 0 && <Separator className="flex-1 bg-[var(--color-border-default)]" />}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center border text-[10px] font-semibold",
                          isDone &&
                            "border-[var(--color-success)] bg-[var(--color-success)]/15 text-[var(--color-success)]",
                          isCurrent &&
                            "border-[var(--color-accent-amber)] bg-[var(--color-accent-amber)]/15 text-[var(--color-accent-amber)]",
                          !isDone &&
                            !isCurrent &&
                            "border-[var(--color-border-default)] text-[var(--color-text-muted)]",
                        )}
                      >
                        {isDone ? <Check size={12} /> : i + 1}
                      </span>
                      <span
                        className={cn(
                          "text-[11px] font-medium",
                          isDone || isCurrent
                            ? "text-[var(--color-text-primary)]"
                            : "text-[var(--color-text-muted)]",
                        )}
                      >
                        {s.label}
                      </span>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </CardHeader>

          {/* Step 1: Detect */}
          {step === "detect" && (
            <>
              <CardContent className="flex flex-col items-center gap-4 text-center">
                {detecting ? (
                  <>
                    <Loader2 size={32} className="animate-spin text-[var(--color-accent-amber)]" />
                    <div className="space-y-1">
                      <CardTitle className="text-base text-[var(--color-text-primary)]">
                        Detecting Valheim...
                      </CardTitle>
                      <CardDescription className="text-[var(--color-text-secondary)]">
                        Searching for your Valheim installation
                      </CardDescription>
                    </div>
                  </>
                ) : detectError || gameMissing ? (
                  <>
                    <XCircle size={32} className="text-[var(--color-error)]" />
                    <div className="space-y-1">
                      <CardTitle className="text-base text-[var(--color-text-primary)]">
                        Valheim Not Found
                      </CardTitle>
                      <CardDescription className="text-[var(--color-text-secondary)]">
                        {detectError ?? "Install Valheim through Steam, then retry detection."}
                      </CardDescription>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle size={32} className="text-[var(--color-success)]" />
                    <div className="space-y-1">
                      <CardTitle className="text-base text-[var(--color-text-primary)]">
                        Valheim Found
                      </CardTitle>
                      <CardDescription className="text-[var(--color-text-secondary)]">
                        Your installation is ready for mods
                      </CardDescription>
                    </div>
                    <p className="w-full bg-[var(--color-bg-input)] px-3 py-2 font-mono text-xs break-all text-[var(--color-text-muted)]">
                      {gamePath}
                    </p>
                  </>
                )}
              </CardContent>

              {!detecting && (
                <CardFooter>
                  <Button className="w-full" onClick={handleRetryDetect}>
                    <Search size={16} />
                    Retry Detection
                  </Button>
                </CardFooter>
              )}
            </>
          )}

          {/* Step 2: BepInEx */}
          {step === "bepinex" && (
            <>
              <CardContent className="flex flex-col items-center gap-4 text-center">
                {installing ? (
                  <>
                    <Loader2
                      size={32}
                      className="animate-spin text-[var(--color-accent-primary)]"
                    />
                    <div className="space-y-1">
                      <CardTitle className="text-base text-[var(--color-text-primary)]">
                        Installing BepInEx...
                      </CardTitle>
                      <CardDescription className="text-[var(--color-text-secondary)]">
                        Setting up the mod loader framework
                      </CardDescription>
                    </div>
                    <Progress
                      value={Math.min(100, Math.round(installProgress))}
                      className="w-full max-w-xs [&_[data-slot=progress-indicator]]:bg-[var(--color-accent-primary)] [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-[var(--color-bg-input)]"
                    >
                      <ProgressLabel className="text-[var(--color-text-secondary)]">
                        Progress
                      </ProgressLabel>
                      <ProgressValue className="text-[var(--color-text-secondary)]" />
                    </Progress>
                  </>
                ) : (
                  <>
                    <div className="flex size-11 items-center justify-center bg-[var(--color-accent-primary)]/15">
                      <Shield size={22} className="text-[var(--color-accent-primary)]" />
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-base text-[var(--color-text-primary)]">
                        Install BepInEx
                      </CardTitle>
                      <CardDescription className="text-[var(--color-text-secondary)]">
                        BepInEx is the mod loading framework required for Valheim mods. It only
                        needs to be installed once.
                      </CardDescription>
                    </div>

                    {installError && (
                      <Alert
                        variant="destructive"
                        className="w-full border-[var(--color-error)]/30 bg-[var(--color-error)]/10 text-left"
                      >
                        <AlertTriangle />
                        <AlertTitle>Installation Failed</AlertTitle>
                        <AlertDescription>{installError}</AlertDescription>
                      </Alert>
                    )}

                    <Alert className="w-full border-[var(--color-warning)]/20 bg-[var(--color-warning)]/10 text-left">
                      <AlertTriangle className="text-[var(--color-warning)]" />
                      <AlertTitle className="text-[var(--color-warning)]">
                        macOS Gatekeeper
                      </AlertTitle>
                      <AlertDescription className="text-[var(--color-text-secondary)]">
                        After installation, allow BepInEx libraries in System Settings &gt; Privacy
                        &amp; Security if prompted.
                      </AlertDescription>
                    </Alert>
                  </>
                )}
              </CardContent>

              {!installing && (
                <CardFooter>
                  <Button
                    className="w-full"
                    variant="accent-primary"
                    onClick={handleInstallBepinex}
                  >
                    {installError ? "Retry Installation" : "Install BepInEx"}
                    {!installError && <ArrowRight size={16} />}
                  </Button>
                </CardFooter>
              )}
            </>
          )}

          {/* Step 3: Ready */}
          {step === "ready" && (
            <>
              <CardContent className="flex flex-col items-center gap-4 text-center">
                <CheckCircle size={36} className="text-[var(--color-success)]" />
                <div className="space-y-1">
                  <CardTitle className="text-base text-[var(--color-text-primary)]">
                    You&apos;re All Set
                  </CardTitle>
                  <CardDescription className="text-[var(--color-text-secondary)]">
                    Valheim and BepInEx are ready. Start browsing and installing mods.
                  </CardDescription>
                </div>
              </CardContent>
              <CardFooter>
                <Button className="w-full" variant="accent-primary" onClick={handleFinish}>
                  Start Managing Mods
                  <ArrowRight size={16} />
                </Button>
              </CardFooter>
            </>
          )}
        </Card>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-[var(--color-text-muted)]">
          Built for macOS &middot; Macheim{version ? ` v${version}` : ""}
        </p>
      </div>
    </div>
  );
}
