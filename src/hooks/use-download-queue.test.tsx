import { afterEach, beforeEach, expect, mock, test } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import type { DownloadItem, DownloadQueueSnapshot } from "../lib/types";

type QueueHandler = (event: { payload: DownloadQueueSnapshot }) => void;
const handlers = new Map<string, QueueHandler>();

let initialSnapshot: DownloadQueueSnapshot = { paused: false, items: [] };

interface ToastOptions {
  id?: string;
  title?: string;
  description?: string;
}
const toastAdd = mock((_options: ToastOptions) => "toast-id");
const toastClose = mock((_id?: string) => {});

void mock.module("@tauri-apps/api/event", () => ({
  listen: mock((event: string, handler: QueueHandler) => {
    handlers.set(event, handler);
    return Promise.resolve(() => handlers.delete(event));
  }),
}));
void mock.module("../components/ui/toast", () => ({
  toast: { add: toastAdd, close: toastClose },
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

function emit(snapshot: DownloadQueueSnapshot) {
  handlers.get("download-queue-changed")?.({ payload: snapshot });
}

beforeEach(() => {
  handlers.clear();
  initialSnapshot = { paused: false, items: [] };
  toastAdd.mockClear();
  toastClose.mockClear();
  useDownloadStore.setState({
    paused: false,
    items: [],
    panelOpen: false,
    overlayDismissed: false,
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

test("a first snapshot with finished items stays quiet", async () => {
  initialSnapshot = {
    paused: false,
    items: [
      item({ id: 4, status: "completed" }),
      item({ id: 5, status: "waiting_for_game", full_name: "Author-Other" }),
    ],
  };
  const invalidate = mock(() => Promise.resolve());
  queryClient.invalidateQueries = invalidate as unknown as typeof queryClient.invalidateQueries;

  renderHook(() => useDownloadQueueSync(), { wrapper });
  await waitFor(() => expect(useDownloadStore.getState().items).toHaveLength(2));

  expect(toastAdd).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
});

test("batch completions update one toast and invalidate once", async () => {
  initialSnapshot = { paused: false, items: [item({ id: 4, status: "downloading" })] };
  const invalidate = mock(() => Promise.resolve());
  queryClient.invalidateQueries = invalidate as unknown as typeof queryClient.invalidateQueries;

  renderHook(() => useDownloadQueueSync(), { wrapper });
  await waitFor(() => expect(useDownloadStore.getState().items[0]?.status).toBe("downloading"));

  emit({
    paused: false,
    items: [
      item({ id: 4, status: "completed", installed_count: 2 }),
      item({
        id: 5,
        full_name: "Author-Other",
        name: "Other",
        status: "completed",
        installed_count: 1,
      }),
    ],
  });

  await waitFor(() => expect(toastAdd).toHaveBeenCalledTimes(1));
  const toast = toastAdd.mock.calls[0]?.[0];
  expect(toast?.id).toBe("download-outcome");
  expect(toast?.title).toBe("Installed 2 mods");
  expect(invalidate).toHaveBeenCalledWith({ queryKey: installedModsQueryKey });
});

test("waiting for Valheim reports one toast per episode", async () => {
  initialSnapshot = {
    paused: false,
    items: [
      item({ id: 1 }),
      item({ id: 2, full_name: "Author-Two" }),
      item({ id: 3, full_name: "Author-Three" }),
    ],
  };

  renderHook(() => useDownloadQueueSync(), { wrapper });
  await waitFor(() => expect(useDownloadStore.getState().items).toHaveLength(3));

  emit({
    paused: false,
    items: [
      item({ id: 1, status: "waiting_for_game" }),
      item({ id: 2, full_name: "Author-Two", status: "waiting_for_game" }),
      item({ id: 3, full_name: "Author-Three", status: "waiting_for_game" }),
    ],
  });

  expect(toastAdd).toHaveBeenCalledTimes(1);
  const toast = toastAdd.mock.calls[0]?.[0];
  expect(toast?.id).toBe("download-waiting");
  expect(toast?.title).toBe("Waiting for Valheim to close");
  expect(toast?.description).toBe("3 installs queued");

  emit({
    paused: false,
    items: [
      item({ id: 1, status: "downloading" }),
      item({ id: 2, full_name: "Author-Two" }),
      item({ id: 3, full_name: "Author-Three" }),
    ],
  });

  expect(toastClose).toHaveBeenCalledWith("download-waiting");
});

test("network waits are aggregated across items", async () => {
  initialSnapshot = {
    paused: false,
    items: [item({ id: 1 }), item({ id: 2, full_name: "Author-Two" })],
  };

  renderHook(() => useDownloadQueueSync(), { wrapper });
  await waitFor(() => expect(useDownloadStore.getState().items).toHaveLength(2));

  emit({
    paused: false,
    items: [
      item({ id: 1, status: "waiting_for_network", retry_count: 1 }),
      item({ id: 2, full_name: "Author-Two", status: "waiting_for_network", retry_count: 1 }),
    ],
  });

  expect(toastAdd).toHaveBeenCalledTimes(1);
  const toast = toastAdd.mock.calls[0]?.[0];
  expect(toast?.id).toBe("download-waiting");
  expect(toast?.title).toBe("No connection — retrying automatically");
  expect(toast?.description).toBe("2 installs waiting");
});

test("retry cycles do not repeat the offline toast, recovery closes it", async () => {
  initialSnapshot = { paused: false, items: [item({ id: 1 })] };

  renderHook(() => useDownloadQueueSync(), { wrapper });
  await waitFor(() => expect(useDownloadStore.getState().items).toHaveLength(1));

  emit({
    paused: false,
    items: [item({ id: 1, status: "waiting_for_network", retry_count: 1 })],
  });
  expect(toastAdd).toHaveBeenCalledTimes(1);

  // Between retries the item is queued again but still in its offline
  // episode: no second toast.
  emit({ paused: false, items: [item({ id: 1, retry_count: 1 })] });
  emit({
    paused: false,
    items: [item({ id: 1, status: "waiting_for_network", retry_count: 2 })],
  });
  expect(toastAdd).toHaveBeenCalledTimes(1);
  expect(toastClose).not.toHaveBeenCalled();

  emit({
    paused: false,
    items: [item({ id: 1, status: "completed", retry_count: 2, installed_count: 1 })],
  });
  expect(toastClose).toHaveBeenCalledWith("download-waiting");
});
