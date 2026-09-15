import { Shield, RefreshCw, AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { getCompatibility, applyCompatibility } from "../../lib/tauri";
import type { CompatibilitySettings, CompatibilityStatus } from "../../lib/types";
import { useAppStore } from "../../store/appStore";

export default function CompatibilityPage() {
  const [status, setStatus] = useState<CompatibilityStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const addToast = useAppStore((s) => s.addToast);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setStatus(await getCompatibility());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    getCompatibility()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function apply(settings: CompatibilitySettings) {
    if (!status) return;
    setBusy(true);
    setError("");
    try {
      setStatus(await applyCompatibility(status.profile_name, settings));
      addToast({
        type: "success",
        message: "Compatibility settings saved for the next game launch.",
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const button =
    "px-3 py-2 rounded-lg border border-[var(--color-border-default)] text-sm hover:bg-[var(--color-bg-elevated)] disabled:opacity-50 cursor-pointer";
  return (
    <div className="max-w-3xl space-y-5">
      <section className="space-y-4 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Shield size={20} /> Mac Compatibility
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Version-pinned visual workarounds, controlled per profile.
            </p>
          </div>
          <button className={button} onClick={load} disabled={busy}>
            <RefreshCw size={14} className="mr-2 inline" />
            Check support
          </button>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)]">
          This checks installed mod versions and the bundled support list—not every shader in the
          game. Only the listed item effects are eligible. Original mod assets are not rewritten.
        </p>
        {error && (
          <p role="alert" className="text-sm break-words text-[var(--color-error)]">
            {error}
          </p>
        )}
        {!status && !error && <p role="status">Checking support…</p>}
        {status && (
          <>
            <p className="text-sm">
              Profile: <strong>{status.profile_name}</strong>
            </p>
            <label className="flex items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                checked={status.settings.automatic}
                disabled={busy || status.game_running}
                onChange={(e) => apply({ ...status.settings, automatic: e.target.checked })}
              />
              Automatically apply verified compatibility rules
            </label>
            <p className="text-xs text-[var(--color-text-muted)]">
              Applied after mod changes and before Play Modded. Turning this off unloads Macheim's
              patch on the next launch; it does not disable ShaderHelper or other mods.
            </p>
            <div className="flex items-center justify-between gap-3">
              <p role="status" className="text-sm">
                {status.up_to_date
                  ? status.installed
                    ? "Managed patch installed. Runtime checks still apply."
                    : "No managed patch is active."
                  : "Installed files need to be reconciled with this profile."}
              </p>
              <button
                className={button}
                disabled={busy || status.game_running}
                onClick={() => apply(status.settings)}
              >
                Apply supported rules
              </button>
            </div>
            {status.game_running && (
              <p className="text-sm text-[var(--color-warning)]">
                Quit Valheim before applying or disabling patches, then check support again.
              </p>
            )}
          </>
        )}
      </section>
      {status && (
        <>
          <section className="space-y-2 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle size={16} /> Limited, tested coverage
            </p>
            <p>
              Runtime support: Valheim {status.catalog.game_version}, Unity{" "}
              {status.catalog.unity_version}, macOS Metal. The plugin skips other game/Unity
              versions. Mod versions come from profile metadata; manually replaced DLLs cannot be
              verified by that metadata.
            </p>
            <p>
              Not a universal shader repair. Other items, monsters, buildings, equipment and UI
              icons are not covered. Effect brightness can differ from Windows. Unverified all-mod
              scanning is not included in 1.1.0.
            </p>
          </section>
          <div className="space-y-3">
            {status.rules.map(({ rule, eligible, reason }) => {
              const enabled = !status.settings.disabled_rules.includes(rule.id);
              return (
                <section
                  key={rule.id}
                  className="space-y-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-semibold">{rule.title}</h4>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {rule.package} · {rule.version}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        aria-label={`Enable ${rule.title}`}
                        checked={enabled}
                        disabled={busy || status.game_running}
                        onChange={(e) =>
                          apply({
                            ...status.settings,
                            disabled_rules: e.target.checked
                              ? status.settings.disabled_rules.filter((id) => id !== rule.id)
                              : [...status.settings.disabled_rules, rule.id],
                          })
                        }
                      />
                      Allow rule
                    </label>
                  </div>
                  <p
                    className={`text-sm ${eligible ? "text-[var(--color-success)]" : "text-[var(--color-text-secondary)]"}`}
                  >
                    {eligible
                      ? "Eligible for next launch (subject to runtime version checks)."
                      : reason}
                  </p>
                  <p className="text-sm text-[var(--color-text-secondary)]">{rule.reason}</p>
                  <details className="text-xs text-[var(--color-text-muted)]">
                    <summary className="cursor-pointer">Tested objects and limitations</summary>
                    <p className="mt-2 break-words">{rule.prefabs.join(", ")}</p>
                    <p className="mt-2">{rule.validation}</p>
                  </details>
                </section>
              );
            })}
          </div>
          <details className="rounded-xl border border-[var(--color-border-default)] p-4 text-sm">
            <summary className="cursor-pointer">Recent compatibility log (local only)</summary>
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              From the game's latest log; may describe a previous profile or session. An empty log
              does not mean every shader passed. No logs are uploaded.
            </p>
            <pre className="mt-3 max-h-64 overflow-y-auto text-xs break-all whitespace-pre-wrap">
              {status.recent_log.join("\n") ||
                "No recent Macheim compatibility entries. Launch the game and encounter a supported item, then check again."}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
