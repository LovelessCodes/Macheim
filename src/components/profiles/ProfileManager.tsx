import { confirm } from "@tauri-apps/plugin-dialog";
import { Plus, Trash2, User, Check, X, Clock, Package } from "lucide-react";
import { useEffect, useState } from "react";

import { listProfiles, createProfile, switchProfile, deleteProfile } from "../../lib/tauri";
import { useAppStore } from "../../store/appStore";
import { useProfileStore } from "../../store/profileStore";

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function ProfileManager() {
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const setProfiles = useProfileStore((s) => s.setProfiles);
  const setActiveProfile = useProfileStore((s) => s.setActiveProfile);
  const addToast = useAppStore((s) => s.addToast);

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
      addToast({ type: "success", message: `Created profile "${name}"` });
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to create profile: ${err}`,
      });
    }
  };

  const handleSwitch = async (name: string) => {
    if (name === activeProfile) return;
    try {
      await switchProfile(name);
      setActiveProfile(name);
      addToast({ type: "success", message: `Switched to "${name}"` });
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to switch profile: ${err}`,
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
      addToast({
        type: "warning",
        message: "Cannot delete the active profile. Switch to another first.",
      });
      return;
    }

    setDeletingProfile(name);
    try {
      await deleteProfile(name);
      setProfiles(profiles.filter((p) => p.name !== name));
      addToast({
        type: "info",
        message: `Removed "${name}". Recoverable from the deleted-profiles data folder.`,
      });
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to delete profile: ${err}`,
      });
    } finally {
      setDeletingProfile(null);
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Mod Profiles</h3>
          <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
            Manage separate mod configurations for different playstyles.
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--color-accent-primary)] px-3.5 py-2 text-sm font-medium text-white transition-all hover:bg-[var(--color-accent-primary-hover)] active:scale-[0.98]"
        >
          <Plus size={16} />
          New Profile
        </button>
      </div>

      {/* Create form */}
      {isCreating && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--color-accent-primary)]/30 bg-[var(--color-accent-primary)]/5 p-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setIsCreating(false);
                setNewName("");
              }
            }}
            placeholder="Profile name..."
            autoFocus
            className="flex-1 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-input)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-primary)] focus:outline-none"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="cursor-pointer rounded-md bg-[var(--color-accent-primary)] p-2 text-white transition-colors hover:bg-[var(--color-accent-primary-hover)] disabled:opacity-50"
          >
            <Check size={16} />
          </button>
          <button
            onClick={() => {
              setIsCreating(false);
              setNewName("");
            }}
            className="cursor-pointer rounded-md p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-card)]"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Profile list */}
      <div className="space-y-2">
        {profiles.map((profile) => {
          const isActive = profile.name === activeProfile;
          const isDeleting = deletingProfile === profile.name;

          return (
            <div
              key={profile.name}
              className={`flex items-center gap-4 rounded-lg border p-4 transition-all ${
                isActive
                  ? "border-[var(--color-accent-primary)]/30 bg-[var(--color-accent-primary)]/5"
                  : "border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-card-hover)]"
              } `}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  isActive ? "bg-[var(--color-accent-primary)]/15" : "bg-[var(--color-bg-input)]"
                } `}
              >
                <User
                  size={18}
                  className={
                    isActive
                      ? "text-[var(--color-accent-primary)]"
                      : "text-[var(--color-text-muted)]"
                  }
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {profile.name}
                  </h4>
                  {isActive && (
                    <span className="rounded-full bg-[var(--color-accent-primary)]/20 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--color-accent-primary)] uppercase">
                      Active
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                  <span className="flex items-center gap-1">
                    <Package size={11} />
                    {profile.mods.length} mods
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    Updated {formatDate(profile.updated_at)}
                  </span>
                </div>
              </div>

              {!isActive && (
                <button
                  onClick={() => handleSwitch(profile.name)}
                  className="cursor-pointer rounded-md border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
                >
                  Switch
                </button>
              )}

              {!isActive && (
                <button
                  onClick={() => handleDelete(profile.name)}
                  disabled={isDeleting}
                  className="cursor-pointer rounded-lg p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] disabled:opacity-50"
                  title="Delete profile"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {profiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <User size={48} className="mb-4 text-[var(--color-text-muted)]" />
          <h3 className="mb-1 text-lg font-semibold text-[var(--color-text-secondary)]">
            No profiles
          </h3>
          <p className="text-sm text-[var(--color-text-muted)]">Create a profile to get started.</p>
        </div>
      )}
    </div>
  );
}
