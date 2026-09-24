import { afterEach, beforeEach, expect, mock, test, type Mock } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import type { DownloadItem, InstalledMod } from "../../lib/types";
import { useDownloadStore } from "../../store/downloadStore";

let installedMods: InstalledMod[] = [];

void mock.module("../../lib/tauri", () => ({
  getInstalledMods: mock(() => Promise.resolve(installedMods)),
  uninstallMod: mock(() => Promise.resolve()),
  reinstallDownload: mock(() => Promise.resolve({ paused: false, items: [] })),
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
void mock.module("@tauri-apps/plugin-dialog", () => ({
  confirm: mock(() => Promise.resolve(true)),
}));

import { confirm } from "@tauri-apps/plugin-dialog";

import { reinstallDownload, uninstallMod } from "../../lib/tauri";
import DownloadQueuePanel from "./DownloadQueuePanel";

const reinstallMock = reinstallDownload as Mock<typeof reinstallDownload>;
const uninstallMock = uninstallMod as Mock<typeof uninstallMod>;
const confirmMock = confirm as Mock<typeof confirm>;

function installedMod(overrides: Partial<InstalledMod> = {}): InstalledMod {
  return {
    full_name: "Author-Mod",
    author: "Author",
    name: "Mod",
    version: "1.0.0",
    enabled: true,
    description: "",
    icon: "",
    dependencies: [],
    installed_at: "",
    ...overrides,
  };
}

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

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  installedMods = [];
  mock.clearAllMocks();
  confirmMock.mockResolvedValue(true);
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

  renderWithClient(<DownloadQueuePanel />);

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

  renderWithClient(<DownloadQueuePanel />);

  expect(screen.getByText("Old Mod")).toBeTruthy();
  expect(screen.getByText("Download returned status: 404")).toBeTruthy();
  expect(screen.getByText("History")).toBeTruthy();
  expect(screen.getByText("Clear finished")).toBeTruthy();
});

test("an installed history item offers uninstall, which reverts it", async () => {
  installedMods = [installedMod()];
  useDownloadStore.setState({
    items: [item({ id: 3, status: "completed", installed_count: 1, message: "Installed 1 mod" })],
  });

  renderWithClient(<DownloadQueuePanel />);

  expect(await screen.findByText("Installed 1 mod")).toBeTruthy();
  const uninstall = await screen.findByLabelText("Uninstall mod");
  fireEvent.click(uninstall);
  await waitFor(() => expect(confirmMock).toHaveBeenCalled());
  await waitFor(() => expect(uninstallMock).toHaveBeenCalledWith("Author-Mod"));
});

test("an uninstalled history item reads as uninstalled and offers re-install", async () => {
  installedMods = [];
  useDownloadStore.setState({
    items: [item({ id: 3, status: "completed", installed_count: 1, message: "Installed 1 mod" })],
  });

  renderWithClient(<DownloadQueuePanel />);

  expect(await screen.findByText("Uninstalled — re-install to restore")).toBeTruthy();
  const reinstall = await screen.findByLabelText("Re-install");
  fireEvent.click(reinstall);
  await waitFor(() => expect(reinstallMock).toHaveBeenCalledWith(3));
});

test("renders an empty state with no items", () => {
  renderWithClient(<DownloadQueuePanel />);

  expect(screen.getByText("No downloads")).toBeTruthy();
});

test("shows Sync & Clean progress, which is not a queue item", () => {
  useDownloadStore.setState({
    standaloneProgress: {
      item_id: null,
      stage: "downloading",
      mod_name: "Sync-Mod",
      current: 1,
      total: 2,
      bytes_downloaded: 100,
      bytes_total: 400,
      message: "Reinstalling Sync-Mod (1/2)",
    },
  });

  renderWithClient(<DownloadQueuePanel />);

  expect(screen.getByText("Reinstalling Sync-Mod (1/2)")).toBeTruthy();
  expect(screen.getByText("Sync-Mod")).toBeTruthy();
  expect(screen.queryByText("No downloads")).toBeNull();
});

test("marks installs that come from a local archive", async () => {
  useDownloadStore.setState({
    items: [item({ id: 4, status: "queued", local_path: "/tmp/CoolMod.zip" })],
  });

  renderWithClient(<DownloadQueuePanel />);

  expect(await screen.findByText("From file")).toBeTruthy();
});
