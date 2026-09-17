import { expect, test } from "bun:test";

import { filterPackages, isModpackCategory } from "./packages";
import type { ThunderstorePackage } from "./types";

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

test("filters packages by source", () => {
  const packages = [
    pkg({ full_name: "Author-Thunder", source: "thunderstore" }),
    pkg({ full_name: "Author-Hexium", source: "hexium" }),
  ];

  expect(filterPackages(packages, { selectedSource: "hexium" }).map((p) => p.full_name)).toEqual([
    "Author-Hexium",
  ]);
  expect(
    filterPackages(packages, { selectedSource: "thunderstore" }).map((p) => p.full_name),
  ).toEqual(["Author-Thunder"]);
  expect(filterPackages(packages, { selectedSource: "all" })).toHaveLength(2);
});

test("excludes modpacks for both category spellings", () => {
  const packages = [
    pkg({ full_name: "Author-HexPack", categories: ["Modpack"] }),
    pkg({ full_name: "Author-ThunderPack", categories: ["Modpacks"] }),
    pkg({ full_name: "Author-Mod", categories: ["Combat"] }),
  ];

  expect(filterPackages(packages, {}).map((p) => p.full_name)).toEqual(["Author-Mod"]);
  expect(isModpackCategory(packages[0]!)).toBe(true);
  expect(isModpackCategory(packages[1]!)).toBe(true);
  expect(isModpackCategory(packages[2]!)).toBe(false);
});
