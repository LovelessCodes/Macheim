import { useState, useRef, useEffect } from "react";
import { ChevronDown, User, Check } from "lucide-react";
import { useProfileStore } from "../../store/profileStore";
import { getActiveProfile, listProfiles, switchProfile } from "../../lib/tauri";
import { toast } from "../ui/toast";

export default function ProfileSelector() {
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const setProfiles = useProfileStore((s) => s.setProfiles);
  const setActiveProfile = useProfileStore((s) => s.setActiveProfile);

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
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
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
      toast.add({ type: "success", title: `Switched to profile "${name}"` });
    } catch (err) {
      toast.add({
        type: "error",
        title: `Failed to switch profile: ${err}`,
      });
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm
          bg-[var(--color-bg-input)] border border-[var(--color-border-default)]
          text-[var(--color-text-primary)] hover:border-[var(--color-border-accent)]
          transition-colors cursor-pointer"
      >
        <User size={14} className="text-[var(--color-text-muted)] shrink-0" />
        <span className="flex-1 text-left truncate">{activeProfile}</span>
        <ChevronDown
          size={14}
          className={`text-[var(--color-text-muted)] shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-30 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-xl shadow-black/40 overflow-hidden">
          {profiles.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
              No profiles
            </div>
          ) : (
            profiles.map((profile) => (
              <button
                key={profile.name}
                onClick={() => handleSwitch(profile.name)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer
                  ${
                    profile.name === activeProfile
                      ? "bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)]"
                  }
                `}
              >
                <span className="flex-1 truncate">{profile.name}</span>
                {profile.name === activeProfile && (
                  <Check size={14} className="shrink-0" />
                )}
                <span className="text-xs text-[var(--color-text-muted)] shrink-0">
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
