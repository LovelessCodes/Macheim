import { expect, test } from "bun:test";

import { MAX_MODPACK_DESCRIPTION, validateModpackMetadata } from "./modpack";
import type { ModpackMetadata } from "./types";

function metadata(overrides: Partial<ModpackMetadata> = {}): ModpackMetadata {
  return {
    name: "My_Pack",
    version: "1.0.0",
    description: "A test pack",
    website_url: "",
    ...overrides,
  };
}

test("accepts a valid modpack", () => {
  expect(validateModpackMetadata(metadata())).toBeNull();
  expect(validateModpackMetadata(metadata({ version: "1.0.0-beta.1" }))).toBeNull();
});

test("rejects names with spaces or symbols", () => {
  expect(validateModpackMetadata(metadata({ name: "My Pack" }))).toMatch(/letters, numbers/);
  expect(validateModpackMetadata(metadata({ name: "" }))).toMatch(/letters, numbers/);
});

test("rejects non-semver versions", () => {
  expect(validateModpackMetadata(metadata({ version: "1.0" }))).toMatch(/1\.0\.0/);
  expect(validateModpackMetadata(metadata({ version: "v1.0.0" }))).toMatch(/1\.0\.0/);
});

test("rejects over-long descriptions", () => {
  const long = "x".repeat(MAX_MODPACK_DESCRIPTION + 1);

  expect(validateModpackMetadata(metadata({ description: long }))).toMatch(/250 characters/);
  expect(
    validateModpackMetadata(metadata({ description: "x".repeat(MAX_MODPACK_DESCRIPTION) })),
  ).toBeNull();
});
