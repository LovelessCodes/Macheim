import { confirm } from "@tauri-apps/plugin-dialog";
import { ArchiveRestore, Camera, DatabaseBackup, HardDrive, Loader2, Trash2 } from "lucide-react";

import { useAppSettings, useSetSnapshotSaves } from "../../hooks/use-app-settings";
import {
  useCreateSaveSnapshot,
  useDeleteSaveSnapshot,
  useRestoreSaveSnapshot,
  useSaveOverview,
} from "../../hooks/use-saves";
import { formatBytes } from "../../lib/format";
import type { SaveSnapshot, SaveWorld } from "../../lib/types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Switch } from "../ui/switch";

function SaveGroup({ title, items }: { title: string; items: SaveWorld[] }) {
  return (
    <div>
      <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
        {title} ({items.length})
      </h4>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No {title.toLowerCase()} in the save folder.
        </p>
      ) : (
        <div className="divide-border divide-y border">
          {items.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-4 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="text-muted-foreground text-xs">
                  {item.files} file{item.files === 1 ? "" : "s"} &middot; {formatBytes(item.size)}
                  {item.modified ? ` · ${new Date(item.modified).toLocaleDateString()}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SnapshotRow({
  snapshot,
  restoring,
  deleting,
  onRestore,
  onDelete,
}: {
  snapshot: SaveSnapshot;
  restoring: boolean;
  deleting: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{snapshot.label}</p>
          <Badge variant={snapshot.automatic ? "secondary" : "outline"}>
            {snapshot.automatic ? "Auto" : "Manual"}
          </Badge>
        </div>
        <p className="text-muted-foreground text-xs">
          {new Date(snapshot.created_at).toLocaleString()} &middot; {snapshot.worlds} world
          {snapshot.worlds === 1 ? "" : "s"} &middot; {snapshot.characters} character
          {snapshot.characters === 1 ? "" : "s"} &middot; {formatBytes(snapshot.size)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onRestore}
          disabled={restoring || deleting}
          title="Replace current saves with this snapshot"
        >
          {restoring ? <Loader2 className="animate-spin" /> : <ArchiveRestore />}
          Restore
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete snapshot ${snapshot.label}`}
          onClick={onDelete}
          disabled={restoring || deleting}
          className="text-muted-foreground hover:text-destructive"
        >
          {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </div>
    </div>
  );
}

export default function SavesPage() {
  const { data: overview, isPending } = useSaveOverview();
  const { data: appSettings } = useAppSettings();
  const setSnapshotSaves = useSetSnapshotSaves();
  const createSnapshot = useCreateSaveSnapshot();
  const restoreSnapshot = useRestoreSaveSnapshot();
  const deleteSnapshot = useDeleteSaveSnapshot();

  const handleRestore = async (snapshot: SaveSnapshot) => {
    const confirmed = await confirm(
      `Restore "${snapshot.label}"? Current worlds and characters will be replaced. ` +
        "A safety snapshot of the current state is taken first.",
      { title: "Restore save snapshot", kind: "warning" },
    );
    if (confirmed) restoreSnapshot.mutate(snapshot.id);
  };

  const handleDelete = async (snapshot: SaveSnapshot) => {
    const confirmed = await confirm(`Delete the snapshot "${snapshot.label}"?`, {
      title: "Delete snapshot",
      kind: "warning",
    });
    if (confirmed) deleteSnapshot.mutate(snapshot.id);
  };

  const snapshots = overview?.snapshots ?? [];
  const hasSaves = (overview?.worlds.length ?? 0) + (overview?.characters.length ?? 0) > 0;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="size-4" />
            Save Files
          </CardTitle>
          <CardDescription>
            {overview?.save_dir
              ? `Worlds and characters in ${overview.save_dir}. Snapshots live in Macheim's app data folder.`
              : "Valheim save folder not found. Play the game once so it creates your saves."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm">
              <Switch
                checked={appSettings?.snapshot_saves ?? true}
                disabled={!appSettings || setSnapshotSaves.isPending}
                onCheckedChange={(checked) => setSnapshotSaves.mutate(checked)}
                aria-label="Snapshot saves before every modded launch"
                className="data-checked:bg-[var(--color-success)]"
              />
              <span className="text-muted-foreground">
                Snapshot before every modded launch (keeps the last 5)
              </span>
            </div>

            <Button
              variant="accent-primary"
              size="sm"
              onClick={() => createSnapshot.mutate(undefined)}
              disabled={createSnapshot.isPending || !hasSaves}
              title={hasSaves ? "Snapshot worlds and characters" : "No saves to snapshot yet"}
            >
              {createSnapshot.isPending ? <Loader2 className="animate-spin" /> : <Camera />}
              {createSnapshot.isPending ? "Snapshotting..." : "Create Snapshot"}
            </Button>
          </div>

          {isPending ? (
            <p className="text-muted-foreground text-sm">Loading saves...</p>
          ) : (
            <div className="grid gap-4">
              {!hasSaves && (
                <p className="text-muted-foreground text-sm">
                  Nothing to snapshot yet. Characters you use on servers are stored here too, so
                  worlds are not required &mdash; play once and they will show up.
                </p>
              )}
              <SaveGroup title="Worlds" items={overview?.worlds ?? []} />
              <SaveGroup title="Characters" items={overview?.characters ?? []} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseBackup className="size-4" />
            Snapshots
          </CardTitle>
          <CardDescription>
            Restoring replaces every world and character file with the snapshot's version; the
            current state is kept as a safety snapshot first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <p className="text-muted-foreground text-sm">No snapshots yet.</p>
          ) : (
            <div className="divide-border divide-y border">
              {snapshots.map((snapshot) => (
                <SnapshotRow
                  key={snapshot.id}
                  snapshot={snapshot}
                  restoring={restoreSnapshot.isPending && restoreSnapshot.variables === snapshot.id}
                  deleting={deleteSnapshot.isPending && deleteSnapshot.variables === snapshot.id}
                  onRestore={() => void handleRestore(snapshot)}
                  onDelete={() => void handleDelete(snapshot)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
