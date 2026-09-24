# Changelog

All notable changes to this fork are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Upstream releases before this fork are listed on
[lofcgi/macheim](https://github.com/lofcgi/macheim/releases).

## [Unreleased]

The log viewer and per-mod version pinning: read the log in-app, and hold a mod at a
known-good version.

### Added

- **BepInEx log viewer** — a new Logs page shows the latest Valheim log, resolved the same way
  crash triage resolves it (BepInEx's `LogOutput.log`, falling back to Unity's `Player.log`).
  Lines are parsed for their level, stack traces inherit the level of the error above them, and
  the page offers a level filter, search with match highlighting and a visible match count,
  copy for the filtered log or a single line, and Open in Finder. Very large logs load as a
  capped tail with a notice instead of choking the view.
- **Follow mode** — a Follow toggle tails the log about once a second while the game runs and
  auto-scrolls to the newest line. Scrolling up pauses the scroll (lines keep arriving) and a
  Resume control re-engages; polling pauses while the window is hidden and stops when the page
  is left. A recreated or rotated log — a new launch, or the fallback switching to the BepInEx
  log — resets the view instead of mixing contents.
- **Version pinning** — pin any store-managed mod from the Installed Mods list to hold it at
  the version currently installed. Pinned mods are excluded from Update All and their count,
  badged in the list, and their per-mod update control explains the pin instead of updating.
  The pin lives in the profile, so it survives restarts and profile switches, and switching
  versions through Version History while pinned moves the hold. Conflict detection now says
  when a dependency mismatch is caused by a pin — still a warning, never a blocked launch.
  Manual mods have no pin control; they already never auto-update.
- **Dependency-aware uninstall warnings** — uninstalling a mod names the installed mods that
  depend on it, with disabled dependents labelled (removing the dependency breaks them when
  re-enabled). A bulk uninstall names any selected mod that an unselected mod requires, and
  mods inside the selection are never listed as each other's dependents. Warnings only — the
  confirmation still proceeds exactly as before.
- **Unused dependency cleanup** — installs now record whether a mod was requested by the user
  or pulled in as a dependency; records from older profiles count as requested, so nothing is
  swept retroactively. Installed Mods gains "Remove unused", which lists dependency-installed
  mods that nothing depends on any more — including the transitive closure — and removes them
  through the normal bulk uninstall after one confirmation. Pinned, manually installed and
  explicitly installed mods are never listed, and disabled mods still count as dependents.
- **Export as Thunderstore modpack** — the Profiles export menu turns any profile into a
  Thunderstore modpack zip: `manifest.json` with every mod at its exact installed version,
  a generated README, and an icon (chosen PNG or the bundled Macheim icon). `BepInExPack_Valheim`
  is included at the installed loader version, or omitted with a warning when it cannot be
  detected. Only enabled store mods are exported; manual and disabled mods are reported as
  skipped, and configs stay in the `.r2z` export. Name, version and description are validated
  against Thunderstore's upload rules, and a non-256×256 icon warns without blocking.
- **Publish modpacks to Thunderstore** — sign in with a service-account token from Settings
  (stored in the macOS Keychain, never logged or shown again; a rejected token is cleared
  automatically), then publish from the modpack export sheet: choose a team, tag extra
  categories alongside the mandatory Modpacks one, set the NSFW flag, and watch upload
  progress. Success links to the published package page. Versions are never auto-bumped — a
  duplicate version surfaces Thunderstore's own error — and publishing is modpacks only
  (Valheim, category Modpacks), not mods.

## [1.3.2] - 2026-09-24

Profiles can now travel: export one as a file the whole Thunderstore family of managers
understands, import someone else's mod list by file or code, and recover deleted profiles from
an archive list — with Undo on the toast. The Downloads panel absorbs the old status card,
installing a few mods no longer bogs it down, notifications stop stacking duplicates, and
Installed Mods gains bulk enable/disable/uninstall.

### Added

- **Undo and archived profiles** — Removing a profile now offers Undo on the toast, and the
  Profiles page keeps a Deleted profiles section with each archive's mod count and deletion
  date. Restore moves an archive back into the profile list (consuming the archive), Delete
  permanently clears one, and Purge all empties the archive after a single confirmation.
- **Bulk mod actions** — The Installed Mods page has a Select mode: pick several mods, or Select
  all within the current search and filter, and enable, disable or uninstall them together. A
  batch runs as one backend command — files move once, the profile is written once — and a bulk
  uninstall asks a single confirmation.
- **Quieter notifications** — Repeatable actions upsert their toast: another launch, sync,
  save, profile change, update check or queue confirmation updates the existing toast in
  place and refreshes its timer instead of stacking a duplicate, with a short highlight
  replaying on each update.
- **Profile sharing** — Export any profile as an `.r2z` file that Macheim, r2modman, Gale
  and Thunderstore Mod Manager can import. Config files travel with it, and every mod keeps
  the version it was exported with.
- **Share a profile as a code** — Any profile can be uploaded as a short-lived Thunderstore
  code (about an hour), shown with a copy button. Codes are the quick way to hand a mod list
  to someone; file exports remain for durable sharing, and overly large profiles suggest one.
- **Drop a profile onto the window** — Dragging an `.r2z` file onto Macheim imports it the
  same way the Profiles page does, including the prompt to activate the profile and queue its
  downloads. The drop overlay now says whether a `.zip` will install or a `.r2z` will import.
- **Profile import** — On the Profiles page, import a shared profile from an `.r2z` file, a
  Macheim JSON export, or a Thunderstore profile code. Store metadata (author, icon,
  description, dependencies) is matched back to each mod where possible, and after importing
  you can activate the profile and queue all its downloads in one step. Manual mods have no
  store listing and are skipped.
- **Profile clone** — Duplicate a profile, including its configs, as a starting point for a
  new setup.

### Changed

- The bottom-center download status card is gone. Everything it showed lives in the Downloads
  panel now — the panel also surfaces Sync & Clean progress, which is not a queue item — and a
  slim progress bar next to the header's Downloads button shows the active download at a
  glance. Dismissing the card is no longer a concept: the panel opens only when asked for.
- The scroll-to-top button on Installed Mods sits at the bottom center, clear of the row
  actions; the Browse and Modpacks grids keep it on the right.
- Creating a profile that already exists now reports a clear message instead of a filesystem
  error.

### Fixed

- The Downloads panel no longer bogs down while mods install: progress arrived once per
  network chunk, and every event re-rendered the whole panel — every row, tooltip and progress
  bar. Byte progress is now coalesced into one update per frame in the webview, the backend
  emits at most one progress event per item every 100 ms, and each panel row subscribes only to
  its own item, so a progressing download re-renders one row instead of the list.
- Activating an imported profile now downloads its mods without a manual Sync & Clean: the
  install pipeline judged "already installed" from the profile's mod list alone, so entries
  that existed only as metadata (as in a freshly imported profile) made every queued install a
  no-op. Installs now also require the mod's files to exist on disk, and dependencies follow
  the same rule.

## [1.3.1] - 2026-09-20

Follow-up to the 1.3.0 reliability work: hand-installed mods are recognised and matched to
their store listings, Browse Mods finally counts every release, and opening a mod no longer
waits on a cold cache.

### Added

- **Author filter** — Filter Browse Mods and Modpacks by author with a searchable combobox that
  narrows the list as you type; Clear removes the filter again.
- **Manual installs are first-class** — Mods you installed by hand are detected by their plugin
  DLLs, their version is read from the DLL's PE version resource, and they are matched back to
  their Thunderstore or Hexium listing where possible, so they show the real owner, store icon
  and detail page. They keep a **Manual** badge and updates stay disabled because their layout
  differs from a managed install.
- **Both listings for shared mods** — A mod published on both Thunderstore and Hexium keeps
  both listings: versions merge newest-first, every release is badged with the store that
  published it, and the detail sheet links each store that carries the package.

### Changed

- The update control moved from the header to the sidebar, beside the collapse trigger, so the
  header stays reserved for page context.
- The "Newest" sort tab is now "Updated", with a tooltip, and mod cards show the last update
  date — making it obvious what the default sort orders by.

### Fixed

- Browse Mods now ranks and displays downloads cumulatively across all versions, matching what
  the stores show, instead of only counting the latest release.
- Opening a mod detail no longer stalls after a restart: details fall back to the on-disk
  package cache and the in-memory cache is warmed at startup, so the first open resolves
  immediately.
- Loose plugin DLLs and leftovers from a manual install are no longer listed as separate
  unknown mods, and Sync & Clean can list and move those leftover files.
- The conflict banner no longer reports duplicate DLLs that a tracked mod already provides.
- Mod cards stay readable in condensed grids: the update date sits next to the author as a
  compact relative time, and metadata no longer collides with the install button.
- The config editor refetches when re-entered and on window focus, so changes made in game or
  outside Macheim show up.

## [1.3.0] - 2026-09-18

The reliability release: installs survive Valheim running and network drops, worlds and
characters can be snapshotted, and an early exit produces a crash report naming the likely
culprit instead of a mystery.

### Added

- **Crash triage** — Macheim watches every launch it starts and, when Valheim exits unusually
  early, analyzes BepInEx's log: the report classifies the failure (game update mismatch,
  missing native library, exception in patched code) and names likely culprit mods from stack
  traces and log activity. From the report you can disable a suspect, launch in **Safe Mode**
  (all mods off, one click to restore from the banner), or re-analyze the latest log on demand
  from Settings.
- **Quiet Steam handling** — Macheim no longer focuses or restarts an already-running Steam
  client, and when Steam is missing it starts it hidden in the background (`-silent`, launch
  hidden) and waits for it before starting the game, so cold starts are less likely to end in
  the splash-screen exit.
- **Save snapshots** — A new Save Snapshots page lists your worlds and characters and can
  snapshot them on demand. Snapshots are also taken automatically before every modded launch
  (toggleable, last five kept), and restoring replaces the live saves after keeping a safety
  snapshot of what it replaced.
- **Conflict detection** — The Installed Mods page flags potential profile problems: the same
  plugin file shipped by two mods, a dependency required at conflicting versions, and
  dependencies installed at a version other than the one requested. These are warnings and
  never block a launch.
- **Developer console toggle** — Choose whether "Play Modded" passes Valheim's `-console`
  flag, from Settings. Enabled by default, matching previous behaviour.
- **Install from file** — Drag and drop `.zip` archives onto the window, or use "Install from
  file" on the Installed Mods page. Archives are matched back to their Thunderstore listing
  by package name/version (or the owner encoded in the download's file name), so they keep
  the real author, icon and update checks; unmatched zips install as `Local-<file name>`.
  Local installs go through the same queue, so they wait for Valheim to close and can be
  paused or cancelled.
- **Download queue** — Installs no longer fail while Valheim is running or the connection is
  down; they queue instead and start automatically once the game closes or the network
  returns. Track, pause, resume, cancel, retry, uninstall and re-install downloads from the
  header button, anywhere in the app. The queue is persisted, so pending installs survive
  restarts.

## [1.2.1] - 2026-09-17

The first fork release since upstream **v1.1.0**. It focuses on quality-of-life, a full UI
rebuild, and self-updating.

> **Updating from v1.1.0 or earlier:** in-app updates are new in this version, so existing
> installs cannot update themselves yet. Install v1.2.1 manually once; later releases will
> update in place.

### Highlights

- **In-app updates** — Macheim checks for new versions quietly in the background. Nothing is
  downloaded until you choose, and the update is applied on restart, so your mods and profiles
  are never touched mid-session.
- **Two mod sources in one list** — Browse [Thunderstore](https://thunderstore.io) and
  [Hexium](https://hexium.gg/) together, or filter down to a single source.
- **Faster browsing** — Virtualized grids and lists, a persisted package cache, and staggered
  loading skeletons.
- **Rebuilt interface** — The whole UI now sits on shadcn/Base UI primitives with a dark viking
  theme.

### Added

- Non-intrusive in-app updates: a quiet check on launch, one notification per version, an update
  button in the header, and an Updates card in Settings with manual check, download progress, and
  restart.
- Hexium as a second package source, with a source filter across the browse views.
- "Update All" for installed mods, plus per-mod update buttons for outdated versions.
- Version history in the mod detail sheet, so you can install or switch back to an older release.
- Multi-select category filters, with selected chips collapsing to a "first +N" summary.
- A dedicated Modpacks tab — modpacks are no longer mixed into Browse Mods.
- Uninstall confirmation from the installed list.
- Scroll-to-top button for virtualized views, plus a scroll fade.
- Automatic fallback to Thunderstore's backup CDN when the primary download host (gcdn) is
  blocked by antivirus software such as Malwarebytes, with an in-app notice.
- App version shown in the sidebar, setup wizard, and compatibility page.

### Changed

- Data fetching, caching, and mutations migrated to TanStack Query, with the Thunderstore package
  list persisted to IndexedDB so repeat visits load instantly.
- The interface was rebuilt on shadcn/Base UI: the mod detail is now a right-side sheet, the
  sidebar uses the shadcn sidebar primitive, and settings, profiles, config editor, compatibility,
  setup wizard, and skeletons were all rebuilt on shared cards, buttons, and badges.
- Mod grid, modpack browser, and installed list are virtualized for smoother scrolling.
- Layout: overlay title bar with a sidebar trigger strip, reduced header height, and a tidier drag
  region.
- Toolchain moved from npm/Node to Bun, with oxlint and oxfmt wired through Husky and lint-staged.

### Fixed

- Mod icons and downloads recover when the primary Thunderstore CDN is blocked.
- The progress overlay clears correctly when an install or sync fails.
- The scroll-to-top button no longer overlaps installed-row controls.
- The package cache is loaded when fetching mod details or installing.
- Unhandled promise rejections silenced in several call sites.

### Under the hood

- CI split into parallel frontend, compatibility, Rust lint, and Rust test jobs; release builds are
  gated on them.
- Interactive `bun run release` script with semantic version selection, verification, and
  tag/push flow; release builds push to the branch's upstream remote.
- Dependabot enabled.
- `verify:release` checks versions, the app-version label, compatibility catalog and plugin
  provenance, and now the updater configuration.
