import type { Page } from "./types";

/** Everything a command may need from the running app. Bindings never touch this. */
export interface CommandRuntime {
  checkForUpdates: () => void;
  launchModded: () => void;
  launchVanilla: () => void;
  navigate: (page: Page) => void;
  openCommandPalette: () => void;
  openPluginsFolder: () => void;
  toggleSidebar: () => void;
  toggleTheme: () => void;
}

export interface CommandDefinition {
  description?: string;
  group: string;
  run: (runtime: CommandRuntime) => void;
  title: string;
}

export const COMMANDS = {
  "app.commandPalette": {
    group: "Application",
    title: "Open command palette",
    description: "Search pages and actions",
    run: (runtime) => runtime.openCommandPalette(),
  },
  "app.toggleSidebar": {
    group: "Application",
    title: "Toggle sidebar",
    run: (runtime) => runtime.toggleSidebar(),
  },
  "app.toggleTheme": {
    group: "Appearance",
    title: "Toggle theme",
    description: "Switch between light and dark",
    run: (runtime) => runtime.toggleTheme(),
  },
  "app.checkForUpdates": {
    group: "Application",
    title: "Check for updates",
    run: (runtime) => runtime.checkForUpdates(),
  },
  "app.openPluginsFolder": {
    group: "Application",
    title: "Open plugins folder",
    run: (runtime) => runtime.openPluginsFolder(),
  },
  "app.launchModded": {
    group: "Game",
    title: "Launch Valheim (modded)",
    run: (runtime) => runtime.launchModded(),
  },
  "app.launchVanilla": {
    group: "Game",
    title: "Launch Valheim (vanilla)",
    run: (runtime) => runtime.launchVanilla(),
  },
  "nav.browse": {
    group: "Go to",
    title: "Browse Mods",
    run: (runtime) => runtime.navigate("browse"),
  },
  "nav.installed": {
    group: "Go to",
    title: "Installed Mods",
    run: (runtime) => runtime.navigate("installed"),
  },
  "nav.modpacks": {
    group: "Go to",
    title: "Modpacks",
    run: (runtime) => runtime.navigate("modpacks"),
  },
  "nav.config": {
    group: "Go to",
    title: "Config Editor",
    run: (runtime) => runtime.navigate("config"),
  },
  "nav.compatibility": {
    group: "Go to",
    title: "Mac Compatibility",
    run: (runtime) => runtime.navigate("compatibility"),
  },
  "nav.profiles": {
    group: "Go to",
    title: "Profiles",
    run: (runtime) => runtime.navigate("profiles"),
  },
  "nav.saves": {
    group: "Go to",
    title: "Save Snapshots",
    run: (runtime) => runtime.navigate("saves"),
  },
  "nav.logs": {
    group: "Go to",
    title: "Logs",
    run: (runtime) => runtime.navigate("logs"),
  },
  "nav.settings": {
    group: "Go to",
    title: "Settings",
    run: (runtime) => runtime.navigate("settings"),
  },
} satisfies Record<string, CommandDefinition>;

export type AppCommandId = keyof typeof COMMANDS;

/** Widened accessor: the registry's literal types narrow `description` away. */
export function getCommand(id: AppCommandId): CommandDefinition {
  return COMMANDS[id];
}
