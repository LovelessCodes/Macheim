# Macheim item material compatibility

Experimental macOS/Metal compatibility plugin for Valheim 0.221.12 / Unity 6000.0.61f1.
Macheim 1.1.0 embeds this separate BepInEx plugin (0.2.0). It is not an upstream
ShaderHelper fix. The earlier local tests below used 0.1.1–0.1.3.

## Managed distribution (0.2.0)

The manager uses [the versioned catalog](../../compatibility/catalog.json) and exact
prefab names for **four tested items**, not the broad prefixes/suffixes used in the
original experiment. Defaults are disabled with empty selectors until Macheim supplies
the profile's eligible rules. Unknown mod versions and disabled dependencies are skipped.
The plugin itself fails closed on unverified game/Unity versions or a non-Metal runtime.

Use **Mac Compatibility** in Macheim to inspect support, apply, or opt out globally
for a profile or per rule. Quit Valheim first. Disabling removes only the manager's
DLL from the loader path and preserves a recovery copy. Other shader mods stay active.
Existing manually installed copies are detected instead of silently overwritten.

0.2.0 also bounds cached additive textures to an estimated 64 MiB total (in addition
to the per-texture limit), and does not repeatedly clone an already-owned material
when another shader helper revisits it. Original mod assets remain unchanged.

## Why a separate patch

On RelicHeim 6.0.0 with ShaderHelperForMac 3.3.0, the VES F weapon/armor scrolls had
pink 3D paper and pink sparks/trails. `Shader.isSupported` reported true. The paper
was a **mesh-mode ParticleSystemRenderer**, while fire/sparks were billboard/trail
effects. `Glow` and `Trail` had generic material names and were omitted by the
`shaderhelper nearby ... mod` filter; the unfiltered `psprobe` exposed them.

The initial name-based config experiment restored blue paper via `Custom/Creature`
with nonzero alpha, but left pink trails. Those two experimental config files were
removed in favor of this renderer-scoped plugin. The pre-existing Wizardry book
config remains separate and unchanged.

## Approach and limits

- Only macOS Metal, enabled via `com.macheim.itemmaterialcompat.cfg`.
- Only `ItemDrop` roots matching configured exact names. Advanced prefixes/suffixes
  remain available in the standalone plugin, but are empty in the managed release.
  This is **not** automatic proof of compatibility for every mod.
- Remap known problematic particle shader families, including false-supported
  bundled Unity shaders. No per-scroll grade or material-name list.
- Surface-shaded mesh particles use `Custom/Creature`; billboard/trail particles and
  **unlit mesh auras** use
  `Sprites/Default`. The attempted `Particles/Standard Unlit2` target still rendered
  pink in this material setup and was rejected after an in-game visual check.
- Clone materials and assign only to that item's renderers, including trail slots.
  A generic name such as `Glow` does not modify a vanilla or another mod's shared material.
- Preserve saved texture properties/UV transforms and bridge tint. Normalize zero
  alpha only for mesh particles whose replacement would clip an opaque surface.
- Preserve mesh emission and reassert the cloned material's bridged shader, main
  texture, color and emission after other shader helpers revisit it.
- For additive source materials, convert a runtime texture copy from RGB intensity
  to alpha before using the sprite fallback. Otherwise the black RGB background
  that contributed no light under additive blending becomes an opaque black ring.
  This is an approximation, not identical additive compositing. Readback is cached
  per source texture, limited to Texture2D assets up to 2048x2048, and originals are
  never modified. Larger/non-2D or failed textures retain the unconverted fallback.
- Cache each item's particle renderer list and check every three seconds; no
  per-frame world/resource scan. Clones are destroyed with their owning item.
- Does not change drops, stats, recipes, inventories, network state, models or UI.
  No input automation or filesystem-triggered game commands.

This does **not** fix all opaque creature equipment, buildings, UI icons, absent
textures, all particle behaviors or arbitrary custom shader graphs. Visual parity
with Windows has not been established. A supported target shader is not by itself
a visual pass; spawned samples must be inspected.

## Build and test

```sh
sh scripts/build-compatibility.sh
```

Override `GameRoot` with `-p:GameRoot="/path/to/Valheim"` if necessary. References
come from the user's installed game and BepInEx; game/mod DLLs are not redistributed.
The local build currently emits an MSB3277 System.Net.Http reference-version warning
from the game assembly, but compiles with zero errors. The plugin does not use HTTP.

The build script copies only the plugin DLL into the manager's embedded resources
and records source hashes and SHA-256. CI verifies this manifest without needing
proprietary game references. Do not distribute the test executable or reference assemblies.
For normal use, let Macheim manage `BepInEx/plugins/Macheim-ItemMaterialCompat/`.

Rollback: close the game, move that one plugin folder out of `BepInEx/plugins`, and
restart. Original mod assets were never changed. Disabling at runtime stops new
repairs; restarting is needed to clear already-cloned materials.

## Validation status

- Build: pass (one reference-version warning, zero errors).
- Policy/pixel unit checks: 26 passed, including exact-scope exclusion, unlit mesh aura classification,
  black/white/colored additive pixels and preservation of existing alpha.
- Runtime 0.1.1: VES blessed F weapon scroll visibly showed blue textured paper and
  orange sparks/trails instead of magenta. Its unlit mesh aura remained an opaque
  dark ring; 0.1.2 changes that renderer to the transparent effect path.
- Runtime 0.1.1: separately spawned `ShardBonemass_TW` appeared green and
  `ArcaneScroll_BlackForest_TW` appeared gold, with no magenta visible in those views.
  Their shared `item_particleTW` was automatically cloned/replaced without new
  material-specific rules. This is a limited visual smoke test, not Windows parity.
- Control sample: `DustMagic` (Epic Loot, outside this patch's scope) showed a bag
  and white/blue particles without visible magenta. Its disabled `attach` renderer
  is not an invisibility failure: the alternate bag renderers are active.
- Runtime 0.1.2: aura switched to the transparent effect shader, but its black RGB
  background was still visible; shader selection alone was insufficient.
- Runtime 0.1.3: loaded successfully after a full restart. The magenta effect and
  opaque black aura rim were absent in the in-game view; the textured scroll and
  sparks remained visible. Logs confirm the aura's `verticalgradient2` used the
  additive-to-alpha copy (512x256). `sparkle_atlas`, `Spell 1` and the shared
  `starspark_item` were also converted/cached without reported readback errors.
  Aura brightness/shape parity with the original Windows effect is **not** verified.
- Existing VES F weapon scroll, blessed F weapon scroll, Wizardry Black Forest
  scroll and Bonemass shard were processed automatically on the final world load.
  This is not a test of all 35 VES variants, all Therzie items or every RelicHeim mod.

Historical local 0.1.3 DLL SHA-256:
`0b682352a0d01c6edfa29a801c91cf17e0473af0b61937e2bb143b1cf2c361d9`.
The original test copy was local-only. The current 0.2.0 build's source and DLL
hashes are recorded in [plugin-manifest.json](../../compatibility/plugin-manifest.json).
