import { useQuery } from "@tanstack/react-query";

import { logsQueryKey } from "../lib/query-keys";
import { getLatestLog } from "../lib/tauri";

/** The latest Valheim log. Refetched on demand; never cached stale. */
export function useLatestLog() {
  return useQuery({
    queryKey: logsQueryKey,
    queryFn: getLatestLog,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}
