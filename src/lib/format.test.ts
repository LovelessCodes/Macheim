import { expect, test } from "bun:test";

import { formatRelativeDate } from "./format";

const NOW = Date.parse("2026-09-19T12:00:00Z");

test("formats relative dates across units", () => {
  expect(formatRelativeDate("2026-09-19T11:59:30Z", NOW)).toBe("just now");
  expect(formatRelativeDate("2026-09-19T11:35:00Z", NOW)).toBe("25m ago");
  expect(formatRelativeDate("2026-09-19T05:00:00Z", NOW)).toBe("7h ago");
  expect(formatRelativeDate("2026-09-16T12:00:00Z", NOW)).toBe("3d ago");
  expect(formatRelativeDate("2026-07-19T12:00:00Z", NOW)).toBe("2mo ago");
  expect(formatRelativeDate("2024-09-19T12:00:00Z", NOW)).toBe("2y ago");
});

test("clamps future dates and passes through invalid input", () => {
  expect(formatRelativeDate("2026-09-20T12:00:00Z", NOW)).toBe("just now");
  expect(formatRelativeDate("not-a-date", NOW)).toBe("not-a-date");
});
