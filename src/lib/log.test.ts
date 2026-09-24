import { expect, test } from "bun:test";

import { filterLog, highlightSegments, parseLog } from "./log";

const LOG = [
  "[Info   :   BepInEx] BepInEx 5.4.2350",
  "[Info   : BetterUI] [BetterUI] Hotbar ready",
  "[Error  : Unity Log] MissingMethodException: Method not found",
  "Stack trace:",
  "  at Character.Message () [0x00000] in <abc>:0",
  "[Warning: Unity Log] Shader not found",
  "[Debug  : BetterUI] cache warmed",
  "",
  "[Message: BepInEx] Loading [Better Archery 2.0.0]",
].join("\n");

test("parses level prefixes and leaves text intact", () => {
  const entries = parseLog(LOG);

  expect(entries[0].level).toBe("info");
  expect(entries[0].continuation).toBe(false);
  expect(entries[0].text).toBe("[Info   :   BepInEx] BepInEx 5.4.2350");
  expect(entries[5].level).toBe("warning");
  expect(entries[6].level).toBe("debug");
});

test("continuation lines inherit the previous level", () => {
  const entries = parseLog(LOG);

  expect(entries[3].continuation).toBe(true);
  expect(entries[3].level).toBe("error");
  expect(entries[4].continuation).toBe(true);
  expect(entries[4].level).toBe("error");
});

test("leading unprefixed lines are unknown, trailing newline adds no entry", () => {
  const entries = parseLog("plain first line\n[Info   : BepInEx] second\n");

  expect(entries).toHaveLength(2);
  expect(entries[0].level).toBe("unknown");
  expect(entries[1].level).toBe("info");
});

test("error filter keeps fatal and stack traces", () => {
  const entries = parseLog(`${LOG}\n[Fatal  : Unity Log] hard stop`);
  const filtered = filterLog(entries, "error", "");

  expect(filtered.map((entry) => entry.text)).toEqual([
    "[Error  : Unity Log] MissingMethodException: Method not found",
    "Stack trace:",
    "  at Character.Message () [0x00000] in <abc>:0",
    "[Fatal  : Unity Log] hard stop",
  ]);
});

test("info filter groups message with info", () => {
  const entries = parseLog(LOG);
  const levels = new Set(filterLog(entries, "info", "").map((entry) => entry.level));

  expect(levels).toEqual(new Set(["info", "message"]));
});

test("search runs over the level-filtered lines, case-insensitively", () => {
  const entries = parseLog(LOG);
  const filtered = filterLog(entries, "all", "betterui");

  expect(filtered).toHaveLength(2);
  expect(filterLog(entries, "warning", "betterui")).toHaveLength(0);
});

test("highlights every occurrence", () => {
  expect(highlightSegments("a foo b foo", "FOO")).toEqual([
    { text: "a ", match: false },
    { text: "foo", match: true },
    { text: " b ", match: false },
    { text: "foo", match: true },
  ]);
  expect(highlightSegments("nothing here", "zzz")).toEqual([
    { text: "nothing here", match: false },
  ]);
  expect(highlightSegments("plain", "")).toEqual([{ text: "plain", match: false }]);
});
