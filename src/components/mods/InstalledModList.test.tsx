import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { confirm } from "@tauri-apps/plugin-dialog";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { getInstalledMods, listUnmanagedMods, syncMods } from "../../lib/tauri";
import InstalledModList from "./InstalledModList";
vi.mock("../../lib/tauri", () => ({
  getInstalledMods: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  listUnmanagedMods: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  syncMods: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  toggleMod: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  uninstallMod: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
}));
const mod = {
  full_name: "Therzie-Wizardry",
  author: "Therzie",
  name: "Wizardry",
  version: "1.1.8",
  enabled: true,
  description: "",
  icon: "",
  dependencies: [],
  installed_at: "",
};
function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getInstalledMods).mockResolvedValue([mod]);
  vi.mocked(listUnmanagedMods).mockResolvedValue(["Manual-Mod"]);
  vi.mocked(syncMods).mockResolvedValue({ cleaned: [], failed: [], reinstalled: [] });
});
afterEach(cleanup);
test("search reads the Rust author field and does not blank", async () => {
  renderWithClient(<InstalledModList />);
  await screen.findByText("by Therzie");
  fireEvent.change(screen.getByPlaceholderText("Search installed mods..."), {
    target: { value: "Therzie" },
  });
  expect(screen.getByText("Wizardry")).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText("Search installed mods..."), {
    target: { value: "does-not-exist" },
  });
  expect(screen.queryByText("Wizardry")).toBeNull();
});
test("canceling native cleanup confirmation makes no mutation", async () => {
  vi.mocked(confirm).mockResolvedValue(false);
  renderWithClient(<InstalledModList />);
  await screen.findByText("Wizardry");
  fireEvent.click(screen.getByText("Sync & Clean"));
  await waitFor(() => expect(confirm).toHaveBeenCalled());
  await screen.findByText("Sync & Clean");
  expect(syncMods).not.toHaveBeenCalled();
});
test("awaits confirmation before sending approved names", async () => {
  let answer!: (value: boolean) => void;
  vi.mocked(confirm).mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );
  renderWithClient(<InstalledModList />);
  await screen.findByText("Wizardry");
  fireEvent.click(screen.getByText("Sync & Clean"));
  await waitFor(() => expect(confirm).toHaveBeenCalled());
  expect(syncMods).not.toHaveBeenCalled();
  answer(true);
  await waitFor(() => expect(syncMods).toHaveBeenCalledWith(true, ["Manual-Mod"]));
});
