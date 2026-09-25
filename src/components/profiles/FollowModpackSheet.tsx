import { BookmarkPlus, Check, Loader2 } from "lucide-react";
import { useState } from "react";

import { useCreateProfile, useProfiles } from "../../hooks/use-profiles";
import { useSubscribeToModpack, useSubscriptions } from "../../hooks/use-subscriptions";
import { isValidProfileName } from "../../lib/subscriptions";
import type { ThunderstorePackage } from "../../lib/types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";

interface FollowModpackSheetProps {
  pkg: ThunderstorePackage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function FollowModpackSheet({ pkg, open, onOpenChange }: FollowModpackSheetProps) {
  const { data } = useProfiles();
  const { data: subscriptions = [] } = useSubscriptions();
  const createProfileMutation = useCreateProfile();
  const subscribeMutation = useSubscribeToModpack();

  const profiles = data?.profiles ?? [];
  const linked = new Set(subscriptions.map((entry) => entry.profile));
  const unlinked = profiles.filter((profile) => !linked.has(profile.name));

  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState(pkg.name);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);

  const isPending = createProfileMutation.isPending || subscribeMutation.isPending;
  const trimmedName = name.trim();
  const canSubmit =
    !isPending && (mode === "new" ? isValidProfileName(trimmedName) : selectedProfile !== null);

  const handleFollow = async () => {
    if (!canSubmit) return;

    try {
      let profile = selectedProfile;
      if (mode === "new") {
        await createProfileMutation.mutateAsync(trimmedName);
        profile = trimmedName;
      }
      if (!profile) return;

      await subscribeMutation.mutateAsync({ profile, modpack: pkg.full_name });
      onOpenChange(false);
    } catch {
      // Both mutations report their own errors.
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookmarkPlus className="size-4" />
            Follow {pkg.name}
          </SheetTitle>
          <SheetDescription>
            Keep a profile in step with {pkg.full_name} v{pkg.version_number}. Following only
            records the link — use Sync on the profile to install the pack's mods.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-3 p-4">
          <div className="flex items-center gap-2">
            <Button
              variant={mode === "new" ? "accent-primary" : "outline"}
              size="sm"
              onClick={() => setMode("new")}
            >
              New profile
            </Button>
            <Button
              variant={mode === "existing" ? "accent-primary" : "outline"}
              size="sm"
              onClick={() => setMode("existing")}
              disabled={unlinked.length === 0}
              title={
                unlinked.length === 0
                  ? "Every profile already follows a modpack, or none exist yet."
                  : undefined
              }
            >
              Existing profile
            </Button>
          </div>

          {mode === "new" ? (
            <div className="grid gap-1.5">
              <label htmlFor="follow-profile-name" className="text-muted-foreground text-xs">
                Profile name
              </label>
              <Input
                id="follow-profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleFollow();
                }}
                placeholder="Profile name"
                aria-invalid={trimmedName.length > 0 && !isValidProfileName(trimmedName)}
              />
              {trimmedName.length > 0 && !isValidProfileName(trimmedName) ? (
                <p className="text-destructive text-xs">
                  Use a nonempty name without path separators, a leading dot or surrounding spaces.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-1.5">
              <span className="text-muted-foreground text-xs">Profile</span>
              <Select
                items={unlinked.map((profile) => ({ value: profile.name, label: profile.name }))}
                value={selectedProfile}
                onValueChange={(next) => setSelectedProfile(next as string | null)}
              >
                <SelectTrigger aria-label="Profile to follow the modpack">
                  <SelectValue placeholder="Choose a profile" />
                </SelectTrigger>
                <SelectContent>
                  {unlinked.map((profile) => (
                    <SelectItem key={profile.name} value={profile.name}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="accent-primary"
            onClick={() => void handleFollow()}
            disabled={!canSubmit}
          >
            {isPending ? <Loader2 className="animate-spin" /> : <Check />}
            Follow
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
