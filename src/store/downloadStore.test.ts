import { beforeEach, expect, test } from "bun:test";

import type { DownloadItem, ModProgressEvent } from "../lib/types";
import { selectOverlayItem, useDownloadStore } from "./downloadStore";

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

function progress(overrides: Partial<ModProgressEvent> = {}): ModProgressEvent {
  return {
    item_id: 7,
    stage: "downloading",
    mod_name: "Author-Mod",
    current: 1,
    total: 2,
    bytes_downloaded: 100,
    bytes_total: 400,
    message: "Downloading...",
    ...overrides,
  };
}

beforeEach(() => {
  useDownloadStore.setState({
    paused: false,
    items: [],
    panelOpen: false,
    standaloneProgress: null,
  });
});

test("queue progress merges into its item by id", () => {
  useDownloadStore.getState().setSnapshot({ paused: false, items: [item({ id: 7 })] });

  useDownloadStore.getState().applyProgress(progress({ bytes_downloaded: 250 }));

  const stored = useDownloadStore.getState().items[0];
  expect(stored.bytes_downloaded).toBe(250);
  expect(stored.bytes_total).toBe(400);
  expect(stored.message).toBe("Downloading...");
  expect(useDownloadStore.getState().standaloneProgress).toBeNull();
});

test("queue progress for a missing item never shows as standalone", () => {
  useDownloadStore.getState().applyProgress(progress({ item_id: 99 }));

  expect(useDownloadStore.getState().standaloneProgress).toBeNull();
});

test("queue progress does not touch finished items", () => {
  useDownloadStore
    .getState()
    .setSnapshot({ paused: false, items: [item({ id: 7, status: "completed" })] });

  useDownloadStore.getState().applyProgress(progress());

  expect(useDownloadStore.getState().items[0].bytes_downloaded).toBe(0);
  expect(useDownloadStore.getState().standaloneProgress).toBeNull();
});

test("sync progress without an item id becomes standalone and clears on done", () => {
  useDownloadStore.getState().applyProgress(progress({ item_id: null, mod_name: "Sync-Mod" }));
  expect(useDownloadStore.getState().standaloneProgress?.bytes_downloaded).toBe(100);

  useDownloadStore
    .getState()
    .applyProgress(progress({ item_id: null, mod_name: "Sync-Mod", stage: "done" }));
  expect(useDownloadStore.getState().standaloneProgress).toBeNull();
});

test("an active queue snapshot supersedes standalone progress", () => {
  useDownloadStore.getState().applyProgress(progress({ item_id: null, mod_name: "Sync-Mod" }));
  const downloading = item({ id: 3, status: "downloading", full_name: "Other-Mod" });

  useDownloadStore.getState().setSnapshot({ paused: false, items: [downloading] });

  expect(useDownloadStore.getState().standaloneProgress).toBeNull();
});

test("snapshot replaces paused and items state", () => {
  const completed = item({ id: 9, status: "completed" });
  useDownloadStore.getState().setSnapshot({ paused: true, items: [completed] });

  expect(useDownloadStore.getState().paused).toBe(true);
  expect(useDownloadStore.getState().items).toEqual([completed]);
});

test("a dismissed overlay stays hidden until a new batch starts", () => {
  const downloading = item({ id: 1, status: "downloading" });
  useDownloadStore.getState().setSnapshot({ paused: false, items: [downloading] });
  useDownloadStore.getState().dismissOverlay();
  expect(useDownloadStore.getState().overlayDismissed).toBe(true);

  // Same batch, more status updates: still hidden.
  useDownloadStore.getState().setSnapshot({ paused: false, items: [downloading] });
  expect(useDownloadStore.getState().overlayDismissed).toBe(true);

  // Queue drains, then a new install starts: visible again.
  useDownloadStore
    .getState()
    .setSnapshot({ paused: false, items: [item({ id: 1, status: "completed" })] });
  useDownloadStore.getState().setSnapshot({
    paused: false,
    items: [item({ id: 1, status: "completed" }), item({ id: 2, status: "queued" })],
  });
  expect(useDownloadStore.getState().overlayDismissed).toBe(false);
});

test("the overlay item prefers running work, then waiting, paused and queued", () => {
  const queued = item({ id: 1, status: "queued" });
  const paused = item({ id: 2, status: "paused" });
  const waiting = item({ id: 3, status: "waiting_for_network" });
  const active = item({ id: 4, status: "installing" });

  expect(selectOverlayItem([queued])?.id).toBe(1);
  expect(selectOverlayItem([queued, paused])?.id).toBe(2);
  expect(selectOverlayItem([queued, paused, waiting])?.id).toBe(3);
  expect(selectOverlayItem([queued, paused, waiting, active])?.id).toBe(4);
  expect(selectOverlayItem([item({ id: 9, status: "completed" })])).toBeNull();
});
