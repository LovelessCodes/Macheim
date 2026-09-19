import { expect, test } from "bun:test";

import {
  filterPackages,
  groupPackagesByName,
  isModpackCategory,
  matchManualMod,
  sortPackages,
} from "./packages";
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

test("manual mod matches the package owned by its folder", () => {
  const packages = [
    pkg({ full_name: "JoelOliMclean-NoRainDamage", name: "NoRainDamage", owner: "JoelOliMclean" }),
    pkg({ full_name: "Aicho-NoRainDamage", name: "NoRainDamage", owner: "Aicho" }),
    pkg({ full_name: "Jowleth-NoRainDamage", name: "NoRainDamage", owner: "Jowleth" }),
  ];
  const byName = groupPackagesByName(packages);

  const matched = matchManualMod(
    { full_name: "Jowleth", name: "NoRainDamage", author: "Unknown", version: "0.0.0" },
    byName,
  );

  expect(matched?.full_name).toBe("Jowleth-NoRainDamage");
});

test("manual mod with an ambiguous plugin name stays unmatched", () => {
  const packages = [
    pkg({ full_name: "JoelOliMclean-NoRainDamage", name: "NoRainDamage", owner: "JoelOliMclean" }),
    pkg({ full_name: "Aicho-NoRainDamage", name: "NoRainDamage", owner: "Aicho" }),
  ];
  const byName = groupPackagesByName(packages);

  const matched = matchManualMod(
    { full_name: "NoRainDamage.dll", name: "NoRainDamage", author: "Unknown", version: "0.0.0" },
    byName,
  );

  expect(matched).toBeUndefined();
});

test("a sole candidate matches by plugin name alone", () => {
  const byName = groupPackagesByName([
    pkg({ full_name: "Author-PhantomMod", name: "PhantomMod", owner: "Author" }),
  ]);

  const matched = matchManualMod(
    { full_name: "PhantomMod.dll", name: "PhantomMod", author: "Unknown", version: "0.0.0" },
    byName,
  );

  expect(matched?.full_name).toBe("Author-PhantomMod");
});

test("store-managed versions are never matched as manual", () => {
  const byName = groupPackagesByName([
    pkg({ full_name: "Jowleth-NoRainDamage", name: "NoRainDamage", owner: "Jowleth" }),
  ]);

  const matched = matchManualMod(
    {
      full_name: "Jowleth-NoRainDamage",
      name: "NoRainDamage",
      author: "Jowleth",
      version: "1.2.2",
    },
    byName,
  );

  expect(matched).toBeUndefined();
});

test("sorts by last updated in both directions", () => {
  const older = pkg({ full_name: "Author-Older", date_updated: "2026-01-01T00:00:00Z" });
  const newer = pkg({ full_name: "Author-Newer", date_updated: "2026-06-01T00:00:00Z" });

  expect(sortPackages([older, newer], "updated", "desc").map((p) => p.full_name)).toEqual([
    "Author-Newer",
    "Author-Older",
  ]);
  expect(sortPackages([older, newer], "updated", "asc").map((p) => p.full_name)).toEqual([
    "Author-Older",
    "Author-Newer",
  ]);
});
