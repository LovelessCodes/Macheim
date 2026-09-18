# Screenshots

These images are embedded in the project README. They are captured from the
running app at a 1200×800 window and shipped as WebP (see "Why WebP" below).

| File                     | Page                           |
| ------------------------ | ------------------------------ |
| `browse-mods.webp`       | Browse Mods, default sort      |
| `mod-details.webp`       | Mod detail panel open          |
| `installed-mods.webp`    | Installed Mods                 |
| `modpacks.webp`          | Modpacks                       |
| `config-editor.webp`     | Config Editor with a file open |
| `mac-compatibility.webp` | Mac Compatibility              |
| `downloads-sheet.webp`   | Downloads sheet with a queue   |

## Capturing

Prerequisites: Valheim (and BepInEx) installed, `bun install` done. Screenshots
must come from a real app window — the frontend can't run in a plain browser
because almost every page calls Tauri commands.

1. Start the app:

   ```sh
   bun tauri dev
   ```

2. Resize the window to **1200×800** if it isn't already (that's the default).
3. Navigate to the page, then wait until lists, icons and version data have
   finished loading. A screenshot taken mid-load is useless.
4. Capture the window only, without the drop shadow:

   ```sh
   screencapture -o -x -w ~/Desktop/browse-mods.png
   ```

   `-w` turns the cursor into a camera; click the Macheim window. `-o` drops the
   shadow, `-x` silences the shutter sound.

5. Repeat for each page and name the files after the page (kebab-case, same
   names as above).
6. Convert the batch and delete the PNGs:

   ```sh
   bun run screenshots
   ```

   The script resizes to 1200px wide at quality 88. `--keep` keeps the source
   PNGs, `--quality`/`--width` override the defaults, `--dir` points at another
   folder. It needs `cwebp` (`brew install webp`).

7. If you added a page, add it to the README table.

## Capture checklist

- Use the **Default** profile, dark theme, and a clean window (no progress
  overlay, no update toast, no hover tooltips).
- The **Settings** page prints your real Steam/BepInEx paths — do not include it
  in public screenshots, or redact the paths first.
- Mod names, counts and versions change over time; that's fine. What matters is
  that the layout matches what users see today.
- Keep every capture at the same window size so the README grid stays aligned.

## Automating page switches

Changing the default page in `src/store/appStore.ts` triggers a Vite HMR update,
which switches the running app's page without a restart:

```ts
export const useAppStore = create<AppState>((set) => ({
  currentPage: "config", // was "browse"
  ...
}));
```

Revert the file when done. The same trick can force an overlay open (for example
`ModGrid.tsx` can select the first package to screenshot the mod detail panel),
but always restore the source afterwards — these edits are capture scaffolding,
not features.

## Update button and Downloads sheet

Two parts of the UI only exist in transient states, so capturing them takes a
little staging:

- **Updater button** (sidebar titlebar): it renders only while `status` is
  `available`, `downloading` or `ready`. Scaffold `updaterStore` with
  `status: "available"` and a plausible `version`, and push
  `STARTUP_CHECK_DELAY_MS` past the capture window so the real background check
  does not flip the state (and fire an update toast) while you shoot.
- **Downloads sheet**: open it (`downloadStore` `panelOpen: true`) and seed
  `items` with representative rows — downloading, queued, installed history and
  a failed row — since the real backend queue is usually empty. Block
  `setSnapshot` so the empty queue does not wipe the seed, and hide
  `ProgressOverlay` so the bottom status card stays out of the frame.

These are hook/store initial states, which Vite's Fast Refresh may preserve
instead of applying. Touch `main.tsx` (any comment change) to force a full
reload, then revert every scaffold file before committing.

## Why WebP

PNG captures from a Retina display are 2–4 MB each; the whole README would be
tens of megabytes. WebP at 1200px/quality 88 keeps text crisp at one tenth of
the size, which keeps clone and page weight down.
