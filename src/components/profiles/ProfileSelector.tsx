import { Check, ChevronDown, Layers, User } from "lucide-react";

import { useProfiles, useSwitchProfile } from "../../hooks/use-profiles";
import { useSubscriptions } from "../../hooks/use-subscriptions";
import { subscriptionForProfile } from "../../lib/subscriptions";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export default function ProfileSelector() {
  const { data } = useProfiles();
  const { data: subscriptions = [] } = useSubscriptions();
  const switchProfileMutation = useSwitchProfile();
  const profiles = data?.profiles ?? [];
  const activeProfile = data?.activeProfile ?? "Default";
  const activeSubscription = subscriptionForProfile(subscriptions, activeProfile);

  const handleSwitch = (name: string) => {
    if (name === activeProfile) return;
    switchProfileMutation.mutate(name);
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
        {activeSubscription && (
          <Layers
            className="text-accent-primary shrink-0"
            aria-label={`Follows ${activeSubscription.modpack}`}
          />
        )}
        <ChevronDown className="text-muted-foreground shrink-0 transition-transform group-data-[popup-open]/trigger:rotate-180" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        {profiles.length === 0 ? (
          <DropdownMenuItem disabled>No profiles</DropdownMenuItem>
        ) : (
          profiles.map((profile) => {
            const subscription = subscriptionForProfile(subscriptions, profile.name);

            return (
              <DropdownMenuItem key={profile.name} onClick={() => handleSwitch(profile.name)}>
                <span className="min-w-0 flex-1 truncate">{profile.name}</span>
                {subscription && (
                  <Layers
                    className="text-accent-primary shrink-0"
                    aria-label={`Follows ${subscription.modpack}`}
                  />
                )}
                <span className="text-muted-foreground shrink-0 text-xs">
                  {profile.mods.length} mods
                </span>
                {profile.name === activeProfile && (
                  <Check className="shrink-0 text-[var(--color-accent-primary)]" />
                )}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
