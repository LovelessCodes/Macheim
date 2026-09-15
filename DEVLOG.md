# Macheim - Development Log

## Project Overview

A macOS mod manager for Valheim. Built with Tauri v2 (Rust + React + TypeScript).
Started because r2modman does not support macOS.

---

## Phase 1: Research & Design

### Findings

- Valheim macOS: Unity 6000.0.61f1, Mono runtime, Universal Binary (x86_64 + arm64)
- BepInEx 5.4.x is the standard for Valheim modding
- Thunderstore API: `GET /c/valheim/api/v1/package/` (thousands of packages)
- macOS-specific challenges: Gatekeeper quarantine, Apple Silicon arch handling, DYLD_INSERT_LIBRARIES

### Tech Stack Decision

- **Tauri v2** chosen (Electron 1.3GB vs Tauri 5.7MB DMG)
- React + TypeScript + Tailwind CSS v4 + Zustand

---

## Phase 2: Core Implementation

### Backend (28 Rust files, 25 Tauri commands)

- game_detector: Steam libraryfolders.vdf parsing, auto-detect Valheim
- bepinex_installer: Download/install BepInExPack from Thunderstore
- thunderstore_client: API integration + 30-minute cache
- dependency_resolver: Kahn's algorithm topological sort
- mod_installer: Mod ZIP download/extract/install
- profile_manager: Profile CRUD + switching
- launcher: Apple Silicon-aware game launcher
- config_editor: BepInEx .cfg parsing
- backup_manager: Backup/restore

### Frontend (25 React components)

- Dark viking-themed UI
- Setup wizard, mod/modpack browser
- Thunderstore-style filtering (Popular/Newest/Top Rated/A-Z)
- Profile management, settings editor

### Build Results

- App: 16MB, DMG: 5.7MB
- cargo check: 0 errors, 0 warnings

---

## Phase 3: Troubleshooting Journey

### Issue 1: Thunderstore cache not loaded during BepInEx install

- **Cause**: install_bepinex command required cache, but setup didn't load it first
- **Fix**: Auto-fetch cache if not present

### Issue 2: GameStatus type mismatch

- **Cause**: Backend GameStatus missing bepinex_installed field
- **Fix**: Synchronized backend/frontend types

### Issue 3: Mod browser black screen

- **Cause**: Rendering thousands of packages at once -> WebView crash
- **Fix**: PackageListing (lightweight type) + pagination at 48 items per page

### Issue 4: Play Modded not loading mods

- **Cause 1**: macOS SIP blocks DYLD_INSERT_LIBRARIES in Tauri child processes
- **Attempt 1**: Run run_bepinex.sh via bash -> failed
- **Attempt 2**: osascript do shell script -> failed
- **Attempt 3**: Execute in Terminal.app -> game launched but BepInEx not loaded
- **Root cause**: Running as arm64 on Apple Silicon causes BepInEx Harmony/MonoMod crash
- **Final fix**: `arch -x86_64 env DYLD_INSERT_LIBRARIES=libdoorstop.dylib valheim` direct execution
  - Bypasses run_bepinex.sh, forces Rosetta
  - BepInEx log confirmed: `[Message: BepInEx] BepInEx 5.4.23.5 - Valheim`

### Issue 5: Install button not updating after installation

- **Cause**: installedMods state not refreshed after successful install
- **Fix**: Call getInstalledMods() after installation completes

### Issue 6: Mod install timeout (large mods)

- **Cause**: reqwest total timeout 300s, Therzie-Warfare is 182MB
- **Fix**: Removed total timeout, switched to streaming download + real-time progress events

### Issue 7: Mod files missing after Sync

- **Cause**: Profile JSON updated but actual plugin files not present (download failures silently ignored)
- **Fix**: Added sync_mods command - re-downloads missing mods + cleans orphaned files

---

## Phase 4: Shader Problem (Pink Objects)

### Symptoms

- Mod-added buildings/creatures/effects render as pink/magenta
- Player.log: `Desired shader compiler platform 14 is not available in shader blob`
- Platform 14 = Metal

### Root Cause Analysis

- Mod AssetBundles contain only DirectX (platform 4) shaders, no Metal (platform 14)
- **Key discovery**: Mods override the game's built-in Metal shaders with DirectX-only copies!
  - 98 built-in shader overrides found across 14 mods
  - Custom/Piece, Standard, Particles/Standard Unlit, etc.

### Attempted Approaches

#### ShaderFix v1.0 - Built-in shader fallback (Failed)

- Hooked Shader.Find() to replace missing shaders with Standard
- **Problem**: Standard shader is also null before game loads

#### ShaderFix v1.1 - Harvest shaders from scene (Failed)

- Borrowed working shaders from renderers after game loads
- **Problem**: isSupported check doesn't detect pink shaders

#### ShaderFix v1.2 - Name-based forced replacement (Failed)

- Directly matched 39 known broken shader names
- **Problem**: Also replaced Valheim's own shaders like Custom/Piece -> broke normal objects

#### Wine + DXMT integration (Failed)

- Attempted to run Windows Valheim via Wine-Crossover + DXMT
- **Problem**: Modern Steam's CEF (Chromium) sandboxing is incompatible with Wine (unresolved since 2016)
- Whisky deprecated (2025), CrossOver is paid, Steam doesn't work in Wine

#### HLSLcc shader conversion (Partial success)

- HLSLcc (Unity official, MIT): DXBC -> MSL conversion
- SM 5.0: Success (generated valid Metal Shading Language)
- **SM 4.0: Failed** (4234/4456 crashes, toMetalDeclaration.cpp NULL reference)
- Overall conversion rate: 4% (222/4456)

#### DXMT airconv (Unsupported)

- Designed for SM 5.0 only (SM50Initialize API)
- No SM 4.0 conversion logic exists

#### GLSL -> SPIR-V -> MSL (Failed)

- Unity GLSL uses #version 150 + non-standard uniforms -> rejected by glslang

### Resolution: ShaderFix v2.0 - Built-in shader redirect

- **Key insight**: Only some objects pink within the same mod -> mods overwrite game's Metal shaders
- **Approach**: Cache Valheim's original Metal shaders at startup -> redirect when mods load DirectX-only copies with the same name
- `isSupported` check to leave working shaders untouched
- Mod-unique shaders (Hovl, KriptoFX, etc.) remain pink (DirectX-only, cannot be converted)

---

## Phase 5: Cleanup

### Removed experimental code

- Wine manager (wine_manager.rs, wine.rs)
- Wine UI section (SettingsPage.tsx)
- 4 Wine-related Tauri commands

### Retained features

- Game detection, BepInEx installation, Thunderstore integration
- Mod/modpack installation (automatic dependency resolution)
- Profile management, config editor, backup/restore
- Real-time download progress display
- Sync & Clean (re-download missing mods + clean orphans)
- Play Modded (arch -x86_64 Rosetta launch)

---

## Technical Discoveries (macOS Valheim Modding)

1. **BepInEx only works under x86_64 Rosetta** - Harmony MonoMod crashes on arm64
2. **DYLD_INSERT_LIBRARIES**: Cannot be passed through Tauri process tree, requires independent process
3. **Shader platform 14 = Metal**: Mod AssetBundles without Metal variants render pink
4. **Mods override built-in shaders**: 98 built-in shaders replaced with DirectX-only versions across 14 mods
5. **Wine + modern Steam**: CEF sandboxing incompatibility, unresolved since 2016
6. **HLSLcc SM 4.0 -> Metal**: Incomplete implementation (numerous NULL reference crashes)
7. **Unity GLSL**: Non-standard #version 150, cannot convert to Vulkan SPIR-V

---

## Phase 6: ShaderFix Abandoned

Runtime shader replacement attempted 3 times (v1.2, v2.0, v2.1) - all failed.
Unity's internal shader management does not allow external intervention. The more you touch it, the worse it gets.
Pink shaders accepted as a known limitation of macOS modding. Mod functionality works 100% correctly.
ShaderFix project and HLSLcc tools fully deprecated.
