import { invoke } from "@tauri-apps/api/core";

import type {
  GameStatus,
  ThunderstorePackage,
  PackageDetail,
  InstalledMod,
  Profile,
  ConfigFile,
  ConfigFileSummary,
  BackupInfo,
  CompatibilityStatus,
  CompatibilitySettings,
  AppSettings,
  DownloadItem,
  DownloadKind,
  DownloadQueueSnapshot,
} from "./types";

// ── Game Detection ──────────────────────────────────────────────

export async function detectGame(): Promise<GameStatus> {
  return invoke<GameStatus>("detect_game");
}

export async function getGameStatus(): Promise<GameStatus> {
  return invoke<GameStatus>("get_game_status");
}

// ── BepInEx ─────────────────────────────────────────────────────

export async function installBepinex(): Promise<void> {
  return invoke("install_bepinex");
}

// ── Thunderstore Packages ───────────────────────────────────────

export async function fetchPackages(): Promise<ThunderstorePackage[]> {
  return invoke<ThunderstorePackage[]>("fetch_packages");
}

export async function getPackageDetails(fullName: string): Promise<PackageDetail> {
  return invoke<PackageDetail>("get_package_details", { fullName });
}

// ── Mod Management ──────────────────────────────────────────────

export async function uninstallMod(fullName: string): Promise<void> {
  return invoke("uninstall_mod", { fullName });
}

export async function toggleMod(fullName: string, enable: boolean): Promise<void> {
  return invoke("toggle_mod", { fullName, enable });
}

export async function getInstalledMods(): Promise<InstalledMod[]> {
  return invoke<InstalledMod[]>("get_installed_mods");
}

// ── Download Queue ──────────────────────────────────────────────

export async function getDownloadQueue(): Promise<DownloadQueueSnapshot> {
  return invoke<DownloadQueueSnapshot>("get_download_queue");
}

export async function enqueueInstall(
  fullName: string,
  name: string,
  version: string | null,
  kind: DownloadKind = "mod",
): Promise<DownloadItem> {
  return invoke<DownloadItem>("enqueue_install", { fullName, name, version, kind });
}

export async function enqueueLocalInstall(path: string): Promise<DownloadItem> {
  return invoke<DownloadItem>("enqueue_local_install", { path });
}

export async function pauseDownload(id: number): Promise<DownloadQueueSnapshot> {
  return invoke<DownloadQueueSnapshot>("pause_download", { id });
}

export async function resumeDownload(id: number): Promise<DownloadQueueSnapshot> {
  return invoke<DownloadQueueSnapshot>("resume_download", { id });
}

export async function cancelDownload(id: number): Promise<DownloadQueueSnapshot> {
  return invoke<DownloadQueueSnapshot>("cancel_download", { id });
}

export async function retryDownload(id: number): Promise<DownloadQueueSnapshot> {
  return invoke<DownloadQueueSnapshot>("retry_download", { id });
}

export async function reinstallDownload(id: number): Promise<DownloadQueueSnapshot> {
  return invoke<DownloadQueueSnapshot>("reinstall_download", { id });
}

export async function removeDownload(id: number): Promise<DownloadQueueSnapshot> {
  return invoke<DownloadQueueSnapshot>("remove_download", { id });
}

export async function pauseAllDownloads(): Promise<DownloadQueueSnapshot> {
  return invoke<DownloadQueueSnapshot>("pause_all_downloads");
}

export async function resumeAllDownloads(): Promise<DownloadQueueSnapshot> {
  return invoke<DownloadQueueSnapshot>("resume_all_downloads");
}

export async function cancelAllDownloads(): Promise<DownloadQueueSnapshot> {
  return invoke<DownloadQueueSnapshot>("cancel_all_downloads");
}

export async function clearFinishedDownloads(): Promise<DownloadQueueSnapshot> {
  return invoke<DownloadQueueSnapshot>("clear_finished_downloads");
}

export interface SyncResult {
  reinstalled: string[];
  failed: string[];
  cleaned: string[];
}

export async function syncMods(
  cleanUnmanaged = false,
  approvedUnmanaged: string[] = [],
): Promise<SyncResult> {
  return invoke<SyncResult>("sync_mods", {
    cleanUnmanaged: cleanUnmanaged === true,
    approvedUnmanaged,
  });
}

export async function listUnmanagedMods(): Promise<string[]> {
  return invoke<string[]>("list_unmanaged_mods");
}

// ── Profiles ────────────────────────────────────────────────────

export async function listProfiles(): Promise<Profile[]> {
  return invoke<Profile[]>("list_profiles");
}

export async function createProfile(name: string): Promise<Profile> {
  return invoke<Profile>("create_profile", { name });
}

export async function switchProfile(name: string): Promise<void> {
  return invoke("switch_profile", { name });
}

export async function getActiveProfile(): Promise<string> {
  return invoke("get_active_profile");
}
export async function getCompatibility(): Promise<CompatibilityStatus> {
  return invoke("get_compatibility");
}
export async function applyCompatibility(
  profileName: string,
  settings: CompatibilitySettings,
): Promise<CompatibilityStatus> {
  return invoke("apply_compatibility", { profileName, settings });
}

export async function deleteProfile(name: string): Promise<void> {
  return invoke("delete_profile", { name });
}

// ── Config Editor ───────────────────────────────────────────────

export async function getConfigFiles(): Promise<ConfigFileSummary[]> {
  return invoke<ConfigFileSummary[]>("get_config_files");
}

export async function getConfig(path: string): Promise<ConfigFile> {
  return invoke<ConfigFile>("get_config", { path });
}

export async function saveConfig(config: ConfigFile): Promise<void> {
  return invoke("save_config", { config });
}

// ── Backups ─────────────────────────────────────────────────────

export async function createBackup(): Promise<BackupInfo> {
  return invoke<BackupInfo>("create_backup");
}

export async function listBackups(): Promise<BackupInfo[]> {
  return invoke<BackupInfo[]>("list_backups");
}

export async function restoreBackup(filename: string): Promise<void> {
  return invoke("restore_backup", { filename });
}

// ── Launch ──────────────────────────────────────────────────────

export async function launchModded(): Promise<void> {
  return invoke("launch_modded");
}

export async function launchVanilla(): Promise<void> {
  return invoke("launch_vanilla");
}

// ── App Settings ────────────────────────────────────────────────

export async function getAppSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_app_settings");
}

export async function setConsoleEnabled(enabled: boolean): Promise<AppSettings> {
  return invoke<AppSettings>("set_console_enabled", { enabled });
}
