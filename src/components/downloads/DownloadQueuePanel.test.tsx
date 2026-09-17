import { afterEach, beforeEach, expect, mock, test } from "bun:test";

import { cleanup, render, screen } from "@testing-library/react";

import type { DownloadItem } from "../../lib/types";
import { useDownloadStore } from "../../store/downloadStore";

void mock.module("../../lib/tauri", () => ({
  pauseDownload: mock(() => Promise.resolve({ paused: false, items: [] })),
  resumeDownload: mock(() => Promise.resolve({ paused: false, items: [] })),
  cancelDownload: mock(() => Promise.resolve({ paused: false, items: [] })),
  retryDownload: mock(() => Promise.resolve({ paused: false, items: [] })),
  removeDownload: mock(() => Promise.resolve({ paused: false, items: [] })),
  pauseAllDownloads: mock(() => Promise.resolve({ paused: true, items: [] })),
  resumeAllDownloads: mock(() => Promise.resolve({ paused: false, items: [] })),
  cancelAllDownloads: mock(() => Promise.resolve({ paused: false, items: [] })),
  clearFinishedDownloads: mock(() => Promise.resolve({ paused: false, items: [] })),
}));

import DownloadQueuePanel from "./DownloadQueuePanel";

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

beforeEach(() => {
  useDownloadStore.setState({
    paused: false,
    items: [],
    panelOpen: true,
    standaloneProgress: null,
  });
});
afterEach(cleanup);

test("lists pending items with queue controls", () => {
  useDownloadStore.setState({
    items: [
      item({ id: 1, name: "Downloading Mod", status: "downloading", message: "Downloading..." }),
      item({
        id: 2,
        name: "Waiting Mod",
        full_name: "Author-Waiting",
        status: "waiting_for_game",
        message: "Waiting for Valheim to close",
      }),
    ],
  });

  render(<DownloadQueuePanel />);

  expect(screen.getByText("Downloading Mod")).toBeTruthy();
  expect(screen.getByText("Waiting Mod")).toBeTruthy();
  expect(screen.getByText("Waiting for Valheim to close")).toBeTruthy();
  expect(screen.getByText("Pause all")).toBeTruthy();
  expect(screen.getByText("Cancel all")).toBeTruthy();
});

test("shows history entries with a clear action", () => {
  useDownloadStore.setState({
    items: [
      item({ id: 3, name: "Old Mod", status: "failed", error: "Download returned status: 404" }),
    ],
  });

  render(<DownloadQueuePanel />);

  expect(screen.getByText("Old Mod")).toBeTruthy();
  expect(screen.getByText("Download returned status: 404")).toBeTruthy();
  expect(screen.getByText("History")).toBeTruthy();
  expect(screen.getByText("Clear finished")).toBeTruthy();
});

test("renders an empty state with no items", () => {
  render(<DownloadQueuePanel />);

  expect(screen.getByText("No downloads")).toBeTruthy();
});
