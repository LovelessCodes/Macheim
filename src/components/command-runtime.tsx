import { useTheme } from "next-themes";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import { useLaunchModded, useLaunchVanilla } from "../hooks/use-launch-game";
import { COMMANDS, type AppCommandId, type CommandRuntime } from "../lib/commands";
import { openPluginsFolder } from "../lib/tauri";
import { switchTheme } from "../lib/theme-transition";
import { useAppStore } from "../store/appStore";
import { useUpdaterStore } from "../store/updaterStore";
import { useSidebar } from "./ui/sidebar";
import { notify } from "./ui/toast";

export const CommandRuntimeContext = createContext<CommandRuntime | null>(null);

interface CommandRuntimeProviderProps {
  children: ReactNode;
  onCommandOpenChange: (open: boolean) => void;
}

export function CommandRuntimeProvider({
  children,
  onCommandOpenChange,
}: CommandRuntimeProviderProps) {
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const { toggleSidebar } = useSidebar();
  const { setTheme } = useTheme();
  const launchModded = useLaunchModded();
  const launchVanilla = useLaunchVanilla();

  const runtime = useMemo<CommandRuntime>(
    () => ({
      checkForUpdates: () => void useUpdaterStore.getState().check({ announce: true }),
      launchModded: () => launchModded.mutate(),
      launchVanilla: () => launchVanilla.mutate(),
      navigate: (page) => setCurrentPage(page),
      openCommandPalette: () => onCommandOpenChange(true),
      openPluginsFolder: () => {
        void openPluginsFolder().catch((err) => {
          notify("plugins-folder", { type: "error", title: String(err) });
        });
      },
      toggleSidebar,
      toggleTheme: () => {
        const nextTheme = document.documentElement.classList.contains("dark") ? "light" : "dark";
        switchTheme(nextTheme, { setTheme });
      },
    }),
    [launchModded, launchVanilla, onCommandOpenChange, setCurrentPage, setTheme, toggleSidebar],
  );

  return (
    <CommandRuntimeContext.Provider value={runtime}>{children}</CommandRuntimeContext.Provider>
  );
}

export function useCommandRuntime(): CommandRuntime {
  const runtime = useContext(CommandRuntimeContext);
  if (!runtime) throw new Error("CommandRuntimeProvider is missing");
  return runtime;
}

export function useRunCommand(): (id: AppCommandId) => void {
  const runtime = useCommandRuntime();
  return useCallback((id: AppCommandId) => COMMANDS[id].run(runtime), [runtime]);
}
