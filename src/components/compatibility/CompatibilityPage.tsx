import { Shield, RefreshCw, Loader2, AlertTriangle } from "lucide-react";

import { useAppVersion } from "../../hooks/use-app-version";
import { useApplyCompatibility, useCompatibility } from "../../hooks/use-compatibility";
import type { CompatibilitySettings } from "../../lib/types";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

export default function CompatibilityPage() {
  const version = useAppVersion();
  const { data: status = null, isFetching, error: loadError, refetch } = useCompatibility();
  const applyCompatibilityMutation = useApplyCompatibility();

  const busy = isFetching || applyCompatibilityMutation.isPending;
  const error = loadError
    ? String(loadError)
    : applyCompatibilityMutation.error
      ? String(applyCompatibilityMutation.error)
      : "";

  function apply(settings: CompatibilitySettings) {
    if (!status) return;
    applyCompatibilityMutation.mutate({ profileName: status.profile_name, settings });
  }
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-5" />
            Mac Compatibility
          </CardTitle>
          <CardDescription>
            Version-pinned visual workarounds, controlled per profile.
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Check support
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-muted-foreground text-sm">
            This checks installed mod versions and the bundled support list—not every shader in the
            game. Only the listed item effects are eligible. Original mod assets are not rewritten.
          </p>
          {error && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription className="break-words">{error}</AlertDescription>
            </Alert>
          )}
          {!status && !error && (
            <p role="status" className="text-muted-foreground text-sm">
              Checking support…
            </p>
          )}
          {status && (
            <>
              <p className="text-sm">
                Profile: <strong>{status.profile_name}</strong>
              </p>
              <label className="flex items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-accent-primary)]"
                  checked={status.settings.automatic}
                  disabled={busy || status.game_running}
                  onChange={(e) => apply({ ...status.settings, automatic: e.target.checked })}
                />
                Automatically apply verified compatibility rules
              </label>
              <p className="text-muted-foreground text-xs">
                Applied after mod changes and before Play Modded. Turning this off unloads
                Macheim&apos;s patch on the next launch; it does not disable ShaderHelper or other
                mods.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p role="status" className="text-sm">
                  {status.up_to_date
                    ? status.installed
                      ? "Managed patch installed. Runtime checks still apply."
                      : "No managed patch is active."
                    : "Installed files need to be reconciled with this profile."}
                </p>
                <Button
                  variant="accent-primary"
                  size="sm"
                  disabled={busy || status.game_running}
                  onClick={() => apply(status.settings)}
                >
                  Apply supported rules
                </Button>
              </div>
              {status.game_running && (
                <Alert className="border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10">
                  <AlertTriangle className="text-[var(--color-warning)]" />
                  <AlertDescription className="text-foreground">
                    Quit Valheim before applying or disabling patches, then check support again.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>
      {status && (
        <>
          <Alert className="border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5">
            <AlertTriangle className="text-[var(--color-warning)]" />
            <AlertTitle className="font-medium">Limited, tested coverage</AlertTitle>
            <AlertDescription className="text-foreground">
              <p>
                Runtime support: Valheim {status.catalog.game_version}, Unity{" "}
                {status.catalog.unity_version}, macOS Metal. The plugin skips other game/Unity
                versions. Mod versions come from profile metadata; manually replaced DLLs cannot be
                verified by that metadata.
              </p>
              <p>
                Not a universal shader repair. Other items, monsters, buildings, equipment and UI
                icons are not covered. Effect brightness can differ from Windows. Unverified all-mod
                scanning is not included in {version ? `v${version}` : "this release"}.
              </p>
            </AlertDescription>
          </Alert>
          <div className="grid gap-3">
            {status.rules.map(({ rule, eligible, reason }) => {
              const enabled = !status.settings.disabled_rules.includes(rule.id);
              return (
                <Card key={rule.id}>
                  <CardHeader>
                    <CardTitle className="text-sm">{rule.title}</CardTitle>
                    <CardDescription>
                      {rule.package} · {rule.version}
                    </CardDescription>
                    <CardAction>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--color-accent-primary)]"
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
                    </CardAction>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    <p
                      className={`text-sm ${eligible ? "text-[var(--color-success)]" : "text-muted-foreground"}`}
                    >
                      {eligible
                        ? "Eligible for next launch (subject to runtime version checks)."
                        : reason}
                    </p>
                    <p className="text-muted-foreground text-sm">{rule.reason}</p>
                    <details className="text-muted-foreground text-xs">
                      <summary className="cursor-pointer">Tested objects and limitations</summary>
                      <p className="mt-2 break-words">{rule.prefabs.join(", ")}</p>
                      <p className="mt-2">{rule.validation}</p>
                    </details>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <details className="border p-4 text-sm">
            <summary className="cursor-pointer">Recent compatibility log (local only)</summary>
            <p className="text-muted-foreground mt-2 text-xs">
              From the game&apos;s latest log; may describe a previous profile or session. An empty
              log does not mean every shader passed. No logs are uploaded.
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
