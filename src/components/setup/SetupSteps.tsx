import {
  Loader2,
  CheckCircle,
  XCircle,
  Shield,
  Search,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import ProgressBar from "../common/ProgressBar";

export type Step = "detect" | "bepinex" | "ready";

const STEPS: Step[] = ["detect", "bepinex", "ready"];

export function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              step === s
                ? "bg-[var(--color-accent-amber)]"
                : i < STEPS.indexOf(step)
                  ? "bg-[var(--color-success)]"
                  : "bg-[var(--color-border-default)]"
            }`}
          />
          {i < 2 && <div className="w-12 h-px bg-[var(--color-border-default)]" />}
        </div>
      ))}
    </div>
  );
}

interface DetectStepProps {
  detecting: boolean;
  detectError: string | null;
  gamePath: string | null;
  onRetry: () => void;
  onContinue: () => void;
}

export function DetectStep({
  detecting,
  detectError,
  gamePath,
  onRetry,
  onContinue,
}: DetectStepProps) {
  return (
    <div className="text-center">
      {detecting ? (
        <>
          <Loader2
            size={40}
            className="mx-auto text-[var(--color-accent-amber)] animate-spin mb-4"
          />
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            Detecting Valheim...
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Searching for your Valheim installation
          </p>
        </>
      ) : detectError ? (
        <>
          <XCircle
            size={40}
            className="mx-auto text-[var(--color-error)] mb-4"
          />
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            Valheim Not Found
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            {detectError}
          </p>
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold
              bg-[var(--color-accent-primary)] text-white
              hover:bg-[var(--color-accent-primary-hover)] active:scale-[0.98] transition cursor-pointer"
          >
            <Search size={16} />
            Retry Detection
          </button>
        </>
      ) : (
        <>
          <CheckCircle
            size={40}
            className="mx-auto text-[var(--color-success)] mb-4"
          />
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            Valheim Found!
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] font-mono bg-[var(--color-bg-input)] px-3 py-2 rounded-md mb-6">
            {gamePath}
          </p>
          <button
            onClick={onContinue}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold
              bg-[var(--color-accent-amber)] text-white
              hover:bg-[var(--color-accent-amber-hover)] active:scale-[0.98] transition cursor-pointer"
          >
            Continue
            <ArrowRight size={16} />
          </button>
        </>
      )}
    </div>
  );
}

interface BepinexStepProps {
  installing: boolean;
  installError: string | null;
  installProgress: number;
  onInstall: () => void;
}

export function BepinexStep({
  installing,
  installError,
  installProgress,
  onInstall,
}: BepinexStepProps) {
  return (
    <div className="text-center">
      {installing ? (
        <>
          <Loader2
            size={40}
            className="mx-auto text-[var(--color-accent-primary)] animate-spin mb-4"
          />
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            Installing BepInEx...
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Setting up the mod loader framework
          </p>
          <ProgressBar
            value={installProgress}
            label="Progress"
            className="max-w-xs mx-auto"
          />
        </>
      ) : installError ? (
        <>
          <XCircle
            size={40}
            className="mx-auto text-[var(--color-error)] mb-4"
          />
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            Installation Failed
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            {installError}
          </p>
          <button
            onClick={onInstall}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold
              bg-[var(--color-accent-primary)] text-white
              hover:bg-[var(--color-accent-primary-hover)] active:scale-[0.98] transition cursor-pointer"
          >
            Retry Installation
          </button>
        </>
      ) : (
        <>
          <div className="w-12 h-12 rounded-xl bg-[var(--color-accent-primary)]/15 flex items-center justify-center mx-auto mb-4">
            <Shield size={24} className="text-[var(--color-accent-primary)]" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            Install BepInEx
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            BepInEx is the mod loading framework required for Valheim mods. It
            needs to be installed once.
          </p>

          {/* macOS Gatekeeper warning */}
          <div className="flex items-start gap-2.5 text-left p-3 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20 mb-6">
            <AlertTriangle
              size={16}
              className="text-[var(--color-warning)] mt-0.5 shrink-0"
            />
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              <span className="font-semibold text-[var(--color-warning)]">
                macOS Gatekeeper:
              </span>{" "}
              After installation, you may need to allow BepInEx libraries in
              System Preferences &gt; Privacy & Security if prompted.
            </p>
          </div>

          <button
            onClick={onInstall}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold
              bg-[var(--color-accent-primary)] text-white
              hover:bg-[var(--color-accent-primary-hover)] active:scale-[0.98] transition cursor-pointer"
          >
            Install BepInEx
            <ArrowRight size={16} />
          </button>
        </>
      )}
    </div>
  );
}

export function ReadyStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="text-center">
      <CheckCircle
        size={48}
        className="mx-auto text-[var(--color-success)] mb-4"
      />
      <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
        You&apos;re All Set!
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)] mb-6">
        Valheim and BepInEx are ready. Start browsing and installing mods.
      </p>
      <button
        onClick={onFinish}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold
          bg-gradient-to-r from-[var(--color-accent-amber)] to-orange-600 text-white
          shadow-md shadow-orange-900/30
          hover:from-[var(--color-accent-amber-hover)] hover:to-orange-700
          active:scale-[0.98] transition cursor-pointer"
      >
        Start Managing Mods
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
