import { useEffect } from "react";

import { useUpdaterStore } from "../store/updaterStore";

/** Wait for the app to settle before the quiet background check. */
const STARTUP_CHECK_DELAY_MS = 5000;

/**
 * Check for updates once, a few seconds after launch. The check is silent
 * unless a new version is found; nothing is downloaded without user action.
 */
export function useUpdaterStartup(): void {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void useUpdaterStore.getState().check();
    }, STARTUP_CHECK_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, []);
}

export function useUpdater() {
  return useUpdaterStore();
}
