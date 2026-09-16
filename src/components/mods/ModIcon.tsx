import { Package } from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/utils";

const PRIMARY_CDN_HOST = "gcdn.thunderstore.io";
const FALLBACK_CDN_HOST = "hcdn-1.hcdn.thunderstore.io";

/** Thunderstore's backup CDN URL for an icon served from the primary CDN. */
export function fallbackIconUrl(url: string): string | null {
  if (!url.includes(PRIMARY_CDN_HOST)) {
    return null;
  }
  return url.replace(PRIMARY_CDN_HOST, FALLBACK_CDN_HOST);
}

interface ModIconProps {
  src?: string;
  alt: string;
  className?: string;
  iconClassName?: string;
}

/**
 * Mod icon with a backup-CDN fallback. Some antivirus tools (e.g. Malwarebytes)
 * block `gcdn.thunderstore.io`, so a failed load is retried against
 * `hcdn-1.hcdn.thunderstore.io` before falling back to a placeholder.
 */
export default function ModIcon({ src, alt, className, iconClassName }: ModIconProps) {
  const [state, setState] = useState<{ src?: string; stage: number }>({ src, stage: 0 });

  if (state.src !== src) {
    setState({ src, stage: 0 });
  }

  const stage = state.src === src ? state.stage : 0;
  const fallbackSrc = src ? fallbackIconUrl(src) : null;
  const displaySrc = stage === 0 ? src : stage === 1 ? fallbackSrc : null;

  const handleError = () => {
    setState((prev) => {
      const current = prev.src === src ? prev.stage : 0;
      return { src, stage: current + 1 };
    });
  };

  if (!displaySrc) {
    return (
      <div className={cn("bg-muted flex shrink-0 items-center justify-center", className)}>
        <Package className={cn("text-muted-foreground", iconClassName)} />
      </div>
    );
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={cn("bg-muted shrink-0 object-cover", className)}
      loading="lazy"
      onError={handleError}
    />
  );
}
