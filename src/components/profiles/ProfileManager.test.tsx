import { afterEach, beforeEach, expect, mock, test, type Mock } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import type { DeletedProfile, Profile } from "../../lib/types";

const deleted: DeletedProfile = {
  archive_name: "Second-1758580000000000000",
  name: "Second",
  mods: 3,
  deleted_at: "2025-09-22T12:00:00Z",
};

const secondProfile: Profile = {
  name: "Second",
  description: "",
  mods: [],
  compatibility: { automatic: true, disabled_rules: [] },
  created_at: "2025-09-20T12:00:00Z",
  updated_at: "2025-09-21T12:00:00Z",
};

void mock.module("../../lib/tauri", () => ({
  listProfiles: mock(() => Promise.resolve([])),
  getActiveProfile: mock(() => Promise.resolve("Default")),
  listDeletedProfiles: mock(() => Promise.resolve([])),
  restoreDeletedProfile: mock(() => Promise.resolve(secondProfile)),
  purgeDeletedProfile: mock(() => Promise.resolve()),
  purgeDeletedProfiles: mock(() => Promise.resolve(1)),
  createProfile: mock(() => Promise.resolve(secondProfile)),
  switchProfile: mock(() => Promise.resolve()),
  deleteProfile: mock(() => Promise.resolve(deleted)),
  cloneProfile: mock(() => Promise.resolve(secondProfile)),
  exportProfileFile: mock(() => Promise.resolve()),
  exportProfileCode: mock(() => Promise.resolve("code")),
  importProfileCode: mock(() => Promise.resolve(secondProfile)),
  importProfileFile: mock(() => Promise.resolve(secondProfile)),
  getGameStatus: mock(() =>
    Promise.resolve({
      installed: true,
      game_path: null,
      bepinex_installed: true,
      active_profile: "Default",
    }),
  ),
  enqueueInstall: mock(() => Promise.resolve({})),
  fetchPackages: mock(() => Promise.resolve([])),
  listSubscriptions: mock(() => Promise.resolve([])),
  unsubscribeProfile: mock(() => Promise.resolve()),
}));
void mock.module("@tauri-apps/plugin-dialog", () => ({
  confirm: mock(() => Promise.resolve(true)),
  open: mock(() => Promise.resolve(null)),
  save: mock(() => Promise.resolve(null)),
}));
void mock.module("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: mock(() => Promise.resolve()),
}));

import { confirm } from "@tauri-apps/plugin-dialog";

import {
  deleteProfile,
  listDeletedProfiles,
  listProfiles,
  purgeDeletedProfiles,
  restoreDeletedProfile,
} from "../../lib/tauri";
import { Toaster } from "../ui/toast";
import ProfileManager from "./ProfileManager";

const listProfilesMock = listProfiles as Mock<typeof listProfiles>;
const listDeletedProfilesMock = listDeletedProfiles as Mock<typeof listDeletedProfiles>;
const restoreDeletedProfileMock = restoreDeletedProfile as Mock<typeof restoreDeletedProfile>;
const purgeDeletedProfilesMock = purgeDeletedProfiles as Mock<typeof purgeDeletedProfiles>;
const deleteProfileMock = deleteProfile as Mock<typeof deleteProfile>;
const confirmMock = confirm as Mock<typeof confirm>;

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mock.clearAllMocks();
  listProfilesMock.mockResolvedValue([secondProfile]);
  listDeletedProfilesMock.mockResolvedValue([deleted]);
  restoreDeletedProfileMock.mockResolvedValue(secondProfile);
  purgeDeletedProfilesMock.mockResolvedValue(1);
  deleteProfileMock.mockResolvedValue(deleted);
  confirmMock.mockResolvedValue(true);
});
afterEach(cleanup);

test("lists deleted profiles and restores one", async () => {
  renderWithClient(<ProfileManager />);

  await screen.findByText("Deleted profiles (1)");
  fireEvent.click(screen.getByText("Deleted profiles (1)"));
  // The archive row shows the archived mod count (the live row shows 0 mods).
  expect(screen.getByText("3 mods")).toBeTruthy();

  fireEvent.click(screen.getByText("Restore"));
  await waitFor(() =>
    expect(restoreDeletedProfileMock).toHaveBeenCalledWith(deleted.archive_name, undefined),
  );
});

test("undo on the delete toast restores the profile", async () => {
  renderWithClient(
    <>
      <ProfileManager />
      <Toaster />
    </>,
  );

  fireEvent.click(await screen.findByLabelText("Delete profile Second"));
  await waitFor(() => expect(confirm).toHaveBeenCalled());

  fireEvent.click(await screen.findByText("Undo"));
  await waitFor(() => expect(restoreDeletedProfileMock).toHaveBeenCalledWith(deleted.archive_name));
});

test("purge all confirms once and clears the archive list", async () => {
  renderWithClient(<ProfileManager />);

  await screen.findByText("Deleted profiles (1)");
  fireEvent.click(screen.getByText("Purge all"));

  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(purgeDeletedProfilesMock).toHaveBeenCalled());
});
