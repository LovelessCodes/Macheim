#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const LEVELS = ["current", "patch", "minor", "major"] as const;
type Level = (typeof LEVELS)[number];

const VERSION_FILES = [
  "package.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
];

function abort(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function capture(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return (result.stdout ?? "").trim();
}

function stream(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) abort(`${command} ${args.join(" ")} failed.`);
}

const git = (...args: string[]): string => capture("git", args);
const status = (): string =>
  spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" }).stdout.replace(/\n+$/, "");

function nextVersion(version: string, level: Level): string {
  const [major, minor, patch] = version.split(".").map(Number);
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  if (level === "patch") return `${major}.${minor}.${patch + 1}`;
  return version;
}

function writeVersions(version: string): void {
  const replace = (path: string, pattern: RegExp, replacement: string): void => {
    const before = readFileSync(path, "utf8");
    const after = before.replace(pattern, replacement);
    if (after === before) abort(`Could not find the version in ${path}.`);
    writeFileSync(path, after);
  };
  replace("package.json", /("version":\s*")[^"]+(")/, `$1${version}$2`);
  replace("src-tauri/tauri.conf.json", /("version":\s*")[^"]+(")/, `$1${version}$2`);
  replace("src-tauri/Cargo.toml", /^version = "[^"]+"/m, `version = "${version}"`);
  replace("src-tauri/Cargo.lock", /(name = "macheim"\nversion = ")[^"]+(")/, `$1${version}$2`);
}

function parseLevel(arg: string): Level {
  const value = arg.toLowerCase();
  if (value === "c") return "current";
  if ((LEVELS as readonly string[]).includes(value)) return value as Level;
  abort(`Unknown release type "${arg}". Use current, patch, minor or major.`);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const levelArg = args.find((arg) => !arg.startsWith("--"));

const current = JSON.parse(readFileSync("package.json", "utf8")).version as string;
const rl = createInterface({ input: process.stdin, output: process.stdout });
process.stdin.on("end", () => abort("Input closed."));
const ask = (question: string): Promise<string> =>
  rl.question(question).catch(() => {
    abort("Aborted.");
  });

let level: Level | null = levelArg ? parseLevel(levelArg) : null;
if (!level) {
  if (!process.stdin.isTTY) abort("Not a terminal. Pass the release type: bun run release patch");
  console.log(`\nCurrent version: ${current}\n\nWhat do you want to release?`);
  for (const [index, candidate] of LEVELS.entries()) {
    const next = nextVersion(current, candidate);
    const label =
      candidate === "current"
        ? `current  (stay on v${current})`
        : `${candidate}  (v${current} → v${next})`;
    console.log(`  ${index + 1}) ${label}`);
  }
  console.log("");
  while (!level) {
    const answer = (await ask("Select [1-4]: ")).trim().toLowerCase();
    const index = Number(answer);
    if (Number.isInteger(index) && index >= 1 && index <= LEVELS.length) level = LEVELS[index - 1];
    else if ((LEVELS as readonly string[]).includes(answer)) level = answer as Level;
    else console.log("Enter a number between 1 and 4.");
  }
}

const next = nextVersion(current, level);
const tag = `v${next}`;
const bump = next !== current;

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
const existingTag = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}^{commit}`], {
  encoding: "utf8",
}).stdout.trim();
if (existingTag) {
  if (existingTag === git("rev-parse", "HEAD") && !bump)
    abort(`Tag ${tag} already exists at HEAD. Push it with:\n  git push origin ${branch} ${tag}`);
  abort(`Tag ${tag} already exists.`);
}
const dirty = status().split("\n").filter(Boolean);
const dirtyVersionFiles = dirty.filter((line) => VERSION_FILES.includes(line.slice(3)));
const dirtyOthers = dirty.filter(
  (line) => !line.startsWith("??") && !VERSION_FILES.includes(line.slice(3)),
);
const untracked = dirty.filter((line) => line.startsWith("??"));
if (dirtyOthers.length)
  abort(`Uncommitted changes outside the version files:\n${dirtyOthers.join("\n")}`);
if (untracked.length)
  console.warn(`Note: untracked files are not part of this release:\n${untracked.join("\n")}\n`);

console.log(`\nRelease plan:`);
console.log(`  version  ${bump ? `${current} → ${next}` : `${current} (unchanged)`}`);
console.log(`  files    ${bump ? VERSION_FILES.join(", ") : "none"}`);
console.log(
  `  commit   ${bump || dirtyVersionFiles.length ? `chore: release ${tag}` : "none (tree clean)"}`,
);
console.log(`  tag      ${tag}`);
console.log(`  push     ${branch} + ${tag} to origin`);

if (dryRun) {
  console.log("\nDry run: nothing changed.");
  rl.close();
  process.exit(0);
}

if (branch !== "main") {
  const answer = (await ask(`\nYou are on "${branch}", not "main". Continue? [y/N] `))
    .trim()
    .toLowerCase();
  if (answer !== "y" && answer !== "yes") abort("Aborted.");
}
const confirmation = (await ask("\nProceed? [y/N] ")).trim().toLowerCase();
if (confirmation !== "y" && confirmation !== "yes") abort("Aborted.");
rl.close();

if (bump) writeVersions(next);

if (spawnSync("bun", ["run", "verify:release"], { stdio: "inherit" }).status !== 0) {
  if (bump)
    for (const path of VERSION_FILES)
      if (!dirtyVersionFiles.some((line) => line.slice(3) === path))
        spawnSync("git", ["checkout", "--", path]);
  abort("Release verification failed. Nothing was committed, tagged or pushed.");
}

const changed = status()
  .split("\n")
  .filter((line) => VERSION_FILES.includes(line.slice(3)));
if (changed.length) {
  stream("git", ["add", ...VERSION_FILES]);
  stream("git", ["commit", "-m", `chore: release ${tag}`]);
}
stream("git", ["tag", "-a", tag, "-m", tag]);

console.log(`\nPushing ${branch} and ${tag}...`);
stream("git", ["push", "origin", "HEAD"]);
stream("git", ["push", "origin", tag]);
console.log(
  `\nReleased ${tag}. The Release workflow will now build and publish the draft release.`,
);
