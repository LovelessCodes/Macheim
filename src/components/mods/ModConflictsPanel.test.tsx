import { expect, test } from "bun:test";

import { render, screen } from "@testing-library/react";

import type { ConflictReport } from "../../lib/types";
import ModConflictsPanel from "./ModConflictsPanel";

function report(overrides: Partial<ConflictReport> = {}): ConflictReport {
  return {
    duplicate_dlls: [],
    dependency_conflicts: [],
    version_mismatches: [],
    ...overrides,
  };
}

test("renders nothing when there are no conflicts", () => {
  const { container } = render(<ModConflictsPanel report={report()} />);

  expect(container.firstChild).toBeNull();
});

test("renders nothing before the report loads", () => {
  const { container } = render(<ModConflictsPanel report={null} />);

  expect(container.firstChild).toBeNull();
});

test("summarizes duplicates, conflicts and mismatches", () => {
  render(
    <ModConflictsPanel
      report={report({
        duplicate_dlls: [{ file_name: "Jotunn.dll", mods: ["A-Mod", "B-Mod"] }],
        dependency_conflicts: [
          {
            dependency: "Dev-Jotunn",
            requirements: [
              { version: "2.4.0", required_by: ["A-Mod"] },
              { version: "2.3.9", required_by: ["B-Mod"] },
            ],
          },
        ],
        version_mismatches: [
          {
            dependency: "Dev-Jotunn",
            required_by: ["A-Mod"],
            required_version: "2.4.0",
            installed_version: "2.3.9",
          },
        ],
      })}
    />,
  );

  expect(screen.getByText("3 potential conflicts detected")).toBeTruthy();
  expect(screen.getByText("Jotunn.dll")).toBeTruthy();
  expect(screen.getByText(/is provided by/)).toBeTruthy();
  expect(screen.getByText(/is required at different versions/)).toBeTruthy();
  expect(screen.getByText(/v2\.3\.9 is installed/)).toBeTruthy();
});
