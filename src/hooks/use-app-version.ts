import { useQuery } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";

import { appVersionQueryKey } from "../lib/query-keys";

export function useAppVersion(): string | null {
  const { data } = useQuery({
    queryKey: appVersionQueryKey,
    queryFn: getVersion,
    staleTime: Infinity,
  });

  return data ?? null;
}
