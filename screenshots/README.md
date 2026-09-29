# Screenshots

These images are embedded in the project README. Each one is a diagonal
composite of the same 1200×800 app window in both themes: the light capture
fills the top-left triangle, the dark capture the bottom-right, split along the
bottom-left-to-top-right diagonal. The result ships as WebP (see "Why WebP"
below).

| File                     | Page                           |
| ------------------------ | ------------------------------ |
| `browse-mods.webp`       | Browse Mods, default sort      |
| `sidebar-collapsed.webp` | Browse Mods, sidebar icon-only |
| `mod-details.webp`       | Mod detail panel open          |
| `installed-mods.webp`    | Installed Mods                 |
| `modpacks.webp`          | Modpacks                       |
| `config-editor.webp`     | Config Editor with a file open |
| `mac-compatibility.webp` | Mac Compatibility              |
| `profiles.webp`          | Profiles                       |
| `downloads-sheet.webp`   | Downloads sheet with a queue   |

## Refresh pipeline

Capture is headless: no app window, no Valheim install, no clicking. The build
runs the real frontend with the Tauri backend stubbed out (see "How the capture
works").

```sh
bunx playwright install chromium   # once per machine
bun run build                     # required: the capture serves dist/
bun run screenshots:capture       # writes NAME.light.png / NAME.dark.png
bun run screenshots               # composites them into the committed WebPs
```

`bun run screenshots:capture` takes `--only browse-mods,profiles` to capture a
subset, `--dir` to write elsewhere and `--port` for the preview server. The
compositor (unchanged, previously fed by `screencapture`) takes `--keep`,
`--width`, `--quality` and `--dir`; it deletes the PNG pairs unless `--keep` is
passed.

### On release

`.github/workflows/screenshots.yml` runs when a release is published (or via
manual dispatch). It builds the frontend, captures every page in both themes,
composites the WebPs and opens a `chore/refresh-screenshots` PR against `main`.
Review the renders and merge when the pages look right.

## How the capture works

`scripts/screenshots/capture.ts` serves `dist/` with `vite preview` and drives
headless Chromium at the app's 1200×800 window size, twice that for Retina
crispness, once per theme. Before any app code runs it installs a fake
`window.__TAURI_INTERNALS__` whose `invoke` resolves against local fixtures — no
Rust process, no network for commands, no game files. Everything else (pages,
components, styles) is the code that ships.

- `scripts/screenshots/packages.ts` — curated snapshot of real Thunderstore
  Valheim listings for Browse Mods and Modpacks. Icons use the backup CDN host
  because the primary CDN is unreachable from CI.
- `scripts/screenshots/fixtures.ts` — one response per command the frontend
  calls: game status, packages, installed mods, profiles, subscriptions,
  compatibility catalog, config files, download queue, and so on.
- `capture.ts`'s `shots` array — one entry per committed image. Each entry tours
  the app (navigate via the sidebar, open the mod detail panel, click a config
  file…) and waits for a marker that proves the page finished loading.

Adding a page: add a shot entry, iterate with
`bun run screenshots:capture --only <name>`, then composite.

Changing what a page shows: edit the fixtures. Keep the data plausible and
deterministic — dates are fixed ISO strings that the UI renders as relative
time, and the light/dark captures must show the exact same state or the diagonal
seam won't line up.

## Manual capture fallback

If a page cannot be represented by fixtures (say, it needs live Thunderstore
data), capture it the old way and feed the compositor:

1. `bun tauri dev`, resize the window to **1200×800** if it isn't already
   (that's the default).
2. Navigate to the page and wait until lists, icons and version data have
   finished loading. A screenshot taken mid-load is useless.
3. Capture the window only, without the drop shadow, once per theme:

   ```sh
   screencapture -o -x -w ~/Desktop/browse-mods.light.png
   ```

   `-w` turns the cursor into a camera; click the Macheim window. `-o` drops the
   shadow, `-x` silences the shutter sound. Toggle the theme from the titlebar,
   capture the same page again as `browse-mods.dark.png`, and leave the app in
   whichever theme you started with.

4. Name the files `NAME.light.png` / `NAME.dark.png` (kebab-case, same base
   names as the table above) and run `bun run screenshots`.

Capture hygiene applies to both routes: use a clean window (no progress
overlay, no update toast, no hover tooltips), park the cursor away from the
icon-only sidebar before shooting, and keep every capture at the same window
size so the README grid stays aligned. Pages that print a local path
(**Settings**, **Save Snapshots**) expose your username — leave them out of
public screenshots, or redact the paths first.

## Why WebP

PNG captures from a Retina display are 2–4 MB each; the whole README would be
tens of megabytes. WebP at 1200px/quality 88 keeps text crisp at one tenth of
the size, which keeps clone and page weight down.
