import { beforeEach, expect, mock, test } from "bun:test";

import { invoke } from "@tauri-apps/api/core";

void mock.module("@tauri-apps/api/core", () => ({
  invoke: mock(() => Promise.resolve({})),
}));

import { applyCompatibility, syncMods } from "./tauri";
beforeEach(() => mock.clearAllMocks());
test("sync sends a boolean, never a UI event or Promise", async () => {
  await syncMods();
  expect(invoke).toHaveBeenCalledWith("sync_mods", {
    cleanUnmanaged: false,
    approvedUnmanaged: [],
  });
  // Guard against accidental event-handler wiring even if called outside TypeScript.
  await syncMods({} as boolean);
  expect(invoke).toHaveBeenLastCalledWith("sync_mods", {
    cleanUnmanaged: false,
    approvedUnmanaged: [],
  });
});
test("cleanup carries only the names approved in the confirmation", async () => {
  await syncMods(true, ["Manual-Mod"]);
  expect(invoke).toHaveBeenCalledWith("sync_mods", {
    cleanUnmanaged: true,
    approvedUnmanaged: ["Manual-Mod"],
  });
});
test("compatibility mutations identify their profile", async () => {
  const settings = { automatic: false, disabled_rules: [] };
  await applyCompatibility("Friends", settings);
  expect(invoke).toHaveBeenCalledWith("apply_compatibility", { profileName: "Friends", settings });
});
