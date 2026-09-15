import { FolderOpen, HardDrive, Download, Trash2, Archive, AlertTriangle } from "lucide-react";
import { useState } from "react";

import { createBackup, listBackups, restoreBackup } from "../../lib/tauri";
import type { BackupInfo } from "../../lib/types";
import { useAppStore } from "../../store/appStore";

export default function SettingsPage() {
  const gameStatus = useAppStore((s) => s.gameStatus);
  const addToast = useAppStore((s) => s.addToast);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupsLoaded, setBackupsLoaded] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  const loadBackups = async () => {
    try {
      const data = await listBackups();
      setBackups(data);
      setBackupsLoaded(true);
    } catch {
      addToast({ type: "error", message: "Could not load backups." });
    }
  };

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      await createBackup();
      addToast({ type: "success", message: "Backup created." });
      await loadBackups();
    } catch (err) {
      addToast({ type: "error", message: `Backup failed: ${err}` });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleRestore = async (filename: string) => {
    try {
      await restoreBackup(filename);
      addToast({ type: "success", message: "Backup restored." });
    } catch (err) {
      addToast({ type: "error", message: `Restore failed: ${err}` });
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Game Info */}
      <section className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
          <HardDrive size={18} />
          Game Information
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-secondary)]">Status</span>
            <span
              className={`font-medium ${
                gameStatus?.installed ? "text-[var(--color-success)]" : "text-[var(--color-error)]"
              }`}
            >
              {gameStatus?.installed ? "Installed" : "Not Found"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-secondary)]">Game Path</span>
            <span className="max-w-[300px] truncate font-mono text-xs text-[var(--color-text-primary)]">
              {gameStatus?.game_path ?? "N/A"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-secondary)]">BepInEx</span>
            <span
              className={`font-medium ${
                gameStatus?.bepinex_installed
                  ? "text-[var(--color-success)]"
                  : "text-[var(--color-warning)]"
              }`}
            >
              {gameStatus?.bepinex_installed ? "Installed" : "Not Installed"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-secondary)]">Active Profile</span>
            <span className="font-medium text-[var(--color-text-primary)]">
              {gameStatus?.active_profile ?? "Default"}
            </span>
          </div>
        </div>
      </section>

      {/* Paths */}
      <section className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
          <FolderOpen size={18} />
          Data Locations
        </h3>
        <div className="space-y-2 text-sm text-[var(--color-text-secondary)]">
          <p>
            Active mod files are in the game's BepInEx folder. Saved profiles are in
            ~/Library/Application Support/com.macheim/profiles.
          </p>
          <p className="rounded-md bg-[var(--color-bg-input)] px-3 py-2 font-mono text-xs text-[var(--color-text-muted)]">
            {gameStatus?.game_path
              ? `${gameStatus.game_path}/BepInEx/`
              : "~/Library/Application Support/Steam/steamapps/common/Valheim/BepInEx/"}
          </p>
        </div>
      </section>

      <p className="text-sm text-[var(--color-text-secondary)]">
        Backups contain profile metadata and configuration—not mod binaries or worlds. Restoring
        creates a separate profile. Thunderstore mods must be downloaded again; keep a separate copy
        of manual mods.
      </p>
      {/* Backups */}
      <section className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
            <Archive size={18} />
            Backups
          </h3>
          <div className="flex gap-2">
            {!backupsLoaded && (
              <button
                onClick={loadBackups}
                className="cursor-pointer rounded-md border border-[var(--color-border-default)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)]"
              >
                Load Backups
              </button>
            )}
            <button
              onClick={handleCreateBackup}
              disabled={isCreatingBackup}
              className="cursor-pointer rounded-md bg-[var(--color-accent-primary)] px-3 py-1.5 text-xs text-white transition-colors hover:bg-[var(--color-accent-primary-hover)] disabled:opacity-50"
            >
              {isCreatingBackup ? "Creating..." : "Create Backup"}
            </button>
          </div>
        </div>
        {backupsLoaded && backups.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)]">No backups found.</p>
        )}
        {backups.length > 0 && (
          <div className="space-y-2">
            {backups.map((b) => (
              <div
                key={b.filename}
                className="flex items-center justify-between rounded-md bg-[var(--color-bg-input)] p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-[var(--color-text-primary)]">{b.profile_name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {(b.size / 1024).toFixed(1)} KB &middot;{" "}
                    {new Date(b.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRestore(b.filename)}
                  className="cursor-pointer rounded-md border border-[var(--color-border-default)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)]"
                >
                  <Download size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reserved action: do not present an inert destructive control as working. */}
      <section className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 p-5">
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-[var(--color-error)]">
          <AlertTriangle size={18} />
          Danger Zone
        </h3>
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
          These actions are destructive and cannot be undone. Please create a backup first.
        </p>
        <button
          disabled
          title="Not available; manage individual mods in Installed Mods"
          className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--color-error)]/50 px-4 py-2 text-xs text-[var(--color-error)] transition-colors hover:bg-[var(--color-error)]/10"
        >
          <Trash2 size={14} />
          Remove All Mods
        </button>
      </section>
    </div>
  );
}
