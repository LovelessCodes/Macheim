import { confirm, open } from "@tauri-apps/plugin-dialog";
import { cn } from "cn";
import {
  Plus,
  Trash2,
  User,
  Check,
  X,
  Clock,
  Package,
  Loader2,
  Copy,
  Download,
  Upload,
  FolderOpen,
} from "lucide-react";
import { useState } from "react";

import {
  useCloneProfile,
  useCreateProfile,
  useDeleteProfile,
  useExportProfile,
  useImportSharedProfile,
  useProfiles,
  useSwitchProfile,
} from "../../hooks/use-profiles";
import { formatDate } from "../../lib/format";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { toast } from "../ui/toast";

export default function ProfileManager() {
  const { data } = useProfiles();
  const createProfileMutation = useCreateProfile();
  const switchProfileMutation = useSwitchProfile();
  const deleteProfileMutation = useDeleteProfile();
  const cloneProfileMutation = useCloneProfile();
  const exportProfileMutation = useExportProfile();
  const { importShared, isImporting: isImportPending } = useImportSharedProfile();
  const profiles = data?.profiles ?? [];
  const activeProfile = data?.activeProfile ?? "Default";

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [cloningFrom, setCloningFrom] = useState<string | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importCode, setImportCode] = useState("");
  const [importName, setImportName] = useState("");
  const deletingProfile = deleteProfileMutation.isPending
    ? (deleteProfileMutation.variables ?? null)
    : null;

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;

    createProfileMutation.mutate(name, {
      onSuccess: () => {
        setNewName("");
        setIsCreating(false);
      },
    });
  };

  const handleSwitch = (name: string) => {
    if (name === activeProfile) return;
    switchProfileMutation.mutate(name);
  };

  const handleDelete = async (name: string) => {
    if (name === activeProfile) {
      toast.add({
        type: "warning",
        title: "Cannot delete the active profile. Switch to another first.",
      });
      return;
    }
    if (
      !(await confirm(
        `Remove profile "${name}"? Its files will be preserved in Macheim's deleted-profiles folder.`,
        { title: "Remove profile", kind: "warning" },
      ))
    )
      return;

    deleteProfileMutation.mutate(name);
  };

  const cancelCreate = () => {
    setIsCreating(false);
    setNewName("");
  };

  const startClone = (name: string) => {
    setCloningFrom(name);
    setCloneName(`${name} copy`);
  };

  const cancelClone = () => {
    setCloningFrom(null);
    setCloneName("");
  };

  const handleClone = () => {
    const name = cloneName.trim();
    if (!cloningFrom || !name) return;

    cloneProfileMutation.mutate(
      { sourceName: cloningFrom, newName: name },
      { onSuccess: cancelClone },
    );
  };

  const finishImport = () => {
    setIsImporting(false);
    setImportCode("");
    setImportName("");
  };

  const handleImportCode = () => {
    const code = importCode.trim();
    if (!code) return;

    void importShared({
      kind: "code",
      value: code,
      newName: importName.trim() || undefined,
    }).then((profile) => {
      if (profile) finishImport();
    });
  };

  const handleImportFile = async () => {
    const chosen = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Mod profile", extensions: ["r2z", "json"] }],
    });
    if (typeof chosen !== "string") return;

    void importShared({
      kind: "file",
      value: chosen,
      newName: importName.trim() || undefined,
    }).then((profile) => {
      if (profile) finishImport();
    });
  };

  const cancelImport = finishImport;

  return (
    <div className="grid gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-foreground text-base font-semibold">Mod Profiles</h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Manage separate mod configurations for different playstyles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setIsImporting(true)}
            disabled={isImporting}
            title="Import a shared profile"
          >
            <Upload />
            Import
          </Button>
          <Button
            variant="accent-primary"
            onClick={() => setIsCreating(true)}
            disabled={isCreating}
          >
            <Plus />
            New Profile
          </Button>
        </div>
      </div>

      {/* Import form */}
      {isImporting && (
        <Card className="ring-accent-primary/30 py-3">
          <CardContent className="grid gap-2">
            <p className="text-muted-foreground text-sm">
              Paste a Thunderstore profile code, or choose an <code>.r2z</code> file exported by
              Macheim, r2modman, Gale or Thunderstore Mod Manager. Codes expire after about an hour;
              a file keeps working.
            </p>
            <Input
              value={importCode}
              onChange={(e) => setImportCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleImportCode();
                if (e.key === "Escape") cancelImport();
              }}
              placeholder="Profile code (e.g. 019eb41e-401b-a408-b431-2915043cbf7f)"
              aria-label="Profile code"
              autoFocus
            />
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") cancelImport();
                }}
                placeholder="Profile name (optional)"
                aria-label="Profile name (optional)"
                className="min-w-40 flex-1"
              />
              <Button
                variant="accent-primary"
                onClick={handleImportCode}
                disabled={!importCode.trim() || isImportPending}
              >
                {isImportPending ? <Loader2 className="animate-spin" /> : <Check />}
                Import code
              </Button>
              <Button variant="outline" onClick={handleImportFile} disabled={isImportPending}>
                <FolderOpen />
                Choose file…
              </Button>
              <Button size="icon" variant="ghost" onClick={cancelImport} aria-label="Cancel import">
                <X />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create form */}
      {isCreating && (
        <Card className="ring-accent-primary/30 py-3">
          <CardContent className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") cancelCreate();
              }}
              placeholder="Profile name..."
              aria-label="Profile name"
              autoFocus
              className="flex-1"
            />
            <Button
              size="icon"
              variant="accent-primary"
              onClick={handleCreate}
              disabled={!newName.trim() || createProfileMutation.isPending}
              aria-label="Create profile"
            >
              <Check />
            </Button>
            <Button size="icon" variant="ghost" onClick={cancelCreate} aria-label="Cancel">
              <X />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Clone form */}
      {cloningFrom && (
        <Card className="ring-accent-primary/30 py-3">
          <CardContent className="flex items-center gap-2">
            <span className="text-muted-foreground shrink-0 text-sm">Clone "{cloningFrom}" as</span>
            <Input
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleClone();
                if (e.key === "Escape") cancelClone();
              }}
              placeholder="New profile name..."
              aria-label="Clone profile name"
              autoFocus
              className="flex-1"
            />
            <Button
              size="icon"
              variant="accent-primary"
              onClick={handleClone}
              disabled={!cloneName.trim() || cloneProfileMutation.isPending}
              aria-label="Clone profile"
            >
              <Check />
            </Button>
            <Button size="icon" variant="ghost" onClick={cancelClone} aria-label="Cancel clone">
              <X />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Profile list */}
      {profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <User size={48} className="text-muted-foreground mb-4" />
          <h3 className="text-foreground mb-1 text-lg font-semibold">No profiles</h3>
          <p className="text-muted-foreground text-sm">Create a profile to get started.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {profiles.map((profile) => {
            const isActive = profile.name === activeProfile;
            const isDeleting = deletingProfile === profile.name;

            return (
              <div
                key={profile.name}
                className={cn(
                  "flex items-center gap-4 border p-4",
                  isActive ? "border-accent-primary/30 bg-accent-primary/5" : "bg-card",
                )}
              >
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center",
                    isActive ? "bg-accent-primary/15" : "bg-muted",
                  )}
                >
                  <User
                    className={cn(
                      "size-4",
                      isActive ? "text-accent-primary" : "text-muted-foreground",
                    )}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-foreground truncate text-sm font-semibold">
                      {profile.name}
                    </h4>
                    {isActive && (
                      <Badge className="bg-accent-primary/20 text-accent-primary border-transparent">
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5 flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <Package className="size-3" />
                      {profile.mods.length} mods
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      Updated {formatDate(profile.updated_at)}
                    </span>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => startClone(profile.name)}
                  title="Clone profile"
                  aria-label={`Clone profile ${profile.name}`}
                  className="text-muted-foreground"
                >
                  <Copy />
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => exportProfileMutation.mutate(profile.name)}
                  disabled={exportProfileMutation.isPending}
                  title="Export profile (.r2z)"
                  aria-label={`Export profile ${profile.name}`}
                  className="text-muted-foreground"
                >
                  {exportProfileMutation.isPending &&
                  exportProfileMutation.variables === profile.name ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                </Button>

                {!isActive && (
                  <Button variant="outline" size="sm" onClick={() => handleSwitch(profile.name)}>
                    Switch
                  </Button>
                )}

                {!isActive && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(profile.name)}
                    disabled={isDeleting}
                    title="Delete profile"
                    aria-label={`Delete profile ${profile.name}`}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
