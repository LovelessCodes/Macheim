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

export async function getBepinexStatus(): Promise<boolean> {
  return invoke<boolean>("get_bepinex_status");
}

// ── Thunderstore Packages ───────────────────────────────────────

export async function fetchPackages(): Promise<ThunderstorePackage[]> {
  return invoke<ThunderstorePackage[]>("fetch_packages");
}

export async function getPackageDetails(fullName: string): Promise<PackageDetail> {
  return invoke<PackageDetail>("get_package_details", { fullName });
}

// ── Mod Management ──────────────────────────────────────────────

export async function installMod(fullName: string, version: string): Promise<InstalledMod[]> {
  return invoke<InstalledMod[]>("install_mod", { fullName, version });
}

export async function uninstallMod(fullName: string): Promise<void> {
  return invoke("uninstall_mod", { fullName });
}

export async function toggleMod(fullName: string, enable: boolean): Promise<void> {
  return invoke("toggle_mod", { fullName, enable });
}

export async function getInstalledMods(): Promise<InstalledMod[]> {
  return invoke<InstalledMod[]>("get_installed_mods");
}

export async function installModpack(fullName: string, _version?: string): Promise<InstalledMod[]> {
  return invoke<InstalledMod[]>("install_modpack", { fullName });
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
