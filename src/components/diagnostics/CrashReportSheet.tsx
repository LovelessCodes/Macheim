import { confirm } from "@tauri-apps/plugin-dialog";
import { FileSearch, Loader2, PackageMinus, ShieldOff, TriangleAlert } from "lucide-react";

import { useAnalyzeCrashLogs, useLaunchSafeMode } from "../../hooks/use-diagnostics";
import { useInstalledMods } from "../../hooks/use-installed-mods";
import { useModToggle } from "../../hooks/use-mod-toggle";
import { crashKindLabel } from "../../lib/types";
import { useDiagnosticsStore } from "../../store/diagnosticsStore";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";

const KIND_VARIANTS: Record<string, string> = {
  game_update_mismatch: "border-[var(--color-warning)]/40 text-[var(--color-warning)]",
  missing_native_library: "border-destructive/40 text-destructive",
  patched_code: "border-accent-amber/40 text-accent-amber",
  unknown: "text-muted-foreground",
};

export default function CrashReportSheet() {
  const report = useDiagnosticsStore((state) => state.report);
  const open = useDiagnosticsStore((state) => state.reportOpen);
  const setOpen = useDiagnosticsStore((state) => state.setReportOpen);
  const { data: installedMods = [] } = useInstalledMods();
  const toggleMod = useModToggle();
  const launchSafeMode = useLaunchSafeMode();
  const analyze = useAnalyzeCrashLogs();

  if (!report) return null;

  const enabledMods = new Set(
    installedMods.filter((mod) => mod.enabled).map((mod) => mod.full_name),
  );

  const handleSafeMode = async () => {
    const confirmed = await confirm(
      "Disable every mod and launch Valheim? If it starts fine, one of your mods is the cause. " +
        "You can restore the mods from the banner afterwards.",
      { title: "Launch in Safe Mode", kind: "warning" },
    );
    if (confirmed) launchSafeMode.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-[var(--color-warning)]" />
            Crash report
          </SheetTitle>
          <SheetDescription>
            {new Date(report.analyzed_at).toLocaleString()} &middot;{" "}
            {report.modded ? "Play Modded" : "Vanilla launch"}
            {report.log_path ? ` · ${report.log_path}` : ""}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="space-y-5 p-5">
            <div className="space-y-2">
              <Badge variant="outline" className={KIND_VARIANTS[report.kind]}>
                {crashKindLabel(report.kind)}
              </Badge>
              <p className="text-muted-foreground text-sm leading-relaxed">{report.summary}</p>
              {report.stale_exception && (
                <p className="text-xs text-[var(--color-warning)]">
                  The newest logged error is not near the end of the log, so it may not be what
                  ended the session.
                </p>
              )}
              {!report.modded && (
                <p className="text-muted-foreground text-xs">
                  This was a vanilla launch, so the crash is not caused by mods.
                </p>
              )}
            </div>

            <div>
              <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                Likely culprits ({report.likely_culprits.length})
              </h4>
              {report.likely_culprits.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Could not tie the failure to a specific mod. The log tail below is the best clue.
                </p>
              ) : (
                <div className="divide-border divide-y border">
                  {report.likely_culprits.map((culprit) => (
                    <div
                      key={culprit.full_name}
                      className="flex items-center justify-between gap-3 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{culprit.full_name}</p>
                        <p className="text-muted-foreground text-xs">{culprit.reason}</p>
                      </div>
                      {enabledMods.has(culprit.full_name) && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={toggleMod.isPending}
                          onClick={() =>
                            toggleMod.mutate({ fullName: culprit.full_name, enable: false })
                          }
                        >
                          <PackageMinus />
                          Disable
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {report.exceptions.length > 0 && (
              <div>
                <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                  Errors in the log ({report.exceptions.length})
                </h4>
                <div className="space-y-2">
                  {report.exceptions.map((exception, index) => (
                    <div key={`${exception.kind}:${index}`} className="bg-muted p-3">
                      <p className="text-foreground font-mono text-xs break-words">
                        {exception.kind}: {exception.message}
                      </p>
                      {exception.frames.length > 0 && (
                        <pre className="text-muted-foreground mt-2 max-h-32 overflow-auto text-[10px] leading-relaxed whitespace-pre-wrap">
                          {exception.frames.join("\n")}
                        </pre>
                      )}
                      <p className="text-muted-foreground mt-1 text-[10px]">
                        {exception.lines_from_end} lines from the end of the log
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                Log tail ({report.loaded_plugins.length} plugins loaded)
              </h4>
              <pre className="bg-muted text-muted-foreground max-h-64 overflow-auto p-3 text-[10px] leading-relaxed whitespace-pre-wrap">
                {report.log_tail.join("\n")}
              </pre>
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t">
          <Button
            variant="outline-warning"
            size="sm"
            className="flex-1"
            onClick={() => void handleSafeMode()}
            disabled={launchSafeMode.isPending}
          >
            {launchSafeMode.isPending ? <Loader2 className="animate-spin" /> : <ShieldOff />}
            Launch Safe Mode
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => analyze.mutate()}
            disabled={analyze.isPending}
          >
            {analyze.isPending ? <Loader2 className="animate-spin" /> : <FileSearch />}
            Analyze again
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
