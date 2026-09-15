import { ChevronDown, User, Check } from "lucide-react";
import { useState, useRef, useEffect } from "react";

import { getActiveProfile, listProfiles, switchProfile } from "../../lib/tauri";
import { useAppStore } from "../../store/appStore";
import { useProfileStore } from "../../store/profileStore";

export default function ProfileSelector() {
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const setProfiles = useProfileStore((s) => s.setProfiles);
  const setActiveProfile = useProfileStore((s) => s.setActiveProfile);
  const addToast = useAppStore((s) => s.addToast);

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load profiles on mount
  useEffect(() => {
    async function load() {
      try {
        const data = await listProfiles();
        setProfiles(data);
        setActiveProfile(await getActiveProfile());
      } catch {
        // Backend may not be ready; use defaults
        setProfiles([
          {
            name: "Default",
            mods: [],
            description: "",
            compatibility: { automatic: true, disabled_rules: [] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);
      }
    }
    load();
  }, [setProfiles, setActiveProfile]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleSwitch = async (name: string) => {
    if (name === activeProfile) {
      setOpen(false);
      return;
    }
    try {
      await switchProfile(name);
      setActiveProfile(name);
      addToast({ type: "success", message: `Switched to profile "${name}"` });
    } catch (err) {
      addToast({
        type: "error",
        message: `Failed to switch profile: ${err}`,
      });
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-input)] px-3 py-2 text-sm text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-accent)]"
      >
        <User size={14} className="shrink-0 text-[var(--color-text-muted)]" />
        <span className="flex-1 truncate text-left">{activeProfile}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-xl shadow-black/40">
          {profiles.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--color-text-muted)]">No profiles</div>
          ) : (
            profiles.map((profile) => (
              <button
                key={profile.name}
                onClick={() => handleSwitch(profile.name)}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  profile.name === activeProfile
                    ? "bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)]"
                } `}
              >
                <span className="flex-1 truncate">{profile.name}</span>
                {profile.name === activeProfile && <Check size={14} className="shrink-0" />}
                <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                  {profile.mods.length} mods
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
