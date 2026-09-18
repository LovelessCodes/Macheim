import { afterEach, beforeEach, expect, mock, test, type Mock } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import type { CrashReport, InstalledMod } from "../../lib/types";
import { useDiagnosticsStore } from "../../store/diagnosticsStore";

const installedMods: InstalledMod[] = [
  {
    full_name: "Zenox-BetterUI",
    author: "Zenox",
    name: "BetterUI",
    version: "1.0.4",
    enabled: true,
    description: "",
    icon: "",
    dependencies: [],
    installed_at: "",
  },
];

const report: CrashReport = {
  analyzed_at: "2026-09-18T10:00:00Z",
  log_path: "/game/BepInEx/LogOutput.log",
  modded: true,
  kind: "game_update_mismatch",
  summary: "A mod uses game code that changed in a Valheim update.",
  stale_exception: false,
  loaded_plugins: ["BetterUI", "Jotunn"],
  exceptions: [
    {
      source: "Unity Log",
      kind: "MissingMethodException",
      message: "Method not found: void .Character.Message(...)",
      frames: ["(wrapper dynamic-method) Player.DMD<Player::Interact>(Player)"],
      lines_from_end: 4,
    },
  ],
  likely_culprits: [
    { full_name: "Zenox-BetterUI", reason: "was logging just before the crash", score: 30 },
  ],
  log_tail: ["[Info   : BetterUI] ready", "boom"],
};

void mock.module("../../lib/tauri", () => ({
  getInstalledMods: mock(() => Promise.resolve(installedMods)),
  toggleMod: mock(() => Promise.resolve()),
  launchSafeMode: mock(() => Promise.resolve(["Zenox-BetterUI"])),
  restoreSafeModeMods: mock(() => Promise.resolve(["Zenox-BetterUI"])),
  analyzeCrashLogs: mock(() => Promise.resolve(report)),
  getSafeMode: mock(() => Promise.resolve([])),
  getLastCrashReport: mock(() => Promise.resolve(null)),
}));
void mock.module("@tauri-apps/plugin-dialog", () => ({
  confirm: mock(() => Promise.resolve(true)),
}));

import { confirm } from "@tauri-apps/plugin-dialog";

import { launchSafeMode, toggleMod } from "../../lib/tauri";
import CrashReportSheet from "./CrashReportSheet";

const toggleMock = toggleMod as Mock<typeof toggleMod>;
const safeModeMock = launchSafeMode as Mock<typeof launchSafeMode>;
const confirmMock = confirm as Mock<typeof confirm>;

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mock.clearAllMocks();
  confirmMock.mockResolvedValue(true);
  useDiagnosticsStore.setState({ report, reportOpen: true, safeModeMods: [] });
});
afterEach(cleanup);

test("shows the summary, culprits and log tail", async () => {
  renderWithClient(<CrashReportSheet />);

  expect(await screen.findByText("Game update mismatch")).toBeTruthy();
  expect(screen.getByText(/changed in a Valheim update/)).toBeTruthy();
  expect(await screen.findByText("Zenox-BetterUI")).toBeTruthy();
  expect(screen.getByText("was logging just before the crash")).toBeTruthy();
  expect(screen.getByText(/MissingMethodException/)).toBeTruthy();
  expect(screen.getByText(/boom/)).toBeTruthy();
});

test("can disable a likely culprit", async () => {
  renderWithClient(<CrashReportSheet />);
  await screen.findByText("Zenox-BetterUI");

  fireEvent.click(screen.getByText("Disable"));

  await waitFor(() => expect(toggleMock).toHaveBeenCalledWith("Zenox-BetterUI", false));
});

test("safe mode asks for confirmation before disabling everything", async () => {
  renderWithClient(<CrashReportSheet />);
  await screen.findByText("Game update mismatch");

  fireEvent.click(screen.getByText("Launch Safe Mode"));

  await waitFor(() => expect(confirmMock).toHaveBeenCalled());
  await waitFor(() => expect(safeModeMock).toHaveBeenCalled());
});

test("renders nothing without a report", () => {
  useDiagnosticsStore.setState({ report: null, reportOpen: false, safeModeMods: [] });
  const { container } = renderWithClient(<CrashReportSheet />);

  expect(container.firstChild).toBeNull();
});
