#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { extname, join } from "node:path";

/**
 * Convert raw PNG captures in screenshots/ to WebP for the README.
 *
 * Captures are taken from a running app (see docs/screenshots.md) and land in
 * screenshots/ as PNG. WebP keeps the same 1200px frame at a fraction of the
 * size, which matters because every image is embedded in the README. PNGs are
 * removed after a successful conversion so only the shipped format is committed.
 */

const DEFAULTS = {
  dir: "screenshots",
  width: 1200,
  quality: 88,
};

function abort(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function parseArgs(args: string[]) {
  const options = { ...DEFAULTS, keep: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--keep") options.keep = true;
    else if (arg === "--dir") options.dir = args[++i] ?? abort("--dir needs a path");
    else if (arg === "--width") options.width = Number(args[++i]);
    else if (arg === "--quality") options.quality = Number(args[++i]);
    else abort(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(options.width) || options.width <= 0) abort("--width must be a number");
  if (!Number.isFinite(options.quality) || options.quality <= 0 || options.quality > 100)
    abort("--quality must be between 1 and 100");

  return options;
}

const options = parseArgs(process.argv.slice(2));
if (spawnSync("cwebp", ["-version"], { stdio: "ignore" }).error) {
  abort("cwebp not found. Install it with: brew install webp");
}

let pngs: string[];
try {
  pngs = readdirSync(options.dir).filter((file) => extname(file).toLowerCase() === ".png");
} catch {
  abort(`No such directory: ${options.dir}`);
}

if (pngs.length === 0) {
  abort(
    `No PNG files found in ${options.dir}. Capture screenshots there first (docs/screenshots.md).`,
  );
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;
let saved = 0;

for (const png of pngs) {
  const source = join(options.dir, png);
  const target = join(options.dir, `${png.slice(0, -extname(png).length)}.webp`);

  const result = spawnSync(
    "cwebp",
    [
      "-quiet",
      "-q",
      String(options.quality),
      "-resize",
      String(options.width),
      "0",
      source,
      "-o",
      target,
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    console.error(`Failed: ${png}\n${result.stderr}`);
    process.exitCode = 1;
    continue;
  }

  const before = statSync(source).size;
  const after = statSync(target).size;
  saved += before - after;
  console.log(`${png} -> ${target}  ${kb(before)} -> ${kb(after)}`);

  if (!options.keep) unlinkSync(source);
}

console.log(`\nDone. Saved ${kb(saved)} total.`);
