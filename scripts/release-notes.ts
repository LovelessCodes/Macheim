#!/usr/bin/env bun
import { readFileSync } from "node:fs";

/**
 * Build the GitHub release body for a tag from CHANGELOG.md.
 *
 * The version section supplies the highlights, added/changed/fixed lists, while
 * the footer below is shared by every release. Fails loudly when the changelog
 * has no section for the tag, so a release never ships without notes.
 */

const FOOTER = `### Compatibility limits

The bundled visual patch targets Valheim 0.221.12 / Unity 6000.0.61f1 / Metal and requires
ShaderHelperForMac 3.3.0. It does not fix every mod, monster, building or UI icon. Unknown
versions are skipped. Macheim's Apple Silicon app still launches the modded game through Rosetta.

### Installation

1. Download the \`.dmg\` file for your Mac
2. Open and drag **Macheim** to Applications
3. Open **System Settings → Privacy & Security** and click **Open Anyway** if macOS blocks the app

This release is ad-hoc signed, but not Apple-notarized. If macOS reports that
Macheim is damaged and does not offer **Open Anyway**, run:

\`\`\`sh
xattr -cr /Applications/Macheim.app
\`\`\`

Then open Macheim normally. Only use this command after confirming that you
downloaded the app from this repository's Releases page.

**Apple Silicon (M1/M2/M3/M4):** Download \`aarch64.dmg\`
**Intel Mac:** Download the DMG ending in \`_x64.dmg\``;

function abort(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function parseTag(args: string[]): string {
  const flag = args.indexOf("--tag");
  const tag = flag === -1 ? args.find((arg) => !arg.startsWith("--")) : args[flag + 1];
  if (!tag) {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    return `v${pkg.version}`;
  }
  return tag;
}

const tag = parseTag(process.argv.slice(2));
const version = tag.replace(/^v/, "");
const changelog = readFileSync("CHANGELOG.md", "utf8");

const heading = new RegExp(
  `^## \\[${version.replace(/\./g, "\\.")}\\](?:\\s*-\\s*\\d{4}-\\d{2}-\\d{2})?\\s*$`,
  "m",
);
const match = heading.exec(changelog);
if (!match) abort(`CHANGELOG.md has no section for ${tag}. Add one before releasing.`);

const remainder = changelog.slice(match.index + match[0].length);
const nextHeading = remainder.search(/^## \[/m);
const section = (nextHeading === -1 ? remainder : remainder.slice(0, nextHeading)).trim();
if (!section) abort(`CHANGELOG.md section for ${tag} is empty.`);

process.stdout.write(`## Macheim ${tag}\n\n${section}\n\n---\n\n${FOOTER}\n`);
