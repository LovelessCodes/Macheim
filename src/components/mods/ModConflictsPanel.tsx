import { AlertTriangle } from "lucide-react";

import type { ConflictReport } from "../../lib/types";
import { conflictCount } from "../../lib/types";

function ModNames({ mods }: { mods: string[] }) {
  return (
    <>
      {mods.map((mod, index) => (
        <span key={mod}>
          {index > 0 && (index === mods.length - 1 ? " and " : ", ")}
          <span className="text-foreground font-medium">{mod}</span>
        </span>
      ))}
    </>
  );
}

/**
 * Read-only summary of potential profile conflicts. Nothing here blocks a
 * launch; the panel explains what to try when the game misbehaves.
 */
export default function ModConflictsPanel({ report }: { report: ConflictReport | null }) {
  const total = conflictCount(report);
  if (!report || total === 0) return null;

  return (
    <div className="mb-4 shrink-0 border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-3 text-xs">
      <div className="text-foreground flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4 shrink-0 text-[var(--color-warning)]" />
        {total} potential conflict{total === 1 ? "" : "s"} detected
      </div>

      <ul className="text-muted-foreground mt-2 grid gap-1.5">
        {report.duplicate_dlls.map((duplicate) => (
          <li key={`dll:${duplicate.file_name}`}>
            <code className="text-foreground font-mono">{duplicate.file_name}</code> is provided by{" "}
            <ModNames mods={duplicate.mods} />
          </li>
        ))}

        {report.dependency_conflicts.map((conflict) => (
          <li key={`dep:${conflict.dependency}`}>
            <code className="text-foreground font-mono">{conflict.dependency}</code> is required at
            different versions:{" "}
            {conflict.requirements
              .map(
                (requirement) => `v${requirement.version} by ${requirement.required_by.join(", ")}`,
              )
              .join(" · ")}
          </li>
        ))}

        {report.version_mismatches.map((mismatch) => (
          <li key={`mismatch:${mismatch.dependency}`}>
            <code className="text-foreground font-mono">{mismatch.dependency}</code> v
            {mismatch.installed_version} is installed, but <ModNames mods={mismatch.required_by} />{" "}
            require
            {mismatch.required_by.length === 1 ? "s" : ""} v{mismatch.required_version}
            {mismatch.pinned && (
              <> — pinned, so it stays at v{mismatch.installed_version}; unpin it to update</>
            )}
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground mt-2">
        These do not block launching. If Valheim misbehaves, try disabling one of the mods involved.
      </p>
    </div>
  );
}
