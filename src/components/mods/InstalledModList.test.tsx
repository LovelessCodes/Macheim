import { afterEach, beforeEach, expect, mock, test, type Mock } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

void mock.module("../../lib/tauri", () => ({
  fetchPackages: mock(() => Promise.resolve([])),
  getInstalledMods: mock(() => Promise.resolve([])),
  listUnmanagedMods: mock(() => Promise.resolve([])),
  syncMods: mock(() => Promise.resolve({ cleaned: [], failed: [], reinstalled: [] })),
  toggleMod: mock(() => Promise.resolve()),
  uninstallMod: mock(() => Promise.resolve()),
  enqueueInstall: mock(() => Promise.resolve({})),
}));
void mock.module("@tauri-apps/plugin-dialog", () => ({
  confirm: mock(() => Promise.resolve(false)),
}));

import { confirm } from "@tauri-apps/plugin-dialog";

import { fetchPackages, getInstalledMods, listUnmanagedMods, syncMods } from "../../lib/tauri";
import InstalledModList from "./InstalledModList";

const fetchPackagesMock = fetchPackages as Mock<typeof fetchPackages>;
const getInstalledModsMock = getInstalledMods as Mock<typeof getInstalledMods>;
const listUnmanagedModsMock = listUnmanagedMods as Mock<typeof listUnmanagedMods>;
const syncModsMock = syncMods as Mock<typeof syncMods>;
const confirmMock = confirm as Mock<typeof confirm>;

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
  mock.clearAllMocks();
  fetchPackagesMock.mockResolvedValue([]);
  getInstalledModsMock.mockResolvedValue([mod]);
  listUnmanagedModsMock.mockResolvedValue(["Manual-Mod"]);
  syncModsMock.mockResolvedValue({ cleaned: [], failed: [], reinstalled: [] });
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
  confirmMock.mockResolvedValue(false);
  renderWithClient(<InstalledModList />);
  await screen.findByText("Wizardry");
  fireEvent.click(screen.getByText("Sync & Clean"));
  await waitFor(() => expect(confirm).toHaveBeenCalled());
  await screen.findByText("Sync & Clean");
  expect(syncMods).not.toHaveBeenCalled();
});
test("awaits confirmation before sending approved names", async () => {
  let answer!: (value: boolean) => void;
  confirmMock.mockReturnValue(
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
