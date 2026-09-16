import { confirm } from "@tauri-apps/plugin-dialog";
import { cn } from "cn";
import { Plus, Trash2, User, Check, X, Clock, Package, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { formatDate } from "../../lib/format";
import { listProfiles, createProfile, switchProfile, deleteProfile } from "../../lib/tauri";
import { useProfileStore } from "../../store/profileStore";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { toast } from "../ui/toast";

export default function ProfileManager() {
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const setProfiles = useProfileStore((s) => s.setProfiles);
  const setActiveProfile = useProfileStore((s) => s.setActiveProfile);

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [deletingProfile, setDeletingProfile] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await listProfiles();
        setProfiles(data);
      } catch {
        // ok
      }
    }
    load();
  }, [setProfiles]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;

    try {
      const profile = await createProfile(name);
      setProfiles([...profiles, profile]);
      setNewName("");
      setIsCreating(false);
      toast.add({ type: "success", title: `Created profile "${name}"` });
    } catch (err) {
      toast.add({
        type: "error",
        title: `Failed to create profile: ${err}`,
      });
    }
  };

  const handleSwitch = async (name: string) => {
    if (name === activeProfile) return;
    try {
      await switchProfile(name);
      setActiveProfile(name);
      toast.add({ type: "success", title: `Switched to "${name}"` });
    } catch (err) {
      toast.add({
        type: "error",
        title: `Failed to switch profile: ${err}`,
      });
    }
  };

  const handleDelete = async (name: string) => {
    if (
      !(await confirm(
        `Remove profile "${name}"? Its files will be preserved in Macheim's deleted-profiles folder.`,
        { title: "Remove profile", kind: "warning" },
      ))
    )
      return;
    if (name === activeProfile) {
      toast.add({
        type: "warning",
        title: "Cannot delete the active profile. Switch to another first.",
      });
      return;
    }

    setDeletingProfile(name);
    try {
      await deleteProfile(name);
      setProfiles(profiles.filter((p) => p.name !== name));
      toast.add({
        type: "info",
        title: `Removed "${name}". Recoverable from the deleted-profiles data folder.`,
      });
    } catch (err) {
      toast.add({
        type: "error",
        title: `Failed to delete profile: ${err}`,
      });
    } finally {
      setDeletingProfile(null);
    }
  };

  const cancelCreate = () => {
    setIsCreating(false);
    setNewName("");
  };

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
        <Button variant="accent-primary" onClick={() => setIsCreating(true)} disabled={isCreating}>
          <Plus />
          New Profile
        </Button>
      </div>

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
              disabled={!newName.trim()}
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
