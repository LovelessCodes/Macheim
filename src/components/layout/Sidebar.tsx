import {
  Package,
  Download,
  Layers,
  Settings,
  Play,
  User,
  Wrench,
  FileText,
  Shield,
} from "lucide-react";

import { launchModded, launchVanilla } from "../../lib/tauri";
import type { Page } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import ProfileSelector from "../profiles/ProfileSelector";

interface NavItem {
  page: Page;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const navItems: NavItem[] = [
  { page: "browse", label: "Browse Mods", icon: Package },
  { page: "installed", label: "Installed Mods", icon: Download },
  { page: "modpacks", label: "Modpacks", icon: Layers },
  { page: "config", label: "Config Editor", icon: FileText },
  { page: "compatibility", label: "Mac Compatibility", icon: Shield },
  { page: "profiles", label: "Profiles", icon: User },
  { page: "settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const currentPage = useAppStore((s) => s.currentPage);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const addToast = useAppStore((s) => s.addToast);

  const handleLaunchModded = async () => {
    try {
      await launchModded();
      addToast({ type: "success", message: "Launching Valheim (modded)..." });
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to launch: ${err}`,
      });
    }
  };

  const handleLaunchVanilla = async () => {
    try {
      await launchVanilla();
      addToast({ type: "success", message: "Launching Valheim (vanilla)..." });
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to launch: ${err}`,
      });
    }
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-sidebar)]">
      {/* Logo / Title */}
      <div className="border-b border-[var(--color-border-subtle)] px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--color-accent-amber)] to-orange-700">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm leading-tight font-bold tracking-wide text-[var(--color-text-primary)]">
              MACHEIM
            </h1>
            <p className="text-[10px] font-medium tracking-widest text-[var(--color-accent-amber)] uppercase">
              Mod Manager
            </p>
          </div>
        </div>
      </div>

      {/* Profile Selector */}
      <div className="border-b border-[var(--color-border-subtle)] px-3 py-3">
        <ProfileSelector />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {navItems.map((item) => {
          const isActive = currentPage === item.page;
          const Icon = item.icon;

          return (
            <button
              key={item.page}
              onClick={() => setCurrentPage(item.page)}
              className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
              } `}
            >
              <Icon
                size={18}
                className={
                  isActive ? "text-[var(--color-accent-primary)]" : "text-[var(--color-text-muted)]"
                }
              />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Launch Buttons */}
      <div className="space-y-2 border-t border-[var(--color-border-subtle)] px-3 py-4">
        <button
          onClick={handleLaunchModded}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[var(--color-accent-amber)] to-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-900/30 transition-all duration-150 hover:from-[var(--color-accent-amber-hover)] hover:to-orange-700 active:scale-[0.98]"
        >
          <Play size={16} />
          Play Modded
        </button>
        <button
          onClick={handleLaunchVanilla}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-all duration-150 hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] active:scale-[0.98]"
        >
          <Wrench size={15} />
          Play Vanilla
        </button>
      </div>
    </aside>
  );
}
