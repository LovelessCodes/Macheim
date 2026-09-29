import { expect, test } from "bun:test";

import {
  canFollowModpack,
  isValidProfileName,
  subscriptionForProfile,
  subscriptionStatus,
} from "./subscriptions";
import type { Subscription, ThunderstorePackage } from "./types";

function pack(overrides: Partial<ThunderstorePackage> = {}): ThunderstorePackage {
  return {
    name: "Pack",
    full_name: "Author-Pack",
    owner: "Author",
    package_url: "https://example.com/Author-Pack",
    description: "",
    version_number: "2.0.0",
    rating_score: 1,
    downloads: 1,
    is_deprecated: false,
    icon: "",
    categories: ["Modpacks"],
    date_updated: "2026-01-01T00:00:00Z",
    source: "thunderstore",
    ...overrides,
  };
}

const subscription: Subscription = {
  modpack: "Author-Pack",
  version: "1.0.0",
  mods: ["Author-ModA"],
  synced_at: "2026-01-01T00:00:00Z",
};

test("a newer published version reports an update", () => {
  const status = subscriptionStatus(subscription, [pack()]);
  expect(status.updateAvailable).toBe(true);
  expect(status.latestVersion).toBe("2.0.0");
  expect(status.unavailable).toBe(false);
});

test("the followed version is up to date", () => {
  const status = subscriptionStatus({ ...subscription, version: "2.0.0" }, [pack()]);
  expect(status.updateAvailable).toBe(false);
});

test("a missing or deprecated pack is unavailable", () => {
  expect(subscriptionStatus(subscription, []).unavailable).toBe(true);
  expect(subscriptionStatus(subscription, [pack({ is_deprecated: true })]).unavailable).toBe(true);
});

test("subscriptions are found by profile name", () => {
  const entries = [{ profile: "Default", subscription }];
  expect(subscriptionForProfile(entries, "Default")).toEqual(subscription);
  expect(subscriptionForProfile(entries, "Other")).toBeNull();
});

test("only Thunderstore listings can be followed", () => {
  expect(canFollowModpack(pack())).toBe(true);
  expect(canFollowModpack(pack({ source: "hexium" }))).toBe(false);
  expect(
    canFollowModpack(
      pack({
        source: "hexium",
        alternates: [{ source: "thunderstore", package_url: "https://example.com" }],
      }),
    ),
  ).toBe(true);
});

test("profile names follow the backend rules", () => {
  expect(isValidProfileName("RelicHeim-Mac-Test")).toBe(true);
  for (const name of ["", "..", "../Default", "a/b", "a\\b", ".hidden", " Default "]) {
    expect(isValidProfileName(name)).toBe(false);
  }
});
