#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Page } from "playwright";
import { preview } from "vite";

import { createFixtures } from "./fixtures";

/**
 * Headless README screenshot capture.
 *
 * Serves the built frontend (`bun run build` first), opens it in headless
 * Chromium at the app's 1200×800 window size, and captures every page in both
 * themes as `NAME.light.png` / `NAME.dark.png` pairs. `bun run screenshots`
 * then composites each pair into the committed WebP.
 *
 * The browser is not the Tauri webview, so `window.__TAURI_INTERNALS__.invoke`
 * is stubbed with the fixtures in `fixtures.ts` before any app code runs. The
 * UI itself is the real frontend: every page, component and style is the same
 * code that ships in the app.
 */

const DEFAULTS = {
  dir: "screenshots",
  port: 4173,
  themes: ["light", "dark"] as const,
};

type Theme = (typeof DEFAULTS.themes)[number];

interface Shot {
  name: string;
  setup: (page: Page) => Promise<void>;
}

function abort(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function parseArgs(args: string[]) {
  const options = {
    dir: DEFAULTS.dir,
    port: DEFAULTS.port,
    only: null as string[] | null,
    baseUrl: null as string | null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dir") options.dir = args[++i] ?? abort("--dir needs a path");
    else if (arg === "--port") options.port = Number(args[++i]);
    else if (arg === "--base-url") options.baseUrl = args[++i] ?? abort("--base-url needs a URL");
    else if (arg === "--only") {
      options.only = (args[++i] ?? abort("--only needs a comma-separated list")).split(",");
    } else abort(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.port) || options.port <= 0) abort("--port must be a number");

  return options;
}

const options = parseArgs(process.argv.slice(2));

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle").catch(() => {});
  // Park the pointer on empty titlebar space: a leftover hover would open a
  // sidebar tooltip or light up a card.
  await page.mouse.move(760, 16);
  await page.waitForTimeout(300);
}

async function openPage(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("heading", { name: label, exact: true }).waitFor();
}

const shots: Shot[] = [
  {
    name: "browse-mods",
    setup: async (page) => {
      await page.getByText(/^\d[\d,]* mods$/).waitFor();
      await page.getByText("Jotunn", { exact: true }).first().waitFor();
    },
  },
  {
    name: "sidebar-collapsed",
    setup: async (page) => {
      await page.getByText(/^\d[\d,]* mods$/).waitFor();
      await page.locator('[data-sidebar="trigger"]').click();
      await page.waitForTimeout(400);
    },
  },
  {
    name: "mod-details",
    setup: async (page) => {
      await page.getByText("Jotunn", { exact: true }).first().waitFor();
      await page.getByText("Jotunn", { exact: true }).first().click();
      await page.getByText(/^Version History \(\d+\)$/).waitFor();
      await page.waitForTimeout(400);
    },
  },
  {
    name: "installed-mods",
    setup: async (page) => {
      await openPage(page, "Installed Mods");
      await page.getByText("PlantEverything", { exact: true }).waitFor();
    },
  },
  {
    name: "modpacks",
    setup: async (page) => {
      await openPage(page, "Modpacks");
      await page.getByText(/^\d[\d,]* modpacks$/).waitFor();
      await page.getByText("Expand_World", { exact: true }).waitFor();
    },
  },
  {
    name: "config-editor",
    setup: async (page) => {
      await openPage(page, "Config Editor");
      await page.getByRole("button", { name: /valheim_plus\.cfg/ }).click();
      await page.getByText("base_max_carry_weight", { exact: true }).waitFor();
    },
  },
  {
    name: "mac-compatibility",
    setup: async (page) => {
      await openPage(page, "Mac Compatibility");
      await page.getByText("VES scroll paper, sparks and aura", { exact: true }).waitFor();
    },
  },
  {
    name: "profiles",
    setup: async (page) => {
      await openPage(page, "Profiles");
      await page.getByText("Friends", { exact: true }).waitFor();
      await page.getByText("13 mods", { exact: true }).waitFor();
    },
  },
  {
    name: "downloads-sheet",
    setup: async (page) => {
      await page.getByText(/^\d[\d,]* mods$/).waitFor();
      await page.getByRole("button", { name: /^Downloads/ }).click();
      await page.getByRole("heading", { name: "Downloads" }).waitFor();
      await page
        .locator('[data-slot="sheet-content"]')
        .getByText("PlantEverything", { exact: true })
        .waitFor();
      await page.waitForTimeout(400);
    },
  },
];

/**
 * Runs inside the page before any app code. Installs a fake Tauri IPC bridge
 * backed by `window.__SCREENSHOT_FIXTURES__` so `invoke()` resolves locally.
 */
function installTauriMock(): void {
  interface ScreenshotWindow extends Window {
    __SCREENSHOT_FIXTURES__: Record<string, unknown>;
    __TAURI_INTERNALS__: Record<string, unknown>;
    isTauri?: boolean;
  }
  const w = window as unknown as ScreenshotWindow;
  const fixtures = w.__SCREENSHOT_FIXTURES__;
  const callbacks = new Map<number, (payload: unknown) => void>();
  let nextCallbackId = 1;

  (w as unknown as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: () => {},
  };

  w.__TAURI_INTERNALS__ = {
    // Some APIs (event listeners, webview drag-drop) read window metadata at
    // module or mount time, so it must exist before the frontend runs.
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
    invoke: (cmd: string, args: Record<string, unknown> = {}) => {
      // The one command keyed by argument: resolve the requested package.
      if (cmd === "get_package_details") {
        const details = fixtures[cmd] as Record<string, unknown>;
        return Promise.resolve(details[String(args.fullName)] ?? null);
      }
      if (Object.prototype.hasOwnProperty.call(fixtures, cmd)) {
        return Promise.resolve(structuredClone(fixtures[cmd]));
      }
      // Unmocked plugin commands (events, updater, dialogs) resolve to null.
      return Promise.resolve(null);
    },
    transformCallback: (callback: (payload: unknown) => void, once = false) => {
      const id = nextCallbackId++;
      callbacks.set(id, (payload) => {
        callback(payload);
        if (once) callbacks.delete(id);
      });
      return id;
    },
    unregisterCallback: (id: number) => {
      callbacks.delete(id);
    },
    convertFileSrc: (path: string) => path,
  };
  w.isTauri = true;
}

if (!existsSync("dist/index.html")) {
  abort("No dist/ build found. Run `bun run build` first.");
}

mkdirSync(options.dir, { recursive: true });

const version = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
const fixtures = createFixtures({ version });

const selected = options.only ? shots.filter((shot) => options.only?.includes(shot.name)) : shots;
if (options.only && selected.length !== options.only.length) {
  abort(`Unknown shot in --only. Available: ${shots.map((shot) => shot.name).join(", ")}`);
}

let server: Awaited<ReturnType<typeof preview>> | null = null;
let baseUrl = options.baseUrl;

try {
  if (!baseUrl) {
    server = await preview({
      preview: { host: "127.0.0.1", port: options.port, strictPort: true },
    });
    baseUrl = `http://127.0.0.1:${options.port}`;
  }

  const browser = await chromium.launch().catch((error: unknown) => {
    abort(
      `Could not launch Chromium: ${String(error)}\n` +
        "Install the browser first: bunx playwright install chromium",
    );
  });

  try {
    for (const shot of selected) {
      for (const theme of DEFAULTS.themes) {
        const context = await browser.newContext({
          viewport: { width: 1200, height: 800 },
          deviceScaleFactor: 2,
          colorScheme: theme,
          reducedMotion: "reduce",
        });
        await context.addInitScript(
          ({ fixtures, theme }: { fixtures: Record<string, unknown>; theme: Theme }) => {
            (window as unknown as Record<string, unknown>).__SCREENSHOT_FIXTURES__ = fixtures;
            localStorage.setItem("theme", theme);
          },
          { fixtures, theme },
        );
        await context.addInitScript(installTauriMock);

        const page = await context.newPage();
        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        await page.getByText("MACHEIM", { exact: true }).waitFor();

        try {
          await shot.setup(page);
          await settle(page);
          const target = join(options.dir, `${shot.name}.${theme}.png`);
          await page.screenshot({ path: target });
          console.log(`${target}  (${theme})`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  await server?.close();
}

console.log(`\nDone. ${selected.length} shots × ${DEFAULTS.themes.length} themes.`);
console.log("Composite them with `bun run screenshots`.");
