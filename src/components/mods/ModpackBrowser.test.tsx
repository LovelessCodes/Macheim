import { expect, mock, test } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

void mock.module("../../lib/tauri", () => ({
  fetchPackages: mock(() =>
    Promise.resolve([
      {
        name: "HexPack",
        full_name: "Author-HexPack",
        owner: "Author",
        package_url: "https://valheim.hexium.gg/mods/Author/HexPack",
        description: "A Hexium modpack",
        version_number: "1.0.0",
        rating_score: 1,
        downloads: 10,
        is_deprecated: false,
        icon: "",
        categories: ["Modpack"],
        date_updated: "2026-01-01T00:00:00Z",
        source: "hexium",
      },
    ]),
  ),
  getInstalledMods: mock(() => Promise.resolve([])),
  enqueueInstall: mock(() => Promise.resolve({})),
}));

import ModpackBrowser from "./ModpackBrowser";

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

test("renders the source filter and Hexium modpacks", async () => {
  renderWithClient(<ModpackBrowser />);
  expect(await screen.findByText("All sources")).toBeTruthy();
  expect(await screen.findByText("HexPack")).toBeTruthy();
  expect(await screen.findByText("1 modpacks")).toBeTruthy();
});
