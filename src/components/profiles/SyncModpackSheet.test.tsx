import { expect, mock, test, type Mock } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import type { Profile, Subscription, SyncPlan } from "../../lib/types";

const profile: Profile = {
  name: "Default",
  description: "",
  mods: [],
  compatibility: { automatic: true, disabled_rules: [] },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const subscription: Subscription = {
  modpack: "Author-Pack",
  version: "1.0.0",
  mods: ["Author-ModA"],
  synced_at: "2026-01-01T00:00:00Z",
};

const plan: SyncPlan = {
  modpack: "Author-Pack",
  from_version: "1.0.0",
  to_version: "2.0.0",
  add: [{ full_name: "Author-New", name: "New", from_version: null, to_version: "2.0.0" }],
  update: [
    {
      full_name: "Author-ModA",
      name: "ModA",
      from_version: "0.9.0",
      to_version: "1.0.0",
    },
  ],
  remove: [{ full_name: "Author-Old", name: "Old", from_version: "1.0.0", to_version: null }],
  kept: ["Author-Extra"],
  pinned_skips: [],
  manual_conflicts: [],
  pack_mods: ["Author-ModA", "Author-New"],
  bepinex: null,
  up_to_date: false,
};

void mock.module("../../lib/tauri", () => ({
  listProfiles: mock(() => Promise.resolve([profile])),
  getActiveProfile: mock(() => Promise.resolve("Default")),
  getGameStatus: mock(() =>
    Promise.resolve({
      installed: true,
      game_path: null,
      bepinex_installed: true,
      active_profile: "Default",
    }),
  ),
  listSubscriptions: mock(() => Promise.resolve([])),
  getSyncPlan: mock(() => Promise.resolve(plan)),
  enqueueInstall: mock(() => Promise.resolve({})),
  uninstallMods: mock(() => Promise.resolve({ changed: [], failed: [] })),
  completeSubscriptionSync: mock(() => Promise.resolve(subscription)),
}));

import { getSyncPlan } from "../../lib/tauri";
import SyncModpackSheet from "./SyncModpackSheet";

const getSyncPlanMock = getSyncPlan as Mock<typeof getSyncPlan>;

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

test("renders the diff groups and keeps Sync enabled", async () => {
  renderWithClient(
    <SyncModpackSheet
      profileName="Default"
      subscription={subscription}
      open
      onOpenChange={() => {}}
    />,
  );

  expect(await screen.findByText("Install (1)")).toBeTruthy();
  expect(screen.getByText("Update (1)")).toBeTruthy();
  expect(screen.getByText("Remove (1)")).toBeTruthy();
  expect(screen.getByText(/1 extra mod kept/)).toBeTruthy();

  const syncButton = screen.getByRole("button", { name: "Sync" }) as HTMLButtonElement;
  expect(syncButton.disabled).toBe(false);
});

test("an up-to-date plan disables Sync", async () => {
  getSyncPlanMock.mockResolvedValueOnce({
    ...plan,
    up_to_date: true,
    add: [],
    update: [],
    remove: [],
  });

  renderWithClient(
    <SyncModpackSheet
      profileName="Default"
      subscription={subscription}
      open
      onOpenChange={() => {}}
    />,
  );

  expect(await screen.findByText(/Up to date with v2.0.0/)).toBeTruthy();
  const syncButton = screen.getByRole("button", { name: "Sync" }) as HTMLButtonElement;
  expect(syncButton.disabled).toBe(true);
});
