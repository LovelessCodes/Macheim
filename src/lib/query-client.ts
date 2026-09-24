import { QueryCache, QueryClient } from "@tanstack/react-query";
import type {
  PersistedClient,
  Persister,
  PersistQueryClientOptions,
} from "@tanstack/react-query-persist-client";
import { get, set, del } from "idb-keyval";

import { notify } from "../components/ui/toast";
import { packagesQueryKey } from "./query-keys";

const DAY = 1000 * 60 * 60 * 24;

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const title = query.meta?.errorTitle as string | undefined;
      if (title) notify(`query-error:${title}`, { type: "error", title: `${title}: ${error}` });
    },
  }),
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      // Must be >= maxAge below, or garbage collection discards the restored
      // cache before the persister can hand it back.
      gcTime: DAY,
    },
  },
});

// IndexedDB (via idb-keyval) rather than localStorage: the Thunderstore
// package list is large and can exceed localStorage's ~5MB quota.
function createIDBPersister(idbValidKey: string): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(idbValidKey, client);
    },
    restoreClient: async () => await get<PersistedClient>(idbValidKey),
    removeClient: async () => {
      await del(idbValidKey);
    },
  };
}

export const persister = createIDBPersister("macheim-query-cache");

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister,
  maxAge: DAY,
  // Bump to drop any previously persisted cache after a schema change.
  buster: "v2",
  dehydrateOptions: {
    // Only the (large, slow) Thunderstore package list is worth persisting.
    shouldDehydrateQuery: (query) => query.queryKey[0] === packagesQueryKey[0],
    shouldDehydrateMutation: () => false,
  },
};
