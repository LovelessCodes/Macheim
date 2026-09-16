import type { LucideIcon } from "lucide-react";
import {
  Download,
  FileText,
  Layers,
  Package,
  Play,
  Settings,
  Shield,
  User,
  Wrench,
} from "lucide-react";

import { Page } from "@/lib/types";

import { useAppVersion } from "../../hooks/use-app-version";
import { launchModded, launchVanilla } from "../../lib/tauri";
import { useAppStore } from "../../store/appStore";
import ProfileSelector from "../profiles/ProfileSelector";
import { Button } from "../ui/button";
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "../ui/sidebar";
import { toast } from "../ui/toast";

interface NavItem {
  page: Page;
  label: string;
  icon: LucideIcon;
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
  const version = useAppVersion();

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
    <SidebarRoot collapsible="icon">
      <SidebarHeader className="pt-8 select-none" data-tauri-drag-region>
        <div className="pointer-events-none flex items-center gap-2.5 px-1 group-data-[collapsible=icon]:px-0">
          <img src="/icon.png" alt="Macheim" className="size-8 shrink-0" />
          <div className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="flex items-baseline gap-1.5">
              <span className="truncate text-sm font-bold tracking-wide">MACHEIM</span>
              {version && (
                <span className="text-muted-foreground text-[10px] font-medium">v{version}</span>
              )}
            </span>
            <span className="truncate text-[10px] font-medium tracking-widest text-[var(--color-accent-amber)] uppercase">
              Mod Manager
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupContent>
          <ProfileSelector />
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.page}>
                    <SidebarMenuButton
                      isActive={currentPage === item.page}
                      tooltip={item.label}
                      onClick={() => setCurrentPage(item.page)}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <Button
          variant="amber"
          className="w-full group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0"
          onClick={handleLaunchModded}
        >
          <Play />
          <span className="group-data-[collapsible=icon]:hidden">Play Modded</span>
        </Button>
        <Button
          variant="outline"
          className="w-full group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0"
          onClick={handleLaunchVanilla}
        >
          <Wrench />
          <span className="group-data-[collapsible=icon]:hidden">Play Vanilla</span>
        </Button>
      </SidebarFooter>

      <SidebarRail />
    </SidebarRoot>
  );
}
