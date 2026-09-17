import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const pkg = json("package.json");
const lock = readFileSync("bun.lock", "utf8");
const tauri = json("src-tauri/tauri.conf.json");
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8").match(/^version = "([^"]+)"/m)?.[1];
const cargoLock = readFileSync("src-tauri/Cargo.lock", "utf8").match(
  /name = "macheim"\nversion = "([^"]+)"/,
)?.[1];
assert.equal(
  lock.match(/"workspaces"\s*:\s*\{\s*""\s*:\s*\{\s*"name"\s*:\s*"([^"]+)"/)?.[1],
  pkg.name,
  "Lockfile root package must match package.json",
);
for (const version of [tauri.version, cargo, cargoLock])
  assert.equal(version, pkg.version, "All app and lockfile versions must match");
const setupWizard = readFileSync("src/components/setup/SetupWizard.tsx", "utf8");
assert.ok(
  setupWizard.includes("useAppVersion"),
  "Setup version label must come from the app version at runtime",
);
if (process.env.GITHUB_REF_TYPE === "tag")
  assert.equal(process.env.GITHUB_REF_NAME, `v${pkg.version}`, "Tag must match packaged version");
assert.equal(tauri.bundle.macOS.signingIdentity, "-", "Ad-hoc signing required");

const catalog = json("compatibility/catalog.json");
const pluginSource = readFileSync("tools/item-material-compat/ItemMaterialCompat.cs", "utf8");
assert.ok(pluginSource.includes(`"${catalog.plugin_version}")]`), "Plugin/catalog versions match");
assert.ok(
  pluginSource.includes(`gameVersion == "${catalog.game_version}"`),
  "Game version guard matches catalog",
);
assert.ok(
  pluginSource.includes(`Application.unityVersion == "${catalog.unity_version}"`),
  "Unity version guard matches catalog",
);
const dll = "src-tauri/resources/compatibility/Macheim.ItemMaterialCompat.dll";
const sources = [
  "ItemMaterialCompat.cs",
  "ShaderPolicy.cs",
  "AdditiveAlpha.cs",
  "ItemMaterialCompat.csproj",
].map((name) => `tools/item-material-compat/${name}`);
const manifest = {
  plugin_version: catalog.plugin_version,
  dll,
  sha256: hash(dll),
  sources: Object.fromEntries(sources.map((path) => [path, hash(path)])),
};
const manifestPath = "compatibility/plugin-manifest.json";
if (process.argv.includes("--record-plugin-build")) {
  // Generated build provenance; no proprietary reference assemblies are distributed.
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
} else
  assert.deepEqual(
    json(manifestPath),
    manifest,
    "Rebuild and record the plugin after changing its source",
  );
for (const rule of catalog.rules) {
  assert.ok(rule.prefabs.length > 0);
  assert.match(rule.version, /^\d+\.\d+\.\d+$/);
  for (const prefab of rule.prefabs) assert.match(prefab, /^[A-Za-z0-9_]+$/);
}
console.log(
  `Release ${pkg.version}: versions, catalog, plugin source provenance and SHA-256 verified.`,
);
