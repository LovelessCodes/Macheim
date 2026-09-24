# Changelog

All notable changes to this fork are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Upstream releases before this fork are listed on
[lofcgi/macheim](https://github.com/lofcgi/macheim/releases).

## [Unreleased]

Profiles can now travel: export one as a file the whole Thunderstore family of managers
understands, import someone else's mod list by file or profile code, and clone a profile
locally.

### Added

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

- Creating a profile that already exists now reports a clear message instead of a filesystem
  error.

### Fixed

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
