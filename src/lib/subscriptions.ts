import type { ProfileSubscription, Subscription, ThunderstorePackage } from "./types";

/** How a profile's subscription relates to the current store catalog. */
export interface SubscriptionStatus {
  /** The store listing, when the catalog still carries it. */
  pack: ThunderstorePackage | null;
  /** Newest published pack version, when the catalog carries the pack. */
  latestVersion: string | null;
  updateAvailable: boolean;
  /** The pack is missing from the catalog or deprecated upstream. */
  unavailable: boolean;
}

export function subscriptionStatus(
  subscription: Subscription,
  packages: ThunderstorePackage[],
): SubscriptionStatus {
  const pack = packages.find((pkg) => pkg.full_name === subscription.modpack) ?? null;
  if (!pack || pack.is_deprecated) {
    return { pack, latestVersion: null, updateAvailable: false, unavailable: true };
  }
  return {
    pack,
    latestVersion: pack.version_number,
    updateAvailable: pack.version_number !== subscription.version,
    unavailable: false,
  };
}

export function subscriptionForProfile(
  subscriptions: ProfileSubscription[],
  profile: string,
): Subscription | null {
  return subscriptions.find((entry) => entry.profile === profile)?.subscription ?? null;
}

/**
 * Subscriptions diff against Thunderstore dependency data, so a package that
 * is only listed on Hexium cannot be followed.
 */
export function canFollowModpack(pkg: ThunderstorePackage): boolean {
  if (pkg.source === "thunderstore") return true;
  return (pkg.alternates ?? []).some((alternate) => alternate.source === "thunderstore");
}

/** Profile-name rules, mirrored from the backend's `validate_name`. */
export function isValidProfileName(name: string): boolean {
  if (
    name.length === 0 ||
    name.length > 120 ||
    name.startsWith(".") ||
    name.trim() !== name ||
    /[\\/:]/.test(name)
  ) {
    return false;
  }
  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  return true;
}
