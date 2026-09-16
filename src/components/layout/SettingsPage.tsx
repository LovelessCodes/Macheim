import { FolderOpen, HardDrive, Download, Trash2, Archive, AlertTriangle } from "lucide-react";
import { useState } from "react";
import {
  FolderOpen,
  HardDrive,
  Download,
  Trash2,
  Archive,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { createBackup, listBackups, restoreBackup } from "../../lib/tauri";
import type { BackupInfo } from "../../lib/types";
import { toast } from "../ui/toast";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const gameStatus = useAppStore((s) => s.gameStatus);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupsLoaded, setBackupsLoaded] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  const loadBackups = async () => {
    try {
      const data = await listBackups();
      setBackups(data);
      setBackupsLoaded(true);
    } catch {
      toast.add({ type: "error", title: "Could not load backups." });
    }
  };

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      await createBackup();
      toast.add({ type: "success", title: "Backup created." });
      await loadBackups();
    } catch (err) {
      toast.add({ type: "error", title: `Backup failed: ${err}` });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleRestore = async (filename: string) => {
    try {
      await restoreBackup(filename);
      toast.add({ type: "success", title: "Backup restored." });
    } catch (err) {
      toast.add({ type: "error", title: `Restore failed: ${err}` });
    }
  };

  return (
    <div className="grid gap-6">
      {/* Game Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="size-4" />
            Game Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <InfoRow label="Status">
            {gameStatus?.installed ? (
              <Badge
                variant="outline"
                className="border-[var(--color-success)]/40 text-[var(--color-success)]"
              >
                Installed
              </Badge>
            ) : (
              <Badge variant="destructive">Not Found</Badge>
            )}
          </InfoRow>
          <InfoRow label="Game Path">
            <span className="max-w-[300px] truncate font-mono text-xs">
              {gameStatus?.game_path ?? "N/A"}
            </span>
          </InfoRow>
          <InfoRow label="BepInEx">
            {gameStatus?.bepinex_installed ? (
              <Badge
                variant="outline"
                className="border-[var(--color-success)]/40 text-[var(--color-success)]"
              >
                Installed
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-[var(--color-warning)]/40 text-[var(--color-warning)]"
              >
                Not Installed
              </Badge>
            )}
          </InfoRow>
          <InfoRow label="Active Profile">
            <span className="font-medium">
              {gameStatus?.active_profile ?? "Default"}
            </span>
          </InfoRow>
        </CardContent>
      </Card>

      {/* Paths */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="size-4" />
            Data Locations
          </CardTitle>
          <CardDescription>
            Active mod files are in the game&apos;s BepInEx folder. Saved
            profiles are in ~/Library/Application Support/com.macheim/profiles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="break-all bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
            {gameStatus?.game_path
              ? `${gameStatus.game_path}/BepInEx/`
              : "~/Library/Application Support/Steam/steamapps/common/Valheim/BepInEx/"}
          </p>
        </CardContent>
      </Card>

      {/* Backups */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="size-4" />
            Backups
          </CardTitle>
          <CardDescription>
            Backups contain profile metadata and configuration—not mod binaries
            or worlds. Restoring creates a separate profile. Thunderstore mods
            must be downloaded again; keep a separate copy of manual mods.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {!backupsLoaded && (
              <Button variant="outline" size="sm" onClick={loadBackups}>
                Load Backups
              </Button>
            )}
            <Button
              variant="accent-primary"
              size="sm"
              onClick={handleCreateBackup}
              disabled={isCreatingBackup}
            >
              {isCreatingBackup ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Archive />
              )}
              {isCreatingBackup ? "Creating..." : "Create Backup"}
            </Button>
          </div>
          {backupsLoaded && backups.length === 0 && (
            <p className="text-sm text-muted-foreground">No backups found.</p>
          )}
          {backups.length > 0 && (
            <div className="divide-y divide-border border">
              {backups.map((b) => (
                <div
                  key={b.filename}
                  className="flex items-center justify-between gap-4 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {b.profile_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(b.size / 1024).toFixed(1)} KB &middot;{" "}
                      {new Date(b.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestore(b.filename)}
                    title={`Restore ${b.profile_name}`}
                  >
                    <Download />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reserved action: do not present an inert destructive control as working. */}
      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            These actions are destructive and cannot be undone. Please create a
            backup first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            disabled
            title="Not available; manage individual mods in Installed Mods"
          >
            <Trash2 />
            Remove All Mods
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
