import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useProfiles } from "../../hooks/use-profiles";
import { installedModsQueryKey, packagesQueryKey } from "../../lib/query-keys";
import { useAppStore } from "../../store/appStore";
import { useModStore } from "../../store/modStore";
import CompatibilityPage from "../compatibility/CompatibilityPage";
import ConfigEditor from "../config/ConfigEditor";
import InstalledModList from "../mods/InstalledModList";
import ModDetail from "../mods/ModDetail";
import ModGrid from "../mods/ModGrid";
import ModpackBrowser from "../mods/ModpackBrowser";
import ProfileManager from "../profiles/ProfileManager";
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
    currentPage === "config";

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar />
      <SidebarInset data-tauri-drag-region={false} className="min-w-0 overflow-hidden">
        <Header onRefresh={showRefresh ? handleRefresh : undefined} isRefreshing={isRefreshing} />
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
