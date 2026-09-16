import { useEffect, useState } from "react";
import { cn } from "cn";
import {
  Package,
  Trash2,
  Power,
  PowerOff,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { ListSkeleton } from "../common/LoadingSkeleton";
import VirtualList from "../common/VirtualList";
import ModSearchInput from "./ModSearchInput";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { useModStore } from "../../store/modStore";
import { toast } from "../ui/toast";
import { confirm } from "@tauri-apps/plugin-dialog";
import { Package, Trash2, Search, Power, PowerOff, RefreshCw, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getInstalledMods,
  toggleMod,
  uninstallMod,
  syncMods,
  listUnmanagedMods,
} from "../../lib/tauri";
import { useAppStore } from "../../store/appStore";
import { useModStore } from "../../store/modStore";
import { ListSkeleton } from "../common/LoadingSkeleton";

type ModFilter = "all" | "enabled" | "disabled";

export default function InstalledModList() {
  const installedMods = useModStore((s) => s.installedMods);
  const setInstalledMods = useModStore((s) => s.setInstalledMods);
  const isLoading = useModStore((s) => s.isLoadingInstalled);
  const setLoading = useModStore((s) => s.setLoadingInstalled);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ModFilter>("all");
  const [togglingMod, setTogglingMod] = useState<string | null>(null);
  const [uninstallingMod, setUninstallingMod] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const mods = await getInstalledMods();
        if (!cancelled) setInstalledMods(mods);
      } catch (err) {
        if (!cancelled) {
          toast.add({
            type: "error",
            title: `Failed to load installed mods: ${err}`,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [setInstalledMods, setLoading]);

  const handleToggle = async (fullName: string, currentEnabled: boolean) => {
    setTogglingMod(fullName);
    try {
      await toggleMod(fullName, !currentEnabled);
      setInstalledMods(
        installedMods.map((m) =>
          m.full_name === fullName ? { ...m, enabled: !currentEnabled } : m,
        ),
      );
    } catch (err) {
      toast.add({
        type: "error",
        title: `Failed to toggle mod: ${err}`,
      });
    } finally {
      setTogglingMod(null);
    }
  };

  const handleUninstall = async (fullName: string, name: string) => {
    setUninstallingMod(fullName);
    try {
      await uninstallMod(fullName);
      setInstalledMods(installedMods.filter((m) => m.full_name !== fullName));
      toast.add({ type: "info", title: `Uninstalled ${name}` });
    } catch (err) {
      toast.add({
        type: "error",
        title: `Failed to uninstall ${name}: ${err}`,
      });
    } finally {
      setUninstallingMod(null);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      // Check for unmanaged mods before cleaning
      const unmanaged = await listUnmanagedMods();
      let doClean = false;
      if (unmanaged.length > 0) {
        doClean = await confirm(
          `The following ${unmanaged.length} mod(s) will be moved to BepInEx/.macheim-clean-backups (recoverable):\n\n` +
            unmanaged.join("\n") +
            "\n\nProceed with cleanup?",
          { title: "Remove Unmanaged Mods?", kind: "warning" }
        );
        if (!doClean) return;
      }
      const result = await syncMods(doClean, doClean ? unmanaged : []);
      const msgs: string[] = [];
      if (result.reinstalled.length > 0)
        msgs.push(`${result.reinstalled.length} reinstalled`);
      if (result.cleaned.length > 0)
        msgs.push(`${result.cleaned.length} cleaned`);
      if (result.failed.length > 0)
        msgs.push(`${result.failed.length} failed`);
      toast.add({
        type: result.failed.length > 0 ? "warning" : "success",
        title: `Sync complete: ${msgs.join(", ") || "all up to date"}`,
      });
      const mods = await getInstalledMods();
      setInstalledMods(mods);
    } catch (err) {
      toast.add({ type: "error", title: `Sync failed: ${err}` });
    } finally {
      setSyncing(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = installedMods.filter((m) => {
    if (filter === "enabled" && !m.enabled) return false;
    if (filter === "disabled" && m.enabled) return false;
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.full_name.toLowerCase().includes(q) ||
      m.author.toLowerCase().includes(q)
    );
  });

  const enabledCount = installedMods.filter((m) => m.enabled).length;
  const disabledCount = installedMods.length - enabledCount;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search + Filters + Stats */}
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
        <ModSearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search installed mods..."
          className="w-full sm:w-72"
        />

        <ToggleGroup
          variant="outline"
          size="sm"
          value={[filter]}
          onValueChange={(value) => {
            if (value[0]) setFilter(value[0] as ModFilter);
          }}
          aria-label="Filter installed mods"
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="enabled">
            <Power />
            Enabled
          </ToggleGroupItem>
          <ToggleGroupItem value="disabled">
            <PowerOff />
            Disabled
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="ms-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {installedMods.length} mods total
          </span>
          <span className="flex items-center gap-1 text-[var(--color-success)]">
            <Power className="size-3" />
            {enabledCount} enabled
          </span>
          {disabledCount > 0 && (
            <span className="flex items-center gap-1">
              <PowerOff className="size-3" />
              {disabledCount} disabled
            </span>
          )}
          <Button
            variant="amber"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Sync & Clean
          </Button>
        </div>
      </div>

      {/* Mod List */}
      {isLoading && installedMods.length === 0 ? (
        <ScrollArea className="min-h-0 flex-1">
          <ListSkeleton rows={8} />
        </ScrollArea>
      ) : (
        <VirtualList
          items={filtered}
          keyOf={(mod) => mod.full_name}
          estimateRowHeight={66}
          renderItem={(mod) => (
            <div
              className={cn(
                "flex items-center gap-4 border bg-card p-3",
                !mod.enabled && "opacity-50"
              )}
            >
              {mod.icon ? (
                <img
                  src={mod.icon}
                  alt={mod.name}
                  className="size-10 shrink-0 bg-muted object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center bg-muted">
                  <Package className="size-4 text-muted-foreground" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="truncate text-sm font-semibold text-foreground">
                    {mod.name}
                  </h4>
                  <Badge variant="outline" className="shrink-0">
                    v{mod.version}
                  </Badge>
                  {!mod.enabled && (
                    <Badge variant="secondary" className="shrink-0">
                      Disabled
                    </Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  by {mod.author}
                </p>
              </div>

              <Switch
                checked={mod.enabled}
                disabled={togglingMod === mod.full_name}
                onCheckedChange={() => handleToggle(mod.full_name, mod.enabled)}
                aria-label={`${mod.enabled ? "Disable" : "Enable"} ${mod.name}`}
                className="data-checked:bg-[var(--color-success)]"
              />

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleUninstall(mod.full_name, mod.name)}
                disabled={uninstallingMod === mod.full_name}
                title="Uninstall"
                aria-label={`Uninstall ${mod.name}`}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                {uninstallingMod === mod.full_name ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
              </Button>
            </div>
          )}
          empty={
            installedMods.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Package size={48} className="mb-4 text-muted-foreground" />
                <h3 className="mb-1 text-lg font-semibold text-foreground">
                  No mods installed
                </h3>
                <p className="text-sm text-muted-foreground">
                  Go to Browse Mods or Modpacks to install some.
                </p>
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No mods matching &quot;{search}&quot;
              </div>
            )
          }
        />
      )}
    </div>
  );
}
