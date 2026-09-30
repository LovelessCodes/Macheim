export const PAGE_PATHS = {
  browse: "/browse",
  installed: "/installed",
  modpacks: "/modpacks",
  config: "/config",
  compatibility: "/compatibility",
  profiles: "/profiles",
  saves: "/saves",
  logs: "/logs",
  settings: "/settings",
} as const;

export type RoutePage = keyof typeof PAGE_PATHS;
