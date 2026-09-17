import { afterEach, beforeEach, expect, mock, test } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import type { DownloadItem, DownloadQueueSnapshot } from "../lib/types";

type QueueHandler = (event: { payload: DownloadQueueSnapshot }) => void;
const handlers = new Map<string, QueueHandler>();

let initialSnapshot: DownloadQueueSnapshot = { paused: false, items: [] };

void mock.module("@tauri-apps/api/event", () => ({
  listen: mock((event: string, handler: QueueHandler) => {
    handlers.set(event, handler);
    return Promise.resolve(() => handlers.delete(event));
  }),
}));
void mock.module("../lib/tauri", () => ({
  getDownloadQueue: mock(() => Promise.resolve(initialSnapshot)),
  enqueueInstall: mock(() => Promise.resolve({})),
}));

import { installedModsQueryKey } from "../lib/query-keys";
import { useDownloadStore } from "../store/downloadStore";
import { useDownloadQueueSync } from "./use-download-queue";

function item(overrides: Partial<DownloadItem> = {}): DownloadItem {
  return {
    id: 1,
    full_name: "Author-Mod",
    name: "Mod",
    version: "1.0.0",
    kind: "mod",
    status: "queued",
    message: "Queued",
    current: 0,
    total: 0,
    bytes_downloaded: 0,
    bytes_total: null,
    error: null,
    retry_count: 0,
    installed_count: 0,
    queued_at: "2026-01-01T00:00:00Z",
    finished_at: null,
    ...overrides,
  };
}

let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  handlers.clear();
  initialSnapshot = { paused: false, items: [] };
  useDownloadStore.setState({
    paused: false,
    items: [],
    panelOpen: false,
    standaloneProgress: null,
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(cleanup);

test("hydrates the store from the initial queue fetch", async () => {
  initialSnapshot = { paused: true, items: [item({ id: 4 })] };

  renderHook(() => useDownloadQueueSync(), { wrapper });

  await waitFor(() => expect(useDownloadStore.getState().items).toHaveLength(1));
  expect(useDownloadStore.getState().paused).toBe(true);
});

test("completing an item invalidates the installed mods query", async () => {
  initialSnapshot = { paused: false, items: [item({ id: 4, status: "downloading" })] };
  const invalidate = mock(() => Promise.resolve());
  queryClient.invalidateQueries = invalidate as unknown as typeof queryClient.invalidateQueries;

  renderHook(() => useDownloadQueueSync(), { wrapper });
  await waitFor(() => expect(useDownloadStore.getState().items[0]?.status).toBe("downloading"));

  handlers.get("download-queue-changed")?.({
    payload: {
      paused: false,
      items: [item({ id: 4, status: "completed", installed_count: 2 })],
    },
  });

  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: installedModsQueryKey }));
  expect(useDownloadStore.getState().items[0]?.status).toBe("completed");
});

test("items already finished on startup do not re-trigger cache refreshes", async () => {
  initialSnapshot = { paused: false, items: [item({ id: 4, status: "completed" })] };
  const invalidate = mock(() => Promise.resolve());
  queryClient.invalidateQueries = invalidate as unknown as typeof queryClient.invalidateQueries;

  renderHook(() => useDownloadQueueSync(), { wrapper });
  await waitFor(() => expect(useDownloadStore.getState().items).toHaveLength(1));

  expect(invalidate).not.toHaveBeenCalled();
});
