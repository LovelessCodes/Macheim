import { useCallback } from "react";

import { fetchPackages, getInstalledMods } from "../../lib/tauri";
import { useAppStore } from "../../store/appStore";
import { useModStore } from "../../store/modStore";
import { useProfileStore } from "../../store/profileStore";
import CompatibilityPage from "../compatibility/CompatibilityPage";
import ConfigEditor from "../config/ConfigEditor";
import InstalledModList from "../mods/InstalledModList";
import ModDetail from "../mods/ModDetail";
import ModGrid from "../mods/ModGrid";
import ModpackBrowser from "../mods/ModpackBrowser";
import ProfileManager from "../profiles/ProfileManager";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarInset, SidebarProvider } from "../ui/sidebar";
import { toast } from "../ui/toast";
import Header from "./Header";
import SettingsPage from "./SettingsPage";
import Sidebar from "./Sidebar";

export default function MainLayout() {
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const currentPage = useAppStore((s) => s.currentPage);
  const setPackages = useModStore((s) => s.setPackages);
  const setInstalledMods = useModStore((s) => s.setInstalledMods);
  const setLoadingPackages = useModStore((s) => s.setLoadingPackages);
  const setLoadingInstalled = useModStore((s) => s.setLoadingInstalled);
  const isLoadingPackages = useModStore((s) => s.isLoadingPackages);
  const isLoadingInstalled = useModStore((s) => s.isLoadingInstalled);
  const selectedPackage = useModStore((s) => s.selectedPackage);
  const setSelectedPackage = useModStore((s) => s.setSelectedPackage);

  const handleRefresh = useCallback(async () => {
    if (currentPage === "browse" || currentPage === "modpacks") {
      setLoadingPackages(true);
      try {
        const pkgs = await fetchPackages();
        setPackages(pkgs);
      } catch (err) {
        toast.add({
          type: "error",
          title: `Failed to fetch packages: ${err}`,
        });
      } finally {
        setLoadingPackages(false);
      }
    } else if (currentPage === "installed") {
      setLoadingInstalled(true);
      try {
        const mods = await getInstalledMods();
        setInstalledMods(mods);
      } catch (err) {
        toast.add({
          type: "error",
          title: `Failed to load installed mods: ${err}`,
        });
      } finally {
        setLoadingInstalled(false);
      }
    }
  }, [currentPage, setLoadingPackages, setPackages, setLoadingInstalled, setInstalledMods]);

  const showRefresh =
    currentPage === "browse" || currentPage === "installed" || currentPage === "modpacks";

  const isRefreshing = isLoadingPackages || isLoadingInstalled;

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
