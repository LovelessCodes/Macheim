import { useQuery } from "@tanstack/react-query";

import { compatibilityQueryKey } from "../lib/query-keys";
import { getCompatibility } from "../lib/tauri";

export function useCompatibility() {
  return useQuery({
    queryKey: compatibilityQueryKey,
    queryFn: getCompatibility,
  });
}
