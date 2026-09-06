# Macheim 1.1.0 — release scope and issue audit

## Outcome

Version-pinned Mac Compatibility management, profile safety improvements, and the
previously unreleased config/search/console fixes. This is **not** a universal
shader fix or a claim that every GitHub/Reddit request has been completed.

## GitHub audit (reviewed 2026-09-06)

| Item | 1.1.0 disposition | Evidence / remaining boundary |
| --- | --- | --- |
| [Issue #1](https://github.com/lofcgi/macheim/issues/1), [PR #2](https://github.com/lofcgi/macheim/pull/2): manual mods lost | Prior fix retained and hardened | Persist active profile; preserve ambiguous legacy state; include loose DLLs, disabled mods and config-only installs; stage replacements before moving live data; stop on outgoing save failures. Unit fixtures exercise preservation and staging failure. Not a proof against every filesystem/power-loss scenario. |
| [Issue #3](https://github.com/lofcgi/macheim/issues/3), [PR #11](https://github.com/lofcgi/macheim/pull/11): damaged Apple Silicon app | Mitigated, **not fully resolved** | Ad-hoc signing and accurate Gatekeeper guidance incorporated. Developer ID signing/notarization credentials are still absent; Gatekeeper may continue to block downloaded builds. |
| [Issue #4](https://github.com/lofcgi/macheim/issues/4), [PR #6](https://github.com/lofcgi/macheim/pull/6): console unavailable | Included | Existing merged change adds `-console`; launcher regression check covers the flag and quoted paths. Steam-only launch arguments are not otherwise imported. |
| [Issue #5](https://github.com/lofcgi/macheim/issues/5): cargo missing | Already closed by reporter; documentation clarified | README now explicitly lists Rust/Cargo, Node and Xcode tooling. |
| [Issue #7](https://github.com/lofcgi/macheim/issues/7): version mismatch | Corrected for 1.1.0 | Frontend, Tauri, Cargo and lockfile versions checked together; CI validates tag identity. Historical 1.0.1 download assets are not overwritten. |
| [Issue #8](https://github.com/lofcgi/macheim/issues/8), [PR #9](https://github.com/lofcgi/macheim/pull/9): Sync & Clean | Fix incorporated and hardened | Await native confirmation, send a strict boolean and the approved names. Cancel performs no sync. Cleanup moves only approved untracked folders into local recovery storage. Disabled mods are not re-enabled. |
| [PR #10](https://github.com/lofcgi/macheim/pull/10): installed-mod search blanks app | Fix incorporated | Frontend uses Rust's `author` field, with a rendered search regression test. |

PR #9, #10 and #11 changes were incorporated with their original commit authors.
This audit does not itself close issues, merge PRs through the GitHub UI, or post comments.

## Reddit review

Reviewed the [announcement and latest-first comments](https://www.reddit.com/r/valheim/comments/1shj88g/i_built_a_free_mod_manager_for_valheim_on_macos/?sort=new), including the author's replies.

- **Config editor goes blank:** the unreleased `6f8e679` fix is included. Config types
  now follow the Rust response, and metadata/value preservation has regression tests.
- **Manual mods disappear:** addressed by the profile work above, with recovery copies.
- **Console / devcommands:** `-console` is included in the modded launcher; game/server
  permissions still govern which commands are available.
- **Pink/white effects and disappearing ShaderHelper icons:** only the four catalogued
  VES/Wizardry dropped items are covered. Icon disappearance and other mod-specific
  materials remain unverified; this release does not reset ShaderHelper rules globally.
- **Apple Silicon app damaged:** ad-hoc signature mitigation, not full notarization.
- **Native ARM modded game:** not implemented. The manager being ARM-native does not
  remove the supported game's Rosetta requirement.
- **PC mod-manager profile compatibility:** r2modman/Thunderstore profile-code import
  is not implemented. Existing Macheim metadata import/export is not equivalent.
- **Valheim 1.0 and Windows friends:** no future-version or end-to-end multiplayer
  guarantee. This patch is visual-only, but required client/server mod versions must
  still agree. The runtime patch deliberately skips unverified game/Unity versions.
- **Steam guide suggestion:** no Steam guide or Reddit reply was published as part of
  this release work.

## Compatibility implementation

Catalog: [compatibility/catalog.json](compatibility/catalog.json).
Only VES 1.9.12 and Wizardry 1.1.8, with enabled ShaderHelperForMac 3.3.0.
Runtime: Valheim 0.221.12 / Unity 6000.0.61f1 / macOS Metal.

The generic renderer/shader strategy is reused across four explicitly tested item
prefabs. Automatic matching does not claim coverage of every item in those mods.
No creature/building/UI patch or all-mod experimental scanner is shipped in 1.1.0.
Known creature-equipment pink materials from earlier tests are not fixed by this item plugin.

The plugin clones materials and additive texture copies, caps cached texture allocation,
and avoids repeatedly cloning its own materials. Disabling removes the managed DLL
from the loader path (with a recovery copy) on the next launch. Upstream mod assets,
world files and multiplayer state are not modified by the compatibility plugin.

## Validation

- Current automated checks: **10 frontend tests, 17 Rust tests, 26 plugin policy/pixel checks passed**; production frontend build and npm dependency audit passed (0 reported vulnerabilities).
- Local app smoke checks: apply → disable → re-enable; empty profile gets no patch;
  active profile survives app restart; switch back restores the existing mod files.
  All 86 original plugin files checked after the round trip matched their backups;
  all 818 files in the untouched Default profile matched as well.
- The production app displayed the real Wizardry config instead of blanking. Its
  Info.plist reported 1.1.0 and strict `codesign` verification passed (ad-hoc only).
- Managed plugin 0.2.0 loaded in the game, passed its runtime version guard, and the
  launcher opened the console via F5. No upstream shader rules were reset.
- 0.2.0 runtime logs confirm repairs for all four catalogued prefabs. A newly spawned
  blessed F weapon scroll showed textured blue paper and orange sparks. White square
  particles were also visible in the test scene; their source was not isolated, so
  this is not a claim that all white-particle artifacts are resolved.
- Frontend: rendered UI / confirmation / IPC regression tests and production build.
- Rust: profile-file preservation, failed staging, strict names, original config
  preservation, loose DLL toggles, compatibility version/scope/disable/update fixtures,
  config parsing/saving and console-path generation tests.
- Plugin: 26 pure policy/pixel checks; these are **not** 26 in-game items.
- The prior 0.1.3 visual smoke test covered the four listed objects on RelicHeim 6.0.0.
  It did not establish Windows visual parity, all VES variants, all Therzie items,
  or every RelicHeim creature.
- Local production app/DMG builds use ad-hoc signing; Gatekeeper acceptance of a fresh
  downloaded build on every Mac is not established by a successful local launch.
- Version/catalog/source-manifest/DLL SHA-256 verification runs before release builds.
- Proprietary Valheim and third-party reference assemblies are not bundled or uploaded.

## Operational limitations

Backups in the UI contain metadata and configs, not complete mod binaries or worlds.
Keep separate backups of manual mods and saves. Cleanup and removed-profile recovery
folders are local, not a remote backup. Symlinked replacement paths are refused.
An existing manual copy of Macheim's compatibility plugin must be disabled before
enabling the managed copy, to prevent duplicate plugin GUIDs.

General modpack dependency conflicts and every package archive layout have not been
exhaustively validated. Partial download/install failures must be resolved before
playing; successfully installed files are retained, not falsely reported as a complete pack.
