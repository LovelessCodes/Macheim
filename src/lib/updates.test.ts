import { expect, test } from "bun:test";

import type { InstalledMod, ThunderstorePackage } from "./types";
import { updatableMods } from "./updates";

function pkg(overrides: Partial<ThunderstorePackage>): ThunderstorePackage {
  return {
    name: "Mod",
    full_name: "Author-Mod",
    owner: "Author",
    package_url: "",
    description: "",
    version_number: "1.0.0",
    rating_score: 0,
    downloads: 0,
    is_deprecated: false,
    icon: "",
    categories: [],
    date_updated: "2026-01-01T00:00:00Z",
    source: "thunderstore",
    ...overrides,
  };
}

function mod(overrides: Partial<InstalledMod>): InstalledMod {
  return {
    full_name: "Author-Mod",
    name: "Mod",
    author: "Author",
    version: "1.0.0",
    enabled: true,
    description: "",
    icon: "",
    dependencies: [],
    installed_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("lists outdated store-managed mods", () => {
  const mods = [
    mod({ full_name: "Author-Mod", version: "1.0.0" }),
    mod({ full_name: "Author-Other", name: "Other", version: "2.0.0" }),
  ];
  const packages = [
    pkg({ full_name: "Author-Mod", version_number: "1.2.0" }),
    pkg({ full_name: "Author-Other", name: "Other", version_number: "2.0.0" }),
  ];

  expect(updatableMods(mods, packages)).toEqual([
    { fullName: "Author-Mod", name: "Mod", version: "1.2.0" },
  ]);
});

test("pinned mods are excluded from updates", () => {
  const mods = [mod({ full_name: "Author-Mod", version: "1.0.0", pinned: true })];
  const packages = [pkg({ full_name: "Author-Mod", version_number: "1.2.0" })];

  expect(updatableMods(mods, packages)).toEqual([]);
});

test("manual mods are excluded even when a listing matches", () => {
  const mods = [mod({ full_name: "Author-Mod", version: "1.0.0", manual: true })];
  const packages = [pkg({ full_name: "Author-Mod", version_number: "1.2.0" })];

  expect(updatableMods(mods, packages)).toEqual([]);
});
