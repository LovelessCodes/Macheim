import { confirm } from "@tauri-apps/plugin-dialog";
import {
  FolderOpen,
  HardDrive,
  Download,
  Trash2,
  Archive,
  AlertTriangle,
  FileSearch,
  Loader2,
  RefreshCw,
  ShieldOff,
  Stethoscope,
  Terminal,
} from "lucide-react";
import { useState } from "react";

import { useAppSettings, useSetConsoleEnabled } from "../../hooks/use-app-settings";
import { useAppVersion } from "../../hooks/use-app-version";
import { useBackups, useCreateBackup, useRestoreBackup } from "../../hooks/use-backups";
import { useAnalyzeCrashLogs, useLaunchSafeMode } from "../../hooks/use-diagnostics";
import { useGameStatus, useSteamStatus } from "../../hooks/use-game-status";
import { useUpdater } from "../../hooks/use-updater";
import ProgressBar from "../common/ProgressBar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Switch } from "../ui/switch";

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { data: gameStatus } = useGameStatus();
  const { data: steamStatus } = useSteamStatus();
  const appVersion = useAppVersion();
  const { status, version, progress, error, check, install, restart } = useUpdater();
  const [backupsRequested, setBackupsRequested] = useState(false);
  const { data: backups = [] } = useBackups(backupsRequested);
  const createBackupMutation = useCreateBackup();
  const restoreBackupMutation = useRestoreBackup();
  const { data: appSettings } = useAppSettings();
  const setConsoleEnabled = useSetConsoleEnabled();
  const analyzeLogs = useAnalyzeCrashLogs();
  const launchSafeMode = useLaunchSafeMode();

  const handleSafeMode = async () => {
    const confirmed = await confirm(
      "Disable every mod and launch Valheim? You can restore the mods from the banner afterwards.",
      { title: "Launch in Safe Mode", kind: "warning" },
    );
    if (confirmed) launchSafeMode.mutate();
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
            <span className="font-medium">{gameStatus?.active_profile ?? "Default"}</span>
          </InfoRow>
        </CardContent>
      </Card>

      {/* Launch */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="size-4" />
            Launch
          </CardTitle>
          <CardDescription>
            Applies to &quot;Play Modded&quot;. The developer console opens with F5 in game and is
            always available in a normal Steam launch if you add the flag there.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <InfoRow label="Enable developer console (-console)">
            <Switch
              checked={appSettings?.console_enabled ?? true}
              disabled={!appSettings || setConsoleEnabled.isPending}
              onCheckedChange={(checked) => setConsoleEnabled.mutate(checked)}
              aria-label="Enable Valheim developer console"
              className="data-checked:bg-[var(--color-success)]"
            />
          </InfoRow>

          <InfoRow label="Steam">
            {steamStatus?.running ? (
              <Badge
                variant="outline"
                className="border-[var(--color-success)]/40 text-[var(--color-success)]"
              >
                Running
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Not running
              </Badge>
            )}
          </InfoRow>
          <p className="text-muted-foreground text-xs">
            Valheim needs the Steam client, but Macheim never touches a running one: Steam is only
            started when it is missing, launched hidden in the background, and the game waits for
            it. For a smaller client window day to day, turn on Steam&apos;s Small Mode (View &rarr;
            Small Mode), or leave Steam running in Offline Mode for offline play.
          </p>
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
            Active mod files are in the game&apos;s BepInEx folder. Saved profiles are in
            ~/Library/Application Support/com.macheim/profiles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="bg-muted text-muted-foreground px-3 py-2 font-mono text-xs break-all">
            {gameStatus?.game_path
              ? `${gameStatus.game_path}/BepInEx/`
              : "~/Library/Application Support/Steam/steamapps/common/Valheim/BepInEx/"}
          </p>
        </CardContent>
      </Card>

      {/* Updates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="size-4" />
            Updates
          </CardTitle>
          <CardDescription>
            Macheim checks quietly in the background and never installs anything without your say.
            Your mods and profiles are untouched by updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <InfoRow label="Installed Version">
            <span className="font-medium">{appVersion ? `v${appVersion}` : "—"}</span>
          </InfoRow>

          {status === "downloading" && (
            <div className="grid gap-1.5">
              <span className="text-muted-foreground text-sm">
                Downloading{version ? ` v${version}` : ""}...
              </span>
              <ProgressBar value={(progress ?? 0) * 100} />
            </div>
          )}

          {status === "available" && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm">
                {version ? `v${version} is available.` : "Update available."}
              </span>
              <Button variant="accent-primary" size="sm" onClick={() => void install()}>
                Install Update
              </Button>
            </div>
          )}

          {status === "ready" && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm">
                {version ? `v${version} is installed.` : "Update installed."} Restart to finish.
              </span>
              <Button variant="accent-primary" size="sm" onClick={() => void restart()}>
                Restart
              </Button>
            </div>
          )}

          {status === "up-to-date" && (
            <p className="text-sm text-[var(--color-success)]">You are on the latest version.</p>
          )}

          {status === "error" && (
            <p className="text-destructive text-sm">Update check failed: {error}</p>
          )}

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void check({ announce: true })}
              disabled={status === "checking" || status === "downloading"}
            >
              {status === "checking" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {status === "checking" ? "Checking..." : "Check for Updates"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Diagnostics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="size-4" />
            Diagnostics
          </CardTitle>
          <CardDescription>
            Analyze the latest Valheim log for a likely culprit, or launch without mods to check
            whether mods are involved at all. Safe mode is reversible from the banner.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => analyzeLogs.mutate()}
            disabled={analyzeLogs.isPending}
          >
            {analyzeLogs.isPending ? <Loader2 className="animate-spin" /> : <FileSearch />}
            Analyze latest log
          </Button>
          <Button
            variant="outline-warning"
            size="sm"
            onClick={() => void handleSafeMode()}
            disabled={launchSafeMode.isPending}
          >
            {launchSafeMode.isPending ? <Loader2 className="animate-spin" /> : <ShieldOff />}
            Launch Safe Mode
          </Button>
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
            Backups contain profile metadata and configuration—not mod binaries or worlds. Restoring
            creates a separate profile. Thunderstore mods must be downloaded again; keep a separate
            copy of manual mods.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {!backupsRequested && (
              <Button variant="outline" size="sm" onClick={() => setBackupsRequested(true)}>
                Load Backups
              </Button>
            )}
            <Button
              variant="accent-primary"
              size="sm"
              onClick={() => {
                setBackupsRequested(true);
                createBackupMutation.mutate();
              }}
              disabled={createBackupMutation.isPending}
            >
              {createBackupMutation.isPending ? <Loader2 className="animate-spin" /> : <Archive />}
              {createBackupMutation.isPending ? "Creating..." : "Create Backup"}
            </Button>
          </div>
          {backupsRequested && backups.length === 0 && (
            <p className="text-muted-foreground text-sm">No backups found.</p>
          )}
          {backups.length > 0 && (
            <div className="divide-border divide-y border">
              {backups.map((b) => (
                <div key={b.filename} className="flex items-center justify-between gap-4 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{b.profile_name}</p>
                    <p className="text-muted-foreground text-xs">
                      {(b.size / 1024).toFixed(1)} KB &middot;{" "}
                      {new Date(b.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => restoreBackupMutation.mutate(b.filename)}
                    disabled={restoreBackupMutation.isPending}
                    title={`Restore ${b.profile_name}`}
                  >
                    {restoreBackupMutation.isPending &&
                    restoreBackupMutation.variables === b.filename ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Download />
                    )}
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
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="size-4" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            These actions are destructive and cannot be undone. Please create a backup first.
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
