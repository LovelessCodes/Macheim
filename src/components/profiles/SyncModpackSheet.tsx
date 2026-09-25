import { useQueryClient } from "@tanstack/react-query";
import { confirm } from "@tauri-apps/plugin-dialog";
import { cn } from "cn";
import { AlertTriangle, ArrowRight, Loader2, Pin, RefreshCw } from "lucide-react";
import { useState } from "react";

import { useEnqueueInstall } from "../../hooks/use-download-queue";
import { useProfiles, useSwitchProfile } from "../../hooks/use-profiles";
import { useCompleteSubscriptionSync, useSyncPlan } from "../../hooks/use-subscriptions";
import { installedModsQueryKey, modConflictsQueryKey } from "../../lib/query-keys";
import { uninstallMods } from "../../lib/tauri";
import type { Subscription, SyncItem } from "../../lib/types";
import { Button } from "../ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Switch } from "../ui/switch";
import { notify } from "../ui/toast";

interface SyncModpackSheetProps {
  profileName: string;
  subscription: Subscription;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ItemRow({ item, toVersion = true }: { item: SyncItem; toVersion?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-foreground truncate">{item.name}</span>
      <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
        {item.from_version ? `v${item.from_version}` : null}
        {item.from_version && item.to_version ? <ArrowRight className="size-3" /> : null}
        {toVersion && item.to_version ? `v${item.to_version}` : null}
      </span>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <h4 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {title}
      </h4>
      <ul className="grid gap-1">{children}</ul>
    </div>
  );
}

export default function SyncModpackSheet({
  profileName,
  subscription,
  open,
  onOpenChange,
}: SyncModpackSheetProps) {
  const queryClient = useQueryClient();
  const { data } = useProfiles();
  const switchProfileMutation = useSwitchProfile();
  const enqueueInstall = useEnqueueInstall();
  const completeSyncMutation = useCompleteSubscriptionSync();
  const { data: plan, isPending, error, refetch } = useSyncPlan(profileName, open);

  const [removeDropped, setRemoveDropped] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const activeProfile = data?.activeProfile ?? "Default";
  const isBusy = isSyncing || completeSyncMutation.isPending;

  const handleSync = async () => {
    if (!plan || plan.up_to_date) return;

    const removals = removeDropped ? plan.remove.map((item) => item.full_name) : [];
    const installs = [...plan.add, ...plan.update];
    setIsSyncing(true);
    try {
      if (profileName !== activeProfile) {
        const proceed = await confirm(
          `Switch to "${profileName}" and sync it with ${plan.modpack} v${plan.to_version}?` +
            (removals.length > 0
              ? ` ${removals.length} mod${removals.length === 1 ? "" : "s"} will be removed.`
              : ""),
          { title: "Sync modpack", kind: "info" },
        );
        if (!proceed) return;
        await switchProfileMutation.mutateAsync(profileName);
      }

      if (removals.length > 0) {
        const result = await uninstallMods(removals);
        if (result.failed.length > 0) {
          throw new Error(
            `Could not remove ${result.failed.length} mod${result.failed.length === 1 ? "" : "s"}: ${result.failed.join(", ")}`,
          );
        }
        await queryClient.invalidateQueries({ queryKey: installedModsQueryKey });
        await queryClient.invalidateQueries({ queryKey: modConflictsQueryKey });
      }

      for (const item of installs) {
        await enqueueInstall(
          {
            fullName: item.full_name,
            name: item.name,
            version: item.to_version,
            kind: "mod",
          },
          { silent: true },
        );
      }

      await completeSyncMutation.mutateAsync({
        profile: profileName,
        version: plan.to_version,
        mods: plan.pack_mods,
      });

      const parts = [
        installs.length > 0
          ? `queued ${installs.length} download${installs.length === 1 ? "" : "s"}`
          : null,
        removals.length > 0
          ? `removed ${removals.length} mod${removals.length === 1 ? "" : "s"}`
          : null,
      ].filter(Boolean);
      notify("modpack-sync", {
        type: "success",
        title: `Synced "${profileName}" to ${plan.modpack} v${plan.to_version}`,
        description: parts.length > 0 ? parts.join(", ") : undefined,
        timeout: 8000,
      });
      onOpenChange(false);
    } catch (err) {
      notify("modpack-sync", {
        type: "error",
        title: `Sync failed: ${err instanceof Error ? err.message : String(err)}`,
        timeout: 8000,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <RefreshCw className="size-4" />
            Sync {profileName}
          </SheetTitle>
          <SheetDescription>
            {plan
              ? `Bring the profile in step with ${plan.modpack} — v${plan.from_version} to v${plan.to_version}. Pins, manual mods, extra mods and configs are left alone.`
              : `Bring the profile in step with ${subscription.modpack}.`}
          </SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4">
          {isPending ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Checking the pack's latest version…
            </p>
          ) : error ? (
            <div className="grid gap-2">
              <p className="text-destructive text-sm">{String(error)}</p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          ) : plan ? (
            <>
              {plan.up_to_date ? (
                <p className="text-muted-foreground text-sm">
                  Up to date with v{plan.to_version}. Nothing to do.
                </p>
              ) : (
                <>
                  {plan.add.length > 0 && (
                    <Section title={`Install (${plan.add.length})`}>
                      {plan.add.map((item) => (
                        <ItemRow key={item.full_name} item={item} />
                      ))}
                    </Section>
                  )}
                  {plan.update.length > 0 && (
                    <Section title={`Update (${plan.update.length})`}>
                      {plan.update.map((item) => (
                        <ItemRow key={item.full_name} item={item} />
                      ))}
                    </Section>
                  )}
                  {plan.remove.length > 0 && (
                    <Section title={`Remove (${plan.remove.length})`}>
                      {plan.remove.map((item) => (
                        <ItemRow key={item.full_name} item={item} toVersion={false} />
                      ))}
                    </Section>
                  )}
                  {plan.remove.length > 0 && (
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground text-xs">
                        Remove mods the pack dropped
                      </span>
                      <Switch
                        size="sm"
                        checked={removeDropped}
                        onCheckedChange={(checked) => setRemoveDropped(checked)}
                        aria-label="Remove mods the pack dropped"
                      />
                    </label>
                  )}
                </>
              )}

              {plan.kept.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  {plan.kept.length} extra mod{plan.kept.length === 1 ? "" : "s"} kept (not part of
                  the pack): {plan.kept.join(", ")}
                </p>
              )}

              {plan.pinned_skips.length > 0 && (
                <div className="grid gap-1">
                  <p className="flex items-center gap-1 text-xs text-[var(--color-accent-amber)]">
                    <Pin className="size-3" />
                    {plan.pinned_skips.length} pinned mod
                    {plan.pinned_skips.length === 1 ? "" : "s"} skipped — unpin to sync:
                  </p>
                  <ul className="text-muted-foreground grid gap-1 text-xs">
                    {plan.pinned_skips.map((item) => (
                      <li key={item.full_name} className="truncate">
                        {item.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {plan.manual_conflicts.length > 0 && (
                <div className="grid gap-1">
                  <p className="text-destructive flex items-center gap-1 text-xs">
                    <AlertTriangle className="size-3" />
                    {plan.manual_conflicts.length} manually installed mod
                    {plan.manual_conflicts.length === 1 ? "" : "s"} block the sync — reinstall from
                    the store to manage them:
                  </p>
                  <ul className="text-muted-foreground grid gap-1 text-xs">
                    {plan.manual_conflicts.map((item) => (
                      <li key={item.full_name} className="truncate">
                        {item.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {plan.bepinex && (
                <p
                  className={cn(
                    "text-xs",
                    plan.bepinex.outdated ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  Pack expects BepInExPack v{plan.bepinex.expected}
                  {plan.bepinex.installed
                    ? `; v${plan.bepinex.installed} is installed`
                    : " (installed version unknown)"}
                  {plan.bepinex.outdated ? " — update BepInEx from Settings." : "."}
                </p>
              )}
            </>
          ) : null}
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isBusy}>
            Close
          </Button>
          <Button
            variant="accent-primary"
            onClick={() => void handleSync()}
            disabled={!plan || plan.up_to_date || isBusy}
          >
            {isBusy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Sync
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
