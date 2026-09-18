import { afterEach, beforeEach, expect, mock, test, type Mock } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import type { SaveOverview } from "../../lib/types";

const overview: SaveOverview = {
  save_dir: "/Users/me/Library/Application Support/IronGate/Valheim",
  worlds: [{ name: "Midgard", files: 2, size: 1024, modified: "2026-01-01T00:00:00Z" }],
  characters: [{ name: "Thor", files: 1, size: 512, modified: null }],
  snapshots: [
    {
      id: "123",
      label: "Before launch",
      created_at: "2026-01-02T10:00:00Z",
      size: 1024,
      automatic: true,
      worlds: 1,
      characters: 1,
    },
    {
      id: "122",
      label: "Manual snapshot",
      created_at: "2026-01-01T10:00:00Z",
      size: 2048,
      automatic: false,
      worlds: 0,
      characters: 1,
    },
  ],
};

void mock.module("../../lib/tauri", () => ({
  getSaveOverview: mock(() => Promise.resolve(overview)),
  getAppSettings: mock(() => Promise.resolve({ console_enabled: true, snapshot_saves: true })),
  setSnapshotSaves: mock((enabled: boolean) =>
    Promise.resolve({ console_enabled: true, snapshot_saves: enabled }),
  ),
  createSaveSnapshot: mock(() => Promise.resolve(overview)),
  restoreSaveSnapshot: mock(() => Promise.resolve(overview)),
  deleteSaveSnapshot: mock(() => Promise.resolve(overview)),
}));
void mock.module("@tauri-apps/plugin-dialog", () => ({
  confirm: mock(() => Promise.resolve(true)),
}));

import { confirm } from "@tauri-apps/plugin-dialog";

import { createSaveSnapshot, getSaveOverview, restoreSaveSnapshot } from "../../lib/tauri";
import SavesPage from "./SavesPage";

const createMock = createSaveSnapshot as Mock<typeof createSaveSnapshot>;
const restoreMock = restoreSaveSnapshot as Mock<typeof restoreSaveSnapshot>;
const getOverviewMock = getSaveOverview as Mock<typeof getSaveOverview>;
const confirmMock = confirm as Mock<typeof confirm>;

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mock.clearAllMocks();
  confirmMock.mockResolvedValue(true);
  getOverviewMock.mockImplementation(() => Promise.resolve(overview));
});
afterEach(cleanup);

test("lists worlds, characters and snapshots", async () => {
  renderWithClient(<SavesPage />);

  expect(await screen.findByText("Midgard")).toBeTruthy();
  expect(screen.getByText("Thor")).toBeTruthy();
  expect(screen.getByText("Before launch")).toBeTruthy();
  expect(screen.getByText("Auto")).toBeTruthy();
  expect(screen.getByText("Manual snapshot")).toBeTruthy();
  expect(screen.getByText("Create Snapshot")).toBeTruthy();
});

test("restoring asks for confirmation first", async () => {
  renderWithClient(<SavesPage />);
  await screen.findByText("Before launch");

  fireEvent.click(screen.getAllByText("Restore")[0]);

  await waitFor(() => expect(confirmMock).toHaveBeenCalled());
  await waitFor(() => expect(restoreMock).toHaveBeenCalledWith("123"));
});

test("creating a snapshot calls the backend", async () => {
  renderWithClient(<SavesPage />);
  await screen.findByText("Midgard");

  fireEvent.click(screen.getByText("Create Snapshot"));

  await waitFor(() => expect(createMock).toHaveBeenCalled());
});

test("explains when no save folder exists", async () => {
  getOverviewMock.mockResolvedValueOnce({
    ...overview,
    save_dir: null,
    worlds: [],
    characters: [],
  });

  renderWithClient(<SavesPage />);

  expect(await screen.findByText(/save folder not found/i)).toBeTruthy();
});
