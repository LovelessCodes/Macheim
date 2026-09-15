import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ThunderstorePackage, PackageDetail } from "../../lib/types";
import { useModStore } from "../../store/modStore";
import { useAppStore } from "../../store/appStore";
import { installMod, uninstallMod, getInstalledMods, getPackageDetails } from "../../lib/tauri";
import ModDetailContent from "./ModDetailContent";
import ModDetailActions from "./ModDetailActions";

interface ModDetailProps {
  pkg: ThunderstorePackage;
  onClose: () => void;
}

export default function ModDetail({ pkg, onClose }: ModDetailProps) {
  const installedMods = useModStore((s) => s.installedMods);
  const isInstallingMod = useModStore((s) => s.isInstallingMod);
  const setInstallingMod = useModStore((s) => s.setInstallingMod);
  const setInstalledMods = useModStore((s) => s.setInstalledMods);
  const addToast = useAppStore((s) => s.addToast);

  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Fetch full details on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingDetail(true);
    setDetailError(null);
    getPackageDetails(pkg.full_name)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => {
        if (!cancelled) setDetailError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pkg.full_name]);

  const isInstalled = installedMods.some((m) => m.full_name === pkg.full_name);
  const isInstalling = isInstallingMod === pkg.full_name;

  const handleInstall = async () => {
    if (isInstalled || isInstalling) return;
    setInstallingMod(pkg.full_name);
    try {
      await installMod(pkg.full_name, pkg.version_number);
      const mods = await getInstalledMods();
      setInstalledMods(mods);
      addToast({ type: "success", message: `Installed ${pkg.name}` });
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to install ${pkg.name}: ${err}`,
      });
    } finally {
      setInstallingMod(null);
    }
  };

  const handleUninstall = async () => {
    try {
      await uninstallMod(pkg.full_name);
      const mods = await getInstalledMods();
      setInstalledMods(mods);
      addToast({ type: "info", message: `Uninstalled ${pkg.name}` });
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to uninstall ${pkg.name}: ${err}`,
      });
    }
  };

  const installedVersion = installedMods.find(
    (m) => m.full_name === pkg.full_name
  )?.version;

  return (
    <>
      <button
        type="button"
        aria-label="Close mod details"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-[var(--color-bg-sidebar)] border-l border-[var(--color-border-default)] shadow-2xl animate-[slideInRight_0.2s_ease-out] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)]">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Mod Details
          </h2>
          <button
            onClick={onClose}
            aria-label="Close mod details"
            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-card)] transition-colors cursor-pointer"
          >
            <X size={18} className="text-[var(--color-text-muted)]" />
          </button>
        </div>

        <ModDetailContent
          pkg={pkg}
          detail={detail}
          loadingDetail={loadingDetail}
          detailError={detailError}
        />

        <ModDetailActions
          pkg={pkg}
          isInstalled={isInstalled}
          isInstalling={isInstalling}
          installedVersion={installedVersion}
          onInstall={handleInstall}
          onUninstall={handleUninstall}
        />

        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideInRight {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>
      </div>
    </>
  );
}
