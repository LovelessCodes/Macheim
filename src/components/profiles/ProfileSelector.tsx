import { Check, ChevronDown, User } from "lucide-react";

import { useProfiles } from "../../hooks/use-profiles";
import { switchProfile } from "../../lib/tauri";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { toast } from "../ui/toast";

export default function ProfileSelector() {
  const { data } = useProfiles();
  const profiles = data?.profiles ?? [];
  const activeProfile = data?.activeProfile ?? "Default";

  const handleSwitch = async (name: string) => {
    if (name === activeProfile) return;
    try {
      await switchProfile(name);
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
          <Button variant="outline" className="group/trigger w-full justify-between font-normal" />
        }
      >
        <User className="text-muted-foreground shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{activeProfile}</span>
        <ChevronDown className="text-muted-foreground shrink-0 transition-transform group-data-[popup-open]/trigger:rotate-180" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        {profiles.length === 0 ? (
          <DropdownMenuItem disabled>No profiles</DropdownMenuItem>
        ) : (
          profiles.map((profile) => (
            <DropdownMenuItem key={profile.name} onClick={() => handleSwitch(profile.name)}>
              <span className="min-w-0 flex-1 truncate">{profile.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
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
