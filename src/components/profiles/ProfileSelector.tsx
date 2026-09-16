import { useEffect } from "react";
import { Check, ChevronDown, User } from "lucide-react";
import { useProfileStore } from "../../store/profileStore";
import { getActiveProfile, listProfiles, switchProfile } from "../../lib/tauri";
import { toast } from "../ui/toast";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export default function ProfileSelector() {
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const setProfiles = useProfileStore((s) => s.setProfiles);
  const setActiveProfile = useProfileStore((s) => s.setActiveProfile);

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

  const handleSwitch = async (name: string) => {
    if (name === activeProfile) return;
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
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="group/trigger w-full justify-between font-normal"
          />
        }
      >
        <User className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">
          {activeProfile}
        </span>
        <ChevronDown className="shrink-0 text-muted-foreground transition-transform group-data-[popup-open]/trigger:rotate-180" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        {profiles.length === 0 ? (
          <DropdownMenuItem disabled>No profiles</DropdownMenuItem>
        ) : (
          profiles.map((profile) => (
            <DropdownMenuItem
              key={profile.name}
              onClick={() => handleSwitch(profile.name)}
            >
              <span className="min-w-0 flex-1 truncate">{profile.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {profile.mods.length} mods
              </span>
              {profile.name === activeProfile && (
                <Check className="shrink-0 text-[var(--color-accent-primary)]" />
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
