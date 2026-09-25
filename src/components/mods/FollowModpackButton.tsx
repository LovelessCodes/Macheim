import { BookmarkPlus } from "lucide-react";
import { useState } from "react";

import { useSubscriptions } from "../../hooks/use-subscriptions";
import { canFollowModpack } from "../../lib/subscriptions";
import type { ThunderstorePackage } from "../../lib/types";
import FollowModpackSheet from "../profiles/FollowModpackSheet";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

/**
 * Follow action for a modpack card. Hidden for Hexium-only listings, which
 * have no dependency data to diff against, and replaced by a badge once the
 * pack is followed.
 */
export default function FollowModpackButton({ pkg }: { pkg: ThunderstorePackage }) {
  const { data: subscriptions = [] } = useSubscriptions();
  const [open, setOpen] = useState(false);

  if (!canFollowModpack(pkg)) return null;

  const following = subscriptions.find((entry) => entry.subscription.modpack === pkg.full_name);
  if (following) {
    return (
      <Badge
        variant="outline"
        className="border-accent-primary/40 text-accent-primary"
        title={`Followed by profile "${following.profile}"`}
      >
        Following
      </Badge>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <BookmarkPlus />
        Follow
      </Button>
      {open && (
        <FollowModpackSheet key={pkg.full_name} pkg={pkg} open={open} onOpenChange={setOpen} />
      )}
    </>
  );
}
