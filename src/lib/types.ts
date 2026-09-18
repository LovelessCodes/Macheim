export type PackageSource = "thunderstore" | "hexium";
export type PackageSourceFilter = PackageSource | "all";

export interface ThunderstorePackage {
  name: string;
  full_name: string;
  owner: string;
  package_url: string;
  description: string;
  version_number: string;
  rating_score: number;
  downloads: number;
  is_deprecated: boolean;
  icon: string;
  categories: string[];
  date_updated: string;
  source: PackageSource;
}

export interface PackageVersion {
  name: string;
  full_name: string;
  version_number: string;
  dependencies: string[];
  download_url: string;
  downloads: number;
  description: string;
  icon: string;
  date_created: string;
}

export interface PackageDetail {
  name: string;
  full_name: string;
  owner: string;
  package_url: string;
  date_updated: string;
  is_deprecated: boolean;
  rating_score: number;
  versions: PackageVersion[];
  categories: string[];
  source: PackageSource;
}

export interface InstalledMod {
  full_name: string;
  name: string;
  author: string;
  version: string;
  enabled: boolean;
  description: string;
  icon: string;
  dependencies: string[];
  installed_at: string;
}

export interface Profile {
  name: string;
  description: string;
  mods: InstalledMod[];
  compatibility: CompatibilitySettings;
  created_at: string;
  updated_at: string;
}

export interface GameStatus {
  installed: boolean;
  game_path: string | null;
  bepinex_installed: boolean;
  active_profile: string;
}

export interface AppSettings {
  console_enabled: boolean;
  snapshot_saves: boolean;
}

export interface SaveWorld {
  name: string;
  files: number;
  size: number;
  modified: string | null;
}

export interface SaveSnapshot {
  id: string;
  label: string;
  created_at: string;
  size: number;
  automatic: boolean;
  worlds: number;
  characters: number;
}

export interface SaveOverview {
  save_dir: string | null;
  worlds: SaveWorld[];
  characters: SaveWorld[];
  snapshots: SaveSnapshot[];
}

export interface DuplicateDll {
  file_name: string;
  mods: string[];
}

export interface DependencyRequirement {
  required_by: string[];
  version: string;
}

export interface DependencyConflict {
  dependency: string;
  requirements: DependencyRequirement[];
}

export interface VersionMismatch {
  dependency: string;
  required_by: string[];
  required_version: string;
  installed_version: string;
}

export interface ConflictReport {
  duplicate_dlls: DuplicateDll[];
  dependency_conflicts: DependencyConflict[];
  version_mismatches: VersionMismatch[];
}

export function conflictCount(report: ConflictReport | null | undefined): number {
  if (!report) return 0;
  return (
    report.duplicate_dlls.length +
    report.dependency_conflicts.length +
    report.version_mismatches.length
  );
}

export interface ConfigFileSummary {
  path: string;
  filename: string;
  size: number;
}

export interface ConfigFile {
  path: string;
  filename: string;
  sections: ConfigSection[];
}

export interface ConfigSection {
  name: string;
  entries: ConfigEntry[];
}

export interface ConfigEntry {
  key: string;
  value: string;
  setting_type: string | null;
  default_value: string | null;
  description: string | null;
  acceptable_values: string | null;
  acceptable_value_range: string | null;
}

export interface BackupInfo {
  filename: string;
  profile_name: string;
  created_at: string;
  size: number;
  path: string;
}

export interface CompatibilitySettings {
  automatic: boolean;
  disabled_rules: string[];
}
export interface CompatibilityRule {
  id: string;
  package: string;
  version: string;
  title: string;
  prefabs: string[];
  reason: string;
  validation: string;
}
export interface CompatibilityStatus {
  profile_name: string;
  settings: CompatibilitySettings;
  catalog: {
    revision: number;
    plugin_version: string;
    game_version: string;
    unity_version: string;
    requirements: { package: string; version: string }[];
    rules: CompatibilityRule[];
  };
  rules: { rule: CompatibilityRule; eligible: boolean; reason: string }[];
  installed: boolean;
  up_to_date: boolean;
  game_running: boolean;
  recent_log: string[];
}

export type Page =
  | "setup"
  | "browse"
  | "installed"
  | "modpacks"
  | "config"
  | "profiles"
  | "compatibility"
  | "saves"
  | "settings";

export type SortOption = "downloads" | "rating" | "updated" | "name";
export type SortDirection = "asc" | "desc";

export type DownloadStatus =
  | "queued"
  | "downloading"
  | "installing"
  | "paused"
  | "waiting_for_game"
  | "waiting_for_network"
  | "completed"
  | "failed"
  | "cancelled";

export type DownloadKind = "mod" | "modpack";

export interface DownloadItem {
  id: number;
  full_name: string;
  name: string;
  version: string | null;
  kind: DownloadKind;
  status: DownloadStatus;
  message: string;
  current: number;
  total: number;
  bytes_downloaded: number;
  bytes_total: number | null;
  error: string | null;
  retry_count: number;
  installed_count: number;
  /** Set when the install comes from a local archive instead of a download. */
  local_path?: string | null;
  queued_at: string;
  finished_at: string | null;
}

export interface DownloadQueueSnapshot {
  paused: boolean;
  items: DownloadItem[];
}

/** Live byte progress for the item currently downloading or installing. */
export interface ModProgressEvent {
  /** Queue item the update belongs to; absent for non-queue downloads. */
  item_id?: number | null;
  stage: string;
  mod_name: string;
  current: number;
  total: number;
  bytes_downloaded: number;
  bytes_total: number | null;
  message: string;
}

export function isDownloadPending(status: DownloadStatus): boolean {
  return status !== "completed" && status !== "failed" && status !== "cancelled";
}

export function isDownloadActive(status: DownloadStatus): boolean {
  return status === "downloading" || status === "installing";
}
