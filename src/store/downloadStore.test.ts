import { beforeEach, expect, test } from "bun:test";

import type { DownloadItem, ModProgressEvent } from "../lib/types";
import { selectDownloadProgress, useDownloadStore } from "./downloadStore";

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

test("the progress selector prefers the active item, then standalone progress", () => {
  expect(selectDownloadProgress({ items: [], standaloneProgress: null })).toBeNull();

  const downloading = item({
    id: 1,
    status: "downloading",
    bytes_downloaded: 150,
    bytes_total: 300,
  });
  expect(selectDownloadProgress({ items: [downloading], standaloneProgress: null })).toBe(50);

  // No byte totals yet: the installing stage falls back to file counts.
  const installing = item({
    id: 2,
    status: "installing",
    current: 1,
    total: 4,
    bytes_total: null,
  });
  expect(selectDownloadProgress({ items: [installing], standaloneProgress: null })).toBe(25);

  // Nothing measurable reports nothing, so the caller can hide or hold the bar.
  const resolving = item({
    id: 3,
    status: "downloading",
    current: 0,
    total: 0,
    bytes_total: null,
  });
  expect(selectDownloadProgress({ items: [resolving], standaloneProgress: null })).toBeNull();

  // Queue activity wins over standalone progress (Sync & Clean).
  expect(
    selectDownloadProgress({
      items: [downloading],
      standaloneProgress: progress({ item_id: null, bytes_downloaded: 100, bytes_total: 400 }),
    }),
  ).toBe(50);

  // With the queue idle, standalone progress drives the bar.
  expect(
    selectDownloadProgress({
      items: [],
      standaloneProgress: progress({ item_id: null, bytes_downloaded: 100, bytes_total: 400 }),
    }),
  ).toBe(25);
});
