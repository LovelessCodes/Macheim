import { expect, test } from "bun:test";

import { fireEvent, render, screen } from "@testing-library/react";

import { notify, Toaster } from "./toast";

function Demo() {
  return (
    <div>
      <button onClick={() => notify("demo-key", { type: "success", title: "Saved" })}>save</button>
      <button onClick={() => notify("demo-key", { type: "error", title: "Failed" })}>fail</button>
      <button onClick={() => notify("demo-other", { type: "info", title: "Other" })}>other</button>
      <Toaster />
    </div>
  );
}

/** The upsert pattern coss documents: one key, one toast, updated in place. */
test("repeated keys update one toast instead of stacking", () => {
  render(<Demo />);

  fireEvent.click(screen.getByText("save"));
  fireEvent.click(screen.getByText("save"));
  fireEvent.click(screen.getByText("save"));
  expect(screen.getAllByText("Saved")).toHaveLength(1);

  // A later notification with the same key replaces the content in place.
  fireEvent.click(screen.getByText("fail"));
  expect(screen.queryByText("Saved")).toBeNull();
  expect(screen.getAllByText("Failed")).toHaveLength(1);

  // A different key still gets its own toast.
  fireEvent.click(screen.getByText("other"));
  expect(screen.getAllByText("Failed")).toHaveLength(1);
  expect(screen.getAllByText("Other")).toHaveLength(1);
});
