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
import { useAppStore } from "../../store/appStore";
import type { Page } from "../../lib/types";
import { launchModded, launchVanilla } from "../../lib/tauri";
import ProfileSelector from "../profiles/ProfileSelector";
import { toast } from "../ui/toast";

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

  const handleLaunchModded = async () => {
    try {
      await launchModded();
      toast.add({ type: "success", title: "Launching Valheim (modded)..." });
    } catch (err) {
      toast.add({
        type: "error",
        title: `Failed to launch: ${err}`,
      });
    }
  };

  const handleLaunchVanilla = async () => {
    try {
      await launchVanilla();
      toast.add({ type: "success", title: "Launching Valheim (vanilla)..." });
    } catch (err) {
      toast.add({
        type: "error",
        title: `Failed to launch: ${err}`,
      });
    }
  };

  return (
    <aside className="w-64 h-full flex flex-col bg-[var(--color-bg-sidebar)] border-r border-[var(--color-border-subtle)] shrink-0">
      {/* Logo / Title */}
      <div className="px-5 py-5 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--color-accent-amber)] to-orange-700 flex items-center justify-center">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-[var(--color-text-primary)] leading-tight">
              MACHEIM
            </h1>
            <p className="text-[10px] font-medium tracking-widest text-[var(--color-accent-amber)] uppercase">
              Mod Manager
            </p>
          </div>
        </div>
      </div>

      {/* Profile Selector */}
      <div className="px-3 py-3 border-b border-[var(--color-border-subtle)]">
        <ProfileSelector />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = currentPage === item.page;
          const Icon = item.icon;

          return (
            <button
              key={item.page}
              onClick={() => setCurrentPage(item.page)}
              className={`
                w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                transition-all duration-150 cursor-pointer
                ${
                  isActive
                    ? "bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)]"
                }
              `}
            >
              <Icon
                size={18}
                className={
                  isActive
                    ? "text-[var(--color-accent-primary)]"
                    : "text-[var(--color-text-muted)]"
                }
              />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Launch Buttons */}
      <div className="px-3 py-4 border-t border-[var(--color-border-subtle)] space-y-2">
        <button
          onClick={handleLaunchModded}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold
            bg-gradient-to-r from-[var(--color-accent-amber)] to-orange-600
            text-white shadow-md shadow-orange-900/30
            hover:from-[var(--color-accent-amber-hover)] hover:to-orange-700
            active:scale-[0.98] transition-all duration-150 cursor-pointer"
        >
          <Play size={16} />
          Play Modded
        </button>
        <button
          onClick={handleLaunchVanilla}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            border border-[var(--color-border-default)] text-[var(--color-text-secondary)]
            hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]
            active:scale-[0.98] transition-all duration-150 cursor-pointer"
        >
          <Wrench size={15} />
          Play Vanilla
        </button>
      </div>
    </aside>
  );
}
