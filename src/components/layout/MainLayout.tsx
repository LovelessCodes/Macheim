import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useCallback } from "react";

import { useRestoreSafeMode } from "../../hooks/use-diagnostics";
import { useProfiles } from "../../hooks/use-profiles";
import { installedModsQueryKey, packagesQueryKey } from "../../lib/query-keys";
import { useAppStore } from "../../store/appStore";
import { useDiagnosticsStore } from "../../store/diagnosticsStore";
import { useModStore } from "../../store/modStore";
import CompatibilityPage from "../compatibility/CompatibilityPage";
import ConfigEditor from "../config/ConfigEditor";
import LogsPage from "../logs/LogsPage";
import InstalledModList from "../mods/InstalledModList";
import ModDetail from "../mods/ModDetail";
import ModGrid from "../mods/ModGrid";
import ModpackBrowser from "../mods/ModpackBrowser";
import ProfileManager from "../profiles/ProfileManager";
import SavesPage from "../saves/SavesPage";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarInset, SidebarProvider } from "../ui/sidebar";
import Header from "./Header";
import SettingsPage from "./SettingsPage";
import Sidebar from "./Sidebar";

export default function MainLayout() {
  const { data: profileData } = useProfiles();
  const activeProfile = profileData?.activeProfile ?? "Default";
  const currentPage = useAppStore((s) => s.currentPage);
  const queryClient = useQueryClient();
  const selectedPackage = useModStore((s) => s.selectedPackage);
  const setSelectedPackage = useModStore((s) => s.setSelectedPackage);
  const safeModeMods = useDiagnosticsStore((s) => s.safeModeMods);
  const restoreSafeMode = useRestoreSafeMode();

  const fetchingPackages = useIsFetching({ queryKey: packagesQueryKey });
  const fetchingInstalled = useIsFetching({ queryKey: installedModsQueryKey });

  const handleRefresh = useCallback(async () => {
    if (currentPage === "browse" || currentPage === "modpacks") {
      await queryClient.refetchQueries({ queryKey: packagesQueryKey });
    } else if (currentPage === "installed") {
      await queryClient.refetchQueries({ queryKey: installedModsQueryKey });
    }
  }, [currentPage, queryClient]);

  const showRefresh =
    currentPage === "browse" || currentPage === "installed" || currentPage === "modpacks";

  const isRefreshing = fetchingPackages > 0 || fetchingInstalled > 0;

  const renderPage = () => {
    switch (currentPage) {
      case "browse":
        return <ModGrid />;
      case "installed":
        return <InstalledModList key={activeProfile} />;
      case "modpacks":
        return <ModpackBrowser />;
      case "config":
        return <ConfigEditor key={activeProfile} />;
      case "compatibility":
        return <CompatibilityPage key={activeProfile} />;
      case "profiles":
        return <ProfileManager />;
      case "saves":
        return <SavesPage />;
      case "logs":
        return <LogsPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <ModGrid />;
    }
  };

  const page = renderPage();
  const managesOwnScroll =
    currentPage === "browse" ||
    currentPage === "modpacks" ||
    currentPage === "installed" ||
    currentPage === "logs" ||
    currentPage === "config";

  return (
    <SidebarProvider className="h-svh overflow-hidden">
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
          <div className="min-h-0 flex-1 p-6">{page}</div>
        ) : (
          <ScrollArea scrollFade className="min-h-0 flex-1">
            <div className="p-6">{page}</div>
          </ScrollArea>
        )}
      </SidebarInset>

      {selectedPackage && (
        <ModDetail pkg={selectedPackage} onClose={() => setSelectedPackage(null)} />
      )}
    </SidebarProvider>
  );
}
