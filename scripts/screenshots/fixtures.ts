import type {
  AppSettings,
  CompatibilityStatus,
  ConfigFile,
  ConfigFileSummary,
  ConflictReport,
  DeletedProfile,
  DownloadQueueSnapshot,
  GameStatus,
  InstalledMod,
  LogFile,
  PackageDetail,
  Profile,
  ProfileSubscription,
  SaveOverview,
  ThunderstorePackage,
} from "../../src/lib/types";
import { PACKAGES } from "./packages";

/**
 * Tauri command fixtures for the README screenshots.
 *
 * The capture browser stubs `window.__TAURI_INTERNALS__.invoke`, so every
 * command the frontend issues resolves against the map below. Keep the data
 * plausible: these images are published as what the app looks like.
 */

const INSTALLED_AT = [
  "2026-09-24T18:12:00.000Z",
  "2026-09-22T09:41:00.000Z",
  "2026-09-18T21:07:00.000Z",
  "2026-09-14T11:26:00.000Z",
  "2026-09-09T19:52:00.000Z",
  "2026-09-03T08:33:00.000Z",
];

function pkg(fullName: string): ThunderstorePackage {
  const found = PACKAGES.find((candidate) => candidate.full_name === fullName);
  if (!found) throw new Error(`Unknown fixture package: ${fullName}`);
  return found;
}

function installed(
  fullName: string,
  index: number,
  overrides: Partial<InstalledMod> = {},
): InstalledMod {
  const source = pkg(fullName);
  return {
    full_name: source.full_name,
    name: source.name,
    author: source.owner,
    version: source.version_number,
    enabled: true,
    description: source.description,
    icon: source.icon,
    dependencies: [],
    installed_at: INSTALLED_AT[index % INSTALLED_AT.length],
    installed_as: "explicit",
    ...overrides,
  };
}

const INSTALLED_MODS: InstalledMod[] = [
  installed("ValheimModding-Jotunn", 0, { installed_as: "dependency" }),
  installed("Advize-PlantEverything", 0),
  installed("OdinPlus-TeleportEverything", 1),
  installed("RandyKnapp-EquipmentAndQuickSlots", 1),
  installed("shudnal-ConfigurationManager", 2),
  installed("MSchmoecker-MultiUserChest", 2),
  installed("Vapok-AdventureBackpacks", 3),
  installed("Azumatt-AzuExtendedPlayerInventory", 3),
  installed("Smoothbrain-Backpacks", 4, { enabled: false }),
  installed("Fantu-Sages_Vault", 4, { pinned: true }),
  installed("k942-MassFarming", 5),
  installed("Roses-SmarterContainers", 5, { installed_as: "dependency" }),
  installed("ValheimPlus1-ValheimPlus", 5, { manual: true }),
];

const PROFILES: Profile[] = [
  {
    name: "Macheim",
    description: "Everyday modded client",
    mods: INSTALLED_MODS,
    compatibility: { automatic: true, disabled_rules: [] },
    created_at: "2026-06-02T10:15:00.000Z",
    updated_at: "2026-09-24T18:12:00.000Z",
  },
  {
    name: "Friends",
    description: "Server-safe QoL pack",
    mods: INSTALLED_MODS.slice(1, 8),
    compatibility: { automatic: true, disabled_rules: [] },
    created_at: "2026-07-19T20:03:00.000Z",
    updated_at: "2026-09-20T16:44:00.000Z",
  },
  {
    name: "Vanilla+",
    description: "Lightweight run, no cheats",
    mods: INSTALLED_MODS.slice(5, 9),
    compatibility: { automatic: false, disabled_rules: [] },
    created_at: "2026-08-07T13:30:00.000Z",
    updated_at: "2026-09-02T09:10:00.000Z",
  },
];

const DELETED_PROFILES: DeletedProfile[] = [
  {
    archive_name: "Vanilla_2026-08-14_09-32-11",
    name: "Vanilla",
    mods: 0,
    deleted_at: "2026-08-14T09:32:11.000Z",
  },
];

const SUBSCRIPTIONS: ProfileSubscription[] = [
  {
    profile: "Macheim",
    subscription: {
      modpack: "JereKuusela-Expand_World",
      version: "1.56.0",
      mods: ["ValheimModding-Jotunn", "JereKuusela-Server_devcommands"],
      synced_at: "2026-09-20T17:05:00.000Z",
    },
  },
];

const CATALOG_RULES = [
  {
    id: "ves-scroll-particles",
    package: "sighsorry-Valheim_Enchantment_System",
    version: "1.9.12",
    title: "VES scroll paper, sparks and aura",
    prefabs: ["kg_EnchantScroll_Weapon_F", "kg_EnchantScroll_Weapon_Blessed_F"],
    reason:
      "Replace known incompatible mesh/particle shaders and bridge additive texture alpha on these two tested weapon scrolls.",
    validation:
      "Limited visual smoke test in RelicHeim 6.0.0 on macOS Metal. Other scroll grades and Windows visual parity are not verified.",
  },
  {
    id: "wizardry-drop-particles",
    package: "Therzie-Wizardry",
    version: "1.1.8",
    title: "Wizardry scroll and shard drop effects",
    prefabs: ["ArcaneScroll_BlackForest_TW", "ShardBonemass_TW"],
    reason:
      "Repair the shared drop particles on the tested Black Forest scroll and Bonemass shard without changing their item stats or original assets.",
    validation:
      "Limited visual smoke test in RelicHeim 6.0.0 on macOS Metal. Buildings, creatures, equipment and UI icons are outside this patch.",
  },
];

const COMPATIBILITY: CompatibilityStatus = {
  profile_name: "Macheim",
  settings: { automatic: true, disabled_rules: [] },
  catalog: {
    revision: 1,
    plugin_version: "0.2.0",
    game_version: "0.221.12",
    unity_version: "6000.0.61f1",
    rules: CATALOG_RULES,
    requirements: [{ package: "DrummerCraig-ShaderHelperForMac", version: "3.3.0" }],
  },
  rules: [
    {
      rule: CATALOG_RULES[0],
      eligible: false,
      reason: "Packages are not installed in this profile.",
    },
    {
      rule: CATALOG_RULES[1],
      eligible: false,
      reason: "Packages are not installed in this profile.",
    },
  ],
  installed: false,
  up_to_date: true,
  game_running: false,
  recent_log: [],
};

const CONFIG_FILES: ConfigFileSummary[] = [
  { path: "/fixture/BepInEx/config/valheim_plus.cfg", filename: "valheim_plus.cfg", size: 4820 },
  { path: "/fixture/BepInEx/config/comfy.cfg", filename: "comfy.cfg", size: 2140 },
  {
    path: "/fixture/BepInEx/config/Azumatt.AzuExtendedPlayerInventory.cfg",
    filename: "Azumatt.AzuExtendedPlayerInventory.cfg",
    size: 1680,
  },
  {
    path: "/fixture/BepInEx/config/org.bepinex.configurationmanager.cfg",
    filename: "org.bepinex.configurationmanager.cfg",
    size: 940,
  },
];

const CONFIG: ConfigFile = {
  path: CONFIG_FILES[0].path,
  filename: "valheim_plus.cfg",
  sections: [
    {
      name: "Server",
      entries: [
        {
          key: "enabled",
          value: "true",
          setting_type: "boolean",
          default_value: "true",
          description: "Enable or disable Valheim Plus on this client.",
          acceptable_values: null,
          acceptable_value_range: null,
        },
        {
          key: "server_syncs",
          value: "true",
          setting_type: "boolean",
          default_value: "true",
          description: "Sync settings with the server when both run Valheim Plus.",
          acceptable_values: null,
          acceptable_value_range: null,
        },
        {
          key: "max_players",
          value: "10",
          setting_type: "int",
          default_value: "10",
          description: "Maximum number of players allowed on the server.",
          acceptable_values: null,
          acceptable_value_range: "from 1 to 64",
        },
      ],
    },
    {
      name: "Player",
      entries: [
        {
          key: "base_max_carry_weight",
          value: "400",
          setting_type: "float",
          default_value: "300",
          description: "Base carrying capacity in weight units.",
          acceptable_values: null,
          acceptable_value_range: "from 0 to 999",
        },
        {
          key: "stamina_usage_type",
          value: "percentage",
          setting_type: "string",
          default_value: "percentage",
          description: "How stamina costs are interpreted: flat or percentage values.",
          acceptable_values: "flat, percentage",
          acceptable_value_range: null,
        },
        {
          key: "stamina_dodge",
          value: "50",
          setting_type: "float",
          default_value: "50",
          description: "Stamina cost of a dodge roll, as a percentage of vanilla.",
          acceptable_values: null,
          acceptable_value_range: "from 0 to 100",
        },
      ],
    },
    {
      name: "Building",
      entries: [
        {
          key: "build_range",
          value: "12",
          setting_type: "float",
          default_value: "10",
          description: "Maximum distance from the player that pieces can be placed at.",
          acceptable_values: null,
          acceptable_value_range: "from 1 to 50",
        },
        {
          key: "no_build_cost",
          value: "false",
          setting_type: "boolean",
          default_value: "false",
          description:
            "Build without consuming materials. Cheat-like; leave off on shared servers.",
          acceptable_values: null,
          acceptable_value_range: null,
        },
      ],
    },
  ],
};

const DOWNLOAD_QUEUE: DownloadQueueSnapshot = {
  paused: false,
  items: [
    {
      id: 7,
      full_name: "Advize-PlantEverything",
      name: "PlantEverything",
      version: "1.21.3",
      kind: "mod",
      status: "downloading",
      message: "Downloading from Thunderstore",
      current: 0,
      total: 0,
      bytes_downloaded: 2_437_120,
      bytes_total: 5_672_960,
      error: null,
      retry_count: 0,
      installed_count: 0,
      queued_at: "2026-09-24T18:12:00.000Z",
      finished_at: null,
    },
    {
      id: 6,
      full_name: "ValheimModding-Jotunn",
      name: "Jotunn",
      version: "2.30.2",
      kind: "mod",
      status: "installing",
      message: "Installing 12 of 34 files",
      current: 12,
      total: 34,
      bytes_downloaded: 4_918_272,
      bytes_total: 4_918_272,
      error: null,
      retry_count: 0,
      installed_count: 22,
      queued_at: "2026-09-24T18:11:40.000Z",
      finished_at: null,
    },
    {
      id: 5,
      full_name: "MSchmoecker-MultiUserChest",
      name: "MultiUserChest",
      version: "0.6.2",
      kind: "mod",
      status: "waiting_for_game",
      message: "Waiting for Valheim to close",
      current: 0,
      total: 0,
      bytes_downloaded: 0,
      bytes_total: null,
      error: null,
      retry_count: 0,
      installed_count: 0,
      queued_at: "2026-09-24T18:11:20.000Z",
      finished_at: null,
    },
    {
      id: 4,
      full_name: "Smoothbrain-Backpacks",
      name: "Backpacks",
      version: "1.3.8",
      kind: "mod",
      status: "queued",
      message: "Queued",
      current: 0,
      total: 0,
      bytes_downloaded: 0,
      bytes_total: null,
      error: null,
      retry_count: 0,
      installed_count: 0,
      queued_at: "2026-09-24T18:11:10.000Z",
      finished_at: null,
    },
    {
      id: 3,
      full_name: "RandyKnapp-EquipmentAndQuickSlots",
      name: "EquipmentAndQuickSlots",
      version: "3.1.3",
      kind: "mod",
      status: "completed",
      message: "Installed",
      current: 0,
      total: 0,
      bytes_downloaded: 0,
      bytes_total: null,
      error: null,
      retry_count: 0,
      installed_count: 0,
      queued_at: "2026-09-24T18:09:00.000Z",
      finished_at: "2026-09-24T18:10:12.000Z",
    },
    {
      id: 2,
      full_name: "sinai-dev-UnityExplorer",
      name: "UnityExplorer",
      version: "4.8.2",
      kind: "mod",
      status: "failed",
      message: "Download failed",
      current: 0,
      total: 0,
      bytes_downloaded: 0,
      bytes_total: null,
      error: "Connection reset by peer",
      retry_count: 2,
      installed_count: 0,
      queued_at: "2026-09-24T18:08:30.000Z",
      finished_at: "2026-09-24T18:09:02.000Z",
    },
  ],
};

const PACKAGE_DETAILS: Record<string, PackageDetail> = {
  "ValheimModding-Jotunn": {
    name: "Jotunn",
    full_name: "ValheimModding-Jotunn",
    owner: "ValheimModding",
    package_url: pkg("ValheimModding-Jotunn").package_url,
    date_updated: pkg("ValheimModding-Jotunn").date_updated,
    is_deprecated: false,
    rating_score: pkg("ValheimModding-Jotunn").rating_score,
    categories: pkg("ValheimModding-Jotunn").categories,
    source: "thunderstore",
    versions: [
      {
        name: "Jotunn",
        full_name: "ValheimModding-Jotunn-2.30.2",
        version_number: "2.30.2",
        dependencies: [],
        download_url: "https://thunderstore.io/package/download/ValheimModding/Jotunn/2.30.2/",
        downloads: 208_111,
        description: pkg("ValheimModding-Jotunn").description,
        icon: pkg("ValheimModding-Jotunn").icon,
        date_created: "2026-09-26T12:00:00.000Z",
      },
      {
        name: "Jotunn",
        full_name: "ValheimModding-Jotunn-2.29.0",
        version_number: "2.29.0",
        dependencies: [],
        download_url: "https://thunderstore.io/package/download/ValheimModding/Jotunn/2.29.0/",
        downloads: 141_882,
        description: pkg("ValheimModding-Jotunn").description,
        icon: pkg("ValheimModding-Jotunn").icon,
        date_created: "2026-08-21T10:14:00.000Z",
      },
      {
        name: "Jotunn",
        full_name: "ValheimModding-Jotunn-2.28.0",
        version_number: "2.28.0",
        dependencies: [],
        download_url: "https://thunderstore.io/package/download/ValheimModding/Jotunn/2.28.0/",
        downloads: 176_304,
        description: pkg("ValheimModding-Jotunn").description,
        icon: pkg("ValheimModding-Jotunn").icon,
        date_created: "2026-06-30T08:02:00.000Z",
      },
    ],
  },
};

const GAME_STATUS: GameStatus = {
  installed: true,
  game_path: "/Users/player/Library/Application Support/Steam/steamapps/common/Valheim",
  bepinex_installed: true,
  active_profile: "Macheim",
};

const APP_SETTINGS: AppSettings = {
  console_enabled: true,
  snapshot_saves: true,
  cdn_preference: "auto",
};

const SAVE_OVERVIEW: SaveOverview = {
  save_dir: "/Users/player/Library/Application Support/irongate/Valheim",
  worlds: [
    { name: "Meadows", files: 4, size: 21_400_000, modified: "2026-09-23T20:14:00.000Z" },
    { name: "Ashlands", files: 4, size: 18_900_000, modified: "2026-09-19T18:02:00.000Z" },
  ],
  characters: [
    { name: "Sigrid", files: 2, size: 41_000, modified: "2026-09-23T20:14:00.000Z" },
    { name: "Ragnar", files: 2, size: 38_500, modified: "2026-09-12T21:40:00.000Z" },
  ],
  snapshots: [
    {
      id: "2026-09-20_17-05-11",
      label: "Before Jotunn 2.30",
      created_at: "2026-09-20T17:05:11.000Z",
      size: 44_200_000,
      automatic: true,
      worlds: 2,
      characters: 2,
    },
  ],
};

const CONFLICTS: ConflictReport = {
  duplicate_dlls: [],
  dependency_conflicts: [],
  version_mismatches: [],
};

const LATEST_LOG: LogFile = {
  path: "/fixture/Library/Logs/Valheim/Player.log",
  text: [
    "[Info   : BepInEx] BepInEx 5.4.2351.0 - valheim (2026-09-23 20:12:01)",
    "[Info   : BepInEx] Running under Unity v6000.0.61f1",
    "[Info   : BepInEx] Loading [Jotunn 2.30.2]",
    "[Info   : Jotunn] Jotunn v2.30.2 loaded 14 ContentTypes in 0.42s",
    "[Info   : BepInEx] Loading [PlantEverything 1.21.3]",
    "[Info   : BepInEx] Chainloader startup complete",
  ].join("\n"),
  truncated: false,
  offset: 1_204,
};

export interface FixtureOptions {
  /** The app version the mocked updater and titlebar report. */
  version: string;
}

/** Map of Tauri command name to mocked response or responder. */
export function createFixtures(options: FixtureOptions): Record<string, unknown> {
  return {
    detect_game: GAME_STATUS,
    get_game_status: GAME_STATUS,
    get_steam_status: { running: true },
    "plugin:app|version": options.version,
    fetch_packages: PACKAGES,
    get_installed_mods: INSTALLED_MODS,
    list_unmanaged_mods: [],
    detect_mod_conflicts: CONFLICTS,
    list_profiles: PROFILES,
    get_active_profile: "Macheim",
    list_deleted_profiles: DELETED_PROFILES,
    list_subscriptions: SUBSCRIPTIONS,
    get_compatibility: COMPATIBILITY,
    get_config_files: CONFIG_FILES,
    get_config: CONFIG,
    get_download_queue: DOWNLOAD_QUEUE,
    // Keyed by `fullName`; the capture dispatcher handles the lookup.
    get_package_details: PACKAGE_DETAILS,
    get_app_settings: APP_SETTINGS,
    list_backups: [],
    get_save_overview: SAVE_OVERVIEW,
    read_latest_log: LATEST_LOG,
    get_last_crash_report: null,
    get_safe_mode: [],
    "plugin:updater|check": null,
  };
}
