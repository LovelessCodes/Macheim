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
import Header from "./Header";
import SettingsPage from "./SettingsPage";
import Sidebar from "./Sidebar";

export default function MainLayout() {
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const currentPage = useAppStore((s) => s.currentPage);
  const addToast = useAppStore((s) => s.addToast);
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
        addToast({
          type: "error",
          message: `Failed to fetch packages: ${err}`,
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
        addToast({
          type: "error",
          message: `Failed to load installed mods: ${err}`,
        });
      } finally {
        setLoadingInstalled(false);
      }
    }
  }, [
    currentPage,
    setLoadingPackages,
    setPackages,
    setLoadingInstalled,
    setInstalledMods,
    addToast,
  ]);

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

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onRefresh={showRefresh ? handleRefresh : undefined} isRefreshing={isRefreshing} />
        <main className="flex-1 overflow-y-auto p-6">{renderPage()}</main>
      </div>

      {selectedPackage && (
        <ModDetail pkg={selectedPackage} onClose={() => setSelectedPackage(null)} />
      )}
    </div>
  );
}
