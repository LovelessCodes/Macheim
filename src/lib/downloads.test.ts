import { expect, test } from "bun:test";

import { fileName, isZipPath } from "./downloads";

test("zip detection is case-insensitive and ignores other extensions", () => {
  expect(isZipPath("/tmp/CoolMod.ZIP")).toBe(true);
  expect(isZipPath("/tmp/CoolMod.zip")).toBe(true);
  expect(isZipPath("/tmp/CoolMod.rar")).toBe(false);
  expect(isZipPath("/tmp/CoolMod")).toBe(false);
});

test("file name ignores both separator styles", () => {
  expect(fileName("/tmp/mods/CoolMod.zip")).toBe("CoolMod.zip");
  expect(fileName("C:\\mods\\CoolMod.zip")).toBe("CoolMod.zip");
  expect(fileName("CoolMod.zip")).toBe("CoolMod.zip");
});
