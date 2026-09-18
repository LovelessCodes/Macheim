import { useQuery } from "@tanstack/react-query";

import { gameStatusQueryKey, steamStatusQueryKey } from "../lib/query-keys";
import { detectGame, getSteamStatus } from "../lib/tauri";

export function useGameStatus() {
  return useQuery({
    queryKey: gameStatusQueryKey,
    queryFn: detectGame,
    staleTime: Infinity,
  });
}

/** Whether the Steam client is running (polls occasionally). */
export function useSteamStatus() {
  return useQuery({
    queryKey: steamStatusQueryKey,
    queryFn: getSteamStatus,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
