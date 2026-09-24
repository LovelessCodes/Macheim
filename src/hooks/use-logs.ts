import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { applyLogChunk, type LogSnapshot } from "../lib/log-follow";
import { logsQueryKey } from "../lib/query-keys";
import { getLatestLog, readLogSince } from "../lib/tauri";

/** The latest Valheim log. Refetched on demand; never cached stale. */
export function useLatestLog() {
  return useQuery({
    queryKey: logsQueryKey,
    queryFn: getLatestLog,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

const FOLLOW_INTERVAL_MS = 1000;

/**
 * Follows the log while `following` is true, appending new lines to `seed`.
 * Polling pauses while the window is hidden and stops on disable or unmount.
 * A new `seed` (an initial load or a manual refresh) restarts the buffer.
 */
export function useLogFollower(seed: LogSnapshot | null, following: boolean) {
  const [state, setState] = useState<{ seed: LogSnapshot | null; snapshot: LogSnapshot | null }>({
    seed,
    snapshot: seed,
  });
  const latest = useRef<LogSnapshot | null>(state.snapshot);

  // A new seed restarts the buffer. Adjusting during render (instead of in an
  // effect) keeps the displayed log in step with the query without a second
  // render pass.
  if (state.seed !== seed) {
    setState({ seed, snapshot: seed });
  }

  useEffect(() => {
    latest.current = state.snapshot;
  }, [state.snapshot]);

  useEffect(() => {
    if (!following) return;

    let cancelled = false;

    const tick = async () => {
      const current = latest.current;
      if (!current || document.hidden) return;
      try {
        const chunk = await readLogSince(current.offset, current.path);
        if (cancelled) return;
        setState((prev) => ({ ...prev, snapshot: applyLogChunk(prev.snapshot, chunk) }));
      } catch {
        // A transient read failure is not fatal: the next tick retries.
      }
    };

    const interval = setInterval(() => void tick(), FOLLOW_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [following]);

  return state.snapshot;
}
