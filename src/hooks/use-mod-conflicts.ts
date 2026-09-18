import { useQuery } from "@tanstack/react-query";

import { modConflictsQueryKey } from "../lib/query-keys";
import { detectModConflicts } from "../lib/tauri";

/** Potential conflicts in the active profile (duplicate files, version clashes). */
export function useModConflicts() {
  return useQuery({
    queryKey: modConflictsQueryKey,
    queryFn: detectModConflicts,
    staleTime: 30_000,
    retry: false,
  });
}
