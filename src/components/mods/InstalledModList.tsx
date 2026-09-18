import { confirm } from "@tauri-apps/plugin-dialog";
import { cn } from "cn";
import {
  ArrowUpCircle,
  Clock,
  FileArchive,
  Package,
  Trash2,
  Power,
  PowerOff,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useEnqueueInstall } from "../../hooks/use-download-queue";
import { useInstallFromFile } from "../../hooks/use-install-from-file";
import { useInstalledMods } from "../../hooks/use-installed-mods";
import { useModConflicts } from "../../hooks/use-mod-conflicts";
import { useModToggle } from "../../hooks/use-mod-toggle";
import { useModUninstall } from "../../hooks/use-mod-uninstall";
import { useUpdateMods } from "../../hooks/use-package-install";
import { usePackages } from "../../hooks/use-packages";
import { useSyncMods } from "../../hooks/use-sync-mods";
import { listUnmanagedMods } from "../../lib/tauri";
import type { InstalledMod } from "../../lib/types";
import { isDownloadActive, isDownloadPending } from "../../lib/types";
import { useDownloadStore } from "../../store/downloadStore";
import { useModStore } from "../../store/modStore";
import { ListSkeleton } from "../common/LoadingSkeleton";
import VirtualList from "../common/VirtualList";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Switch } from "../ui/switch";
import { toast } from "../ui/toast";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import ModConflictsPanel from "./ModConflictsPanel";
import ModIcon from "./ModIcon";
import ModSearchInput from "./ModSearchInput";

type ModFilter = "all" | "enabled" | "disabled";

export default function InstalledModList() {
  const { data: installedMods = [], isPending: isLoading } = useInstalledMods();
  const { data: conflicts } = useModConflicts();
  const { data: packages = [] } = usePackages();
  const { uninstall, uninstallingFullName } = useModUninstall();
  const enqueue = useEnqueueInstall();
  const { pickFiles } = useInstallFromFile();
  const updateModsMutation = useUpdateMods();
  const toggleModMutation = useModToggle();
  const syncModsMutation = useSyncMods();
  const setSelectedPackage = useModStore((s) => s.setSelectedPackage);
  const queuedNames = useDownloadStore(
    useShallow((state) =>
      state.items.filter((item) => isDownloadPending(item.status)).map((item) => item.full_name),
    ),
  );
  const activeNames = useDownloadStore(
    useShallow((state) =>
      state.items.filter((item) => isDownloadActive(item.status)).map((item) => item.full_name),
    ),
  );
  const openDownloads = useDownloadStore((s) => s.setPanelOpen);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ModFilter>("all");

  const togglingMod = toggleModMutation.isPending
    ? (toggleModMutation.variables?.fullName ?? null)
    : null;
  const syncing = syncModsMutation.isPending;
  const updatingAll = updateModsMutation.isPending;

  const packageByFullName = useMemo(
    () => new Map(packages.map((pkg) => [pkg.full_name, pkg])),
    [packages],
  );

  const updatable = useMemo(
    () =>
      installedMods.flatMap((mod) => {
        const pkg = packageByFullName.get(mod.full_name);
        return pkg && pkg.version_number !== mod.version
          ? [{ fullName: mod.full_name, name: mod.name, version: pkg.version_number }]
          : [];
      }),
    [installedMods, packageByFullName],
  );

  const handleUpdateAll = () => {
    updateModsMutation.mutate(updatable);
  };

  const openDetail = (mod: InstalledMod) => {
    const pkg = packageByFullName.get(mod.full_name);
    if (!pkg) {
      toast.add({
        type: "info",
        title: `No store listing found for ${mod.name}`,
      });
      return;
    }
    setSelectedPackage(pkg);
  };

  const handleToggle = (fullName: string, currentEnabled: boolean) => {
    toggleModMutation.mutate({ fullName, enable: !currentEnabled });
  };

  const handleUninstall = async (mod: InstalledMod, skipConfirm: boolean) => {
    if (!skipConfirm) {
      const confirmed = await confirm(`Uninstall "${mod.name}"? This removes its files.`, {
        title: "Uninstall mod",
        kind: "warning",
      });
      if (!confirmed) return;
    }
    uninstall(mod.full_name, mod.name);
  };

  const handleSync = async () => {
    try {
      // Check for unmanaged mods before cleaning
      const unmanaged = await listUnmanagedMods();
      let doClean = false;
      if (unmanaged.length > 0) {
        doClean = await confirm(
          `The following ${unmanaged.length} mod(s) will be moved to BepInEx/.macheim-clean-backups (recoverable):\n\n` +
            unmanaged.join("\n") +
            "\n\nProceed with cleanup?",
          { title: "Remove Unmanaged Mods?", kind: "warning" },
        );
        if (!doClean) return;
      }
      syncModsMutation.mutate({
        cleanUnmanaged: doClean,
        approvedUnmanaged: doClean ? unmanaged : [],
      });
    } catch (err) {
      toast.add({ type: "error", title: `Sync failed: ${String(err)}` });
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

        <div className="text-muted-foreground ms-auto flex flex-wrap items-center gap-3 text-xs">
          <span className="text-foreground font-medium">{installedMods.length} mods total</span>
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
          {updatable.length > 0 && (
            <Button
              variant="accent-primary"
              size="sm"
              onClick={handleUpdateAll}
              disabled={updatingAll || syncing}
            >
              {updatingAll ? <Loader2 className="animate-spin" /> : <ArrowUpCircle />}
              Update All ({updatable.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void pickFiles()} disabled={syncing}>
            <FileArchive />
            Install from file
          </Button>
          <Button variant="amber" size="sm" onClick={handleSync} disabled={syncing || updatingAll}>
            {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Sync & Clean
          </Button>
        </div>
      </div>

      <ModConflictsPanel report={conflicts ?? null} />

      {/* Mod List */}
      {isLoading && installedMods.length === 0 ? (
        <ScrollArea scrollFade className="min-h-0 flex-1">
          <ListSkeleton rows={8} />
        </ScrollArea>
      ) : (
        <VirtualList
          items={filtered}
          keyOf={(mod) => mod.full_name}
          estimateRowHeight={66}
          renderItem={(mod) => {
            const pkg = packageByFullName.get(mod.full_name);
            const isQueued = queuedNames.includes(mod.full_name);
            const isUpdating = activeNames.includes(mod.full_name);
            return (
              <div
                onClick={() => openDetail(mod)}
                className={cn(
                  "flex cursor-pointer items-center gap-4 border bg-card p-3 transition-colors hover:bg-muted/40",
                  !mod.enabled && "opacity-50",
                )}
              >
                <ModIcon src={mod.icon} alt={mod.name} className="size-10" iconClassName="size-4" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-foreground truncate text-sm font-semibold">{mod.name}</h4>
                    <Badge variant="outline" className="shrink-0">
                      v{mod.version}
                    </Badge>
                    {!mod.enabled && (
                      <Badge variant="secondary" className="shrink-0">
                        Disabled
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground truncate text-xs">by {mod.author}</p>
                </div>

                {pkg && pkg.version_number !== mod.version && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="outline-accent-primary"
                          size="icon-sm"
                          disabled={isUpdating || updatingAll}
                          aria-label={
                            isQueued
                              ? `${mod.name} update is queued`
                              : `Update ${mod.name} to v${pkg.version_number}`
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isQueued) {
                              openDownloads(true);
                              return;
                            }
                            void enqueue({
                              fullName: mod.full_name,
                              name: mod.name,
                              version: pkg.version_number,
                            });
                          }}
                        />
                      }
                    >
                      {isUpdating ? (
                        <Loader2 className="animate-spin" />
                      ) : isQueued ? (
                        <Clock />
                      ) : (
                        <ArrowUpCircle />
                      )}
                    </TooltipTrigger>
                    <TooltipContent>
                      {isQueued
                        ? "Update queued — open downloads"
                        : `Update to v${pkg.version_number}`}
                    </TooltipContent>
                  </Tooltip>
                )}

                <Switch
                  checked={mod.enabled}
                  disabled={togglingMod === mod.full_name}
                  onCheckedChange={() => handleToggle(mod.full_name, mod.enabled)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`${mod.enabled ? "Disable" : "Enable"} ${mod.name}`}
                  className="data-checked:bg-[var(--color-success)]"
                />

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleUninstall(mod, e.shiftKey);
                        }}
                        disabled={uninstallingFullName === mod.full_name}
                        aria-label={`Uninstall ${mod.name}`}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      />
                    }
                  >
                    {uninstallingFullName === mod.full_name ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                  </TooltipTrigger>
                  <TooltipContent>Uninstall (hold Shift to skip confirmation)</TooltipContent>
                </Tooltip>
              </div>
            );
          }}
          empty={
            installedMods.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Package size={48} className="text-muted-foreground mb-4" />
                <h3 className="text-foreground mb-1 text-lg font-semibold">No mods installed</h3>
                <p className="text-muted-foreground text-sm">
                  Go to Browse Mods or Modpacks to install some.
                </p>
              </div>
            ) : (
              <div className="text-muted-foreground py-10 text-center text-sm">
                No mods matching &quot;{search}&quot;
              </div>
            )
          }
        />
      )}
    </div>
  );
}
