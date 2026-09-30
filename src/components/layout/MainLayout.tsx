import { useHotkey } from "@tanstack/react-hotkeys";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useCallback, useState } from "react";

import { useRestoreSafeMode } from "../../hooks/use-diagnostics";
import { installedModsQueryKey, packagesQueryKey } from "../../lib/query-keys";
import { PAGE_PATHS } from "../../lib/routes";
import { useDiagnosticsStore } from "../../store/diagnosticsStore";
import { useModStore } from "../../store/modStore";
import CommandPalette from "../command-palette";
import { CommandRuntimeProvider } from "../command-runtime";
import ModDetail from "../mods/ModDetail";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarInset, SidebarProvider } from "../ui/sidebar";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Titlebar from "./Titlebar";

export default function MainLayout() {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const selectedPackage = useModStore((s) => s.selectedPackage);
  const setSelectedPackage = useModStore((s) => s.setSelectedPackage);
  const safeModeMods = useDiagnosticsStore((s) => s.safeModeMods);
  const restoreSafeMode = useRestoreSafeMode();
  const [commandOpen, setCommandOpen] = useState(false);

  useHotkey("Mod+K", () => setCommandOpen((open) => !open));

  const fetchingPackages = useIsFetching({ queryKey: packagesQueryKey });
  const fetchingInstalled = useIsFetching({ queryKey: installedModsQueryKey });

  const handleRefresh = useCallback(async () => {
    if (pathname === PAGE_PATHS.browse || pathname === PAGE_PATHS.modpacks) {
      await queryClient.refetchQueries({ queryKey: packagesQueryKey });
    } else if (pathname === PAGE_PATHS.installed) {
      await queryClient.refetchQueries({ queryKey: installedModsQueryKey });
    }
  }, [pathname, queryClient]);

  const showRefresh =
    pathname === PAGE_PATHS.browse ||
    pathname === PAGE_PATHS.installed ||
    pathname === PAGE_PATHS.modpacks;

  const isRefreshing = fetchingPackages > 0 || fetchingInstalled > 0;

  const managesOwnScroll =
    pathname === PAGE_PATHS.browse ||
    pathname === PAGE_PATHS.modpacks ||
    pathname === PAGE_PATHS.installed ||
    pathname === PAGE_PATHS.logs ||
    pathname === PAGE_PATHS.config;

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <CommandRuntimeProvider onCommandOpenChange={setCommandOpen}>
        <Titlebar />
        <Sidebar />
        <SidebarInset data-tauri-drag-region={false} className="min-w-0 overflow-hidden">
          <Header onRefresh={showRefresh ? handleRefresh : undefined} isRefreshing={isRefreshing} />
          {safeModeMods.length > 0 && (
            <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-2 text-xs">
              <TriangleAlert className="size-3.5 shrink-0 text-[var(--color-warning)]" />
              <span className="text-muted-foreground">
                Safe mode active — {safeModeMods.length} mod
                {safeModeMods.length === 1 ? "" : "s"} disabled for crash triage.
              </span>
              <Button
                variant="outline"
                size="xs"
                onClick={() => restoreSafeMode.mutate()}
                disabled={restoreSafeMode.isPending}
              >
                Restore mods
              </Button>
            </div>
          )}
          {managesOwnScroll ? (
            <div className="min-h-0 flex-1 p-6">
              <Outlet />
            </div>
          ) : (
            <ScrollArea scrollFade className="min-h-0 flex-1">
              <div className="p-6">
                <Outlet />
              </div>
            </ScrollArea>
          )}
        </SidebarInset>

        {selectedPackage && (
          <ModDetail pkg={selectedPackage} onClose={() => setSelectedPackage(null)} />
        )}

        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      </CommandRuntimeProvider>
    </SidebarProvider>
  );
}
