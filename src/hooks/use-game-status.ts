import { useQuery } from "@tanstack/react-query";

import { gameStatusQueryKey } from "../lib/query-keys";
import { detectGame } from "../lib/tauri";

export function useGameStatus() {
  return useQuery({
    queryKey: gameStatusQueryKey,
    queryFn: detectGame,
    staleTime: Infinity,
  });
}
