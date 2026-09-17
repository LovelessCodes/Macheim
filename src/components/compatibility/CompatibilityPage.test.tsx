import { afterEach, beforeEach, expect, mock, test, type Mock } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

void mock.module("../../lib/tauri", () => ({
  getCompatibility: mock(() => Promise.resolve(null)),
  applyCompatibility: mock(() => Promise.resolve(null)),
}));
void mock.module("@tauri-apps/api/app", () => ({
  getVersion: mock(() => Promise.resolve("1.1.0")),
}));

import { getCompatibility, applyCompatibility } from "../../lib/tauri";
import type { CompatibilityStatus } from "../../lib/types";
import CompatibilityPage from "./CompatibilityPage";

const getCompatibilityMock = getCompatibility as Mock<typeof getCompatibility>;
const applyCompatibilityMock = applyCompatibility as Mock<typeof applyCompatibility>;

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
const status: CompatibilityStatus = {
  profile_name: "Friends",
  settings: { automatic: true, disabled_rules: [] },
  catalog: {
    revision: 1,
    plugin_version: "0.2.0",
    game_version: "0.221.12",
    unity_version: "6000.0.61f1",
    rules: [],
    requirements: [],
  },
  rules: [],
  installed: false,
  up_to_date: true,
  game_running: false,
  recent_log: [],
};
beforeEach(() => {
  mock.clearAllMocks();
  getCompatibilityMock.mockResolvedValue(structuredClone(status));
});
afterEach(cleanup);
test("checking support is read-only and never claims a full shader scan", async () => {
  renderWithClient(<CompatibilityPage />);
  await screen.findByText("Friends");
  expect(screen.getByText(/not every shader in the game/)).toBeTruthy();
  expect(applyCompatibility).not.toHaveBeenCalled();
});
test("automatic opt-out is scoped to the shown profile", async () => {
  applyCompatibilityMock.mockResolvedValue({
    ...status,
    settings: { automatic: false, disabled_rules: [] },
  });
  renderWithClient(<CompatibilityPage />);
  await screen.findByText("Friends");
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Automatically apply verified compatibility rules" }),
  );
  await waitFor(() =>
    expect(applyCompatibility).toHaveBeenCalledWith("Friends", {
      automatic: false,
      disabled_rules: [],
    }),
  );
});
test("game-running state blocks apply and disable controls", async () => {
  getCompatibilityMock.mockResolvedValue({ ...status, game_running: true });
  renderWithClient(<CompatibilityPage />);
  await screen.findByText("Friends");
  expect((screen.getByText("Apply supported rules") as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
});
test("backend errors remain visible without a blank screen", async () => {
  getCompatibilityMock.mockRejectedValue("Profile missing");
  renderWithClient(<CompatibilityPage />);
  expect((await screen.findByRole("alert")).textContent).toContain("Profile missing");
  expect(screen.getByText("Check support")).toBeTruthy();
});
