import { expect, test } from "bun:test";

import { applyLogChunk, isNearBottom, type LogSnapshot } from "./log-follow";

const SNAPSHOT: LogSnapshot = {
  text: "one\ntwo\n",
  path: "/logs/LogOutput.log",
  offset: 8,
  truncated: false,
};

test("appends chunk text and advances the offset", () => {
  const next = applyLogChunk(SNAPSHOT, {
    path: "/logs/LogOutput.log",
    text: "three\n",
    offset: 14,
    reset: false,
    truncated: false,
  });

  expect(next.text).toBe("one\ntwo\nthree\n");
  expect(next.offset).toBe(14);
  expect(next.truncated).toBe(false);
});

test("a reset chunk replaces the buffer, path and truncation", () => {
  const next = applyLogChunk(SNAPSHOT, {
    path: "/logs/Player.log",
    text: "fresh\n",
    offset: 6,
    reset: true,
    truncated: true,
  });

  expect(next).toEqual({
    text: "fresh\n",
    path: "/logs/Player.log",
    offset: 6,
    truncated: true,
  });
});

test("a missing snapshot starts from the chunk", () => {
  const next = applyLogChunk(null, {
    path: null,
    text: "",
    offset: 0,
    reset: false,
    truncated: false,
  });

  expect(next.text).toBe("");
  expect(next.path).toBeNull();
});

test("near-bottom detection allows a small threshold", () => {
  const base = { clientHeight: 400, scrollHeight: 1000 };

  expect(isNearBottom({ ...base, scrollTop: 600 })).toBe(true);
  expect(isNearBottom({ ...base, scrollTop: 560 })).toBe(true);
  expect(isNearBottom({ ...base, scrollTop: 400 })).toBe(false);
});
