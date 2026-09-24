import { expect, test } from "bun:test";

import {
  bulkUninstallWarning,
  dependencyFullName,
  findDependents,
  formatDependentNames,
  formatRemovalNames,
  orphanedDependencies,
  singleUninstallWarning,
} from "./dependents";
import type { InstalledMod } from "./types";

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

test("parses dependency full names, including multi-dash names", () => {
  expect(dependencyFullName("Dev-Jotunn-2.4.0")).toBe("Dev-Jotunn");
  expect(dependencyFullName("Author-My-Cool-Mod-1.0.0")).toBe("Author-My-Cool-Mod");
  expect(dependencyFullName("Author-Mod-1")).toBe("Author-Mod");
  expect(dependencyFullName("Author-Mod")).toBeNull();
  expect(dependencyFullName("Nonsense")).toBeNull();
});

test("groups dependents per target and labels disabled ones", () => {
  const mods = [
    mod({ full_name: "Owner-ModA", dependencies: ["Dev-Jotunn-2.4.0"] }),
    mod({ full_name: "Owner-ModB", enabled: false, dependencies: ["Dev-Jotunn-2.3.9"] }),
    mod({ full_name: "Owner-ModC", dependencies: ["Other-Lib-1.0.0"] }),
  ];

  const groups = findDependents(mods, ["Dev-Jotunn"]);

  expect(groups).toHaveLength(1);
  expect(groups[0].dependents).toEqual([
    { fullName: "Owner-ModA", enabled: true },
    { fullName: "Owner-ModB", enabled: false },
  ]);
});

test("co-selected mods are not each other's dependents", () => {
  const mods = [
    mod({ full_name: "Owner-ModA", dependencies: ["Dev-Jotunn-2.4.0"] }),
    mod({ full_name: "Dev-Jotunn", dependencies: [] }),
  ];

  expect(findDependents(mods, ["Dev-Jotunn", "Owner-ModA"])).toEqual([]);
});

test("formats names with a cap and disabled labels", () => {
  const dependents = [
    { fullName: "A", enabled: true },
    { fullName: "B", enabled: false },
    { fullName: "C", enabled: true },
    { fullName: "D", enabled: true },
    { fullName: "E", enabled: true },
    { fullName: "F", enabled: true },
    { fullName: "G", enabled: true },
  ];

  expect(formatDependentNames(dependents.slice(0, 2))).toBe("A, B (disabled)");
  expect(formatDependentNames(dependents)).toBe("A, B (disabled), C, D, E, and 2 more");
});

test("single uninstall warnings agree in number", () => {
  const one = [mod({ full_name: "Owner-ModA", dependencies: ["Dev-Jotunn-2.4.0"] })];
  const two = [
    ...one,
    mod({ full_name: "Owner-ModB", enabled: false, dependencies: ["Dev-Jotunn-2.4.0"] }),
  ];

  expect(singleUninstallWarning(one, "Dev-Jotunn")).toBe("Owner-ModA depends on it.");
  expect(singleUninstallWarning(two, "Dev-Jotunn")).toBe(
    "Owner-ModA, Owner-ModB (disabled) depend on it.",
  );
  expect(singleUninstallWarning(one, "Unrelated-Mod")).toBeNull();
});

test("bulk uninstall warnings name each affected selected mod", () => {
  const mods = [
    mod({ full_name: "Owner-ModA", dependencies: ["Dev-Jotunn-2.4.0"] }),
    mod({ full_name: "Owner-ModC", dependencies: ["Other-Lib-1.0.0"] }),
  ];

  expect(bulkUninstallWarning(mods, ["Dev-Jotunn", "Other-Lib"])).toBe(
    "Required by mods outside the selection:\n" +
      "- Dev-Jotunn: required by Owner-ModA\n" +
      "- Other-Lib: required by Owner-ModC",
  );
  expect(bulkUninstallWarning(mods, ["Owner-ModA"])).toBeNull();
});

test("orphans include the transitive closure of unused dependencies", () => {
  const mods = [
    mod({ full_name: "Owner-ModB", installed_as: "dependency", dependencies: ["Dev-LibC-1.0.0"] }),
    mod({ full_name: "Dev-LibC", installed_as: "dependency", dependencies: [] }),
  ];

  expect(orphanedDependencies(mods).map((m) => m.full_name)).toEqual(["Owner-ModB", "Dev-LibC"]);
});

test("an installed dependent keeps its dependency out of the sweep", () => {
  const mods = [
    mod({ full_name: "Owner-ModB", installed_as: "dependency", dependencies: ["Dev-LibC-1.0.0"] }),
    mod({ full_name: "Dev-LibC", installed_as: "dependency", dependencies: [] }),
    mod({ full_name: "Owner-ModA", installed_as: "explicit", dependencies: ["Owner-ModB-1.0.0"] }),
  ];

  expect(orphanedDependencies(mods)).toEqual([]);
});

test("disabled dependents still block the sweep", () => {
  const mods = [
    mod({ full_name: "Dev-LibC", installed_as: "dependency", dependencies: [] }),
    mod({
      full_name: "Owner-ModB",
      installed_as: "explicit",
      enabled: false,
      dependencies: ["Dev-LibC-1.0.0"],
    }),
  ];

  expect(orphanedDependencies(mods)).toEqual([]);
});

test("pinned, manual and explicit mods are never swept", () => {
  const mods = [
    mod({ full_name: "Pinned-Dep", installed_as: "dependency", pinned: true }),
    mod({ full_name: "Manual-Dep", installed_as: "dependency", manual: true }),
    mod({ full_name: "Explicit-Mod", installed_as: "explicit" }),
    mod({ full_name: "Old-Record" }),
  ];

  expect(orphanedDependencies(mods)).toEqual([]);
});

test("removal names are capped", () => {
  const mods = Array.from({ length: 7 }, (_, index) => mod({ full_name: `Author-Mod${index}` }));

  expect(formatRemovalNames(mods.slice(0, 2))).toBe("Author-Mod0, Author-Mod1");
  expect(formatRemovalNames(mods)).toBe(
    "Author-Mod0, Author-Mod1, Author-Mod2, Author-Mod3, Author-Mod4, and 2 more",
  );
});
