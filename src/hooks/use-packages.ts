import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { packagesQueryKey } from "../lib/query-keys";
import { fetchPackages } from "../lib/tauri";

export function usePackages() {
  return useQuery({
    queryKey: packagesQueryKey,
    queryFn: fetchPackages,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    meta: { errorTitle: "Failed to fetch packages" },
  });
}
