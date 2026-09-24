import type { ModpackMetadata } from "./types";

/** Thunderstore's description limit, mirrored from the backend. */
export const MAX_MODPACK_DESCRIPTION = 250;

const NAME_RE = /^[A-Za-z0-9_]+$/;

function isSemver(raw: string): boolean {
  const core = raw.split(/[-+]/)[0] ?? "";
  const parts = core.split(".");
  return parts.length === 3 && parts.every((part) => /^\d+$/.test(part));
}

/** The first validation problem with the metadata, or null when it is valid. */
export function validateModpackMetadata(metadata: ModpackMetadata): string | null {
  const name = metadata.name.trim();
  if (!name || name.length > 128 || !NAME_RE.test(name)) {
    return "Names may only contain letters, numbers and underscores";
  }
  if (!isSemver(metadata.version.trim())) {
    return "The version must look like 1.0.0";
  }
  if (metadata.description.trim().length > MAX_MODPACK_DESCRIPTION) {
    return `The description must be at most ${MAX_MODPACK_DESCRIPTION} characters`;
  }
  return null;
}
