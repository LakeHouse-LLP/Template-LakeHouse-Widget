#!/usr/bin/env node
/**
 * Copy the package.json version into widget.json.
 *
 * Changesets only bumps package.json (plus CHANGELOG.md), while
 * check-widget requires widget.json to carry the same version. Run this
 * script as part of `changeset:version` so every version PR keeps the two
 * files in sync. Only the top-level "version" line is replaced, so the
 * rest of widget.json keeps its exact formatting.
 *
 * Usage: node scripts/sync-widget-version.mjs [root-dir]
 * With no argument the repo root is used. Exits non-zero when either file
 * is missing, unparsable, or lacks a version string.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "./lib/repo.mjs";

const VERSION_LINE = /^  "version": "[^"]*"/m;

function loadJson(rootDir, rel) {
  const text = readFileSync(path.join(rootDir, rel), "utf8");
  return { text, data: JSON.parse(text) };
}

function requireVersion(data, rel) {
  if (typeof data.version !== "string" || !data.version) {
    throw new Error(`sync-widget-version: ${rel} has no version string`);
  }
  return data.version;
}

/**
 * Sync widget.json to the package.json version inside rootDir.
 * Returns { changed, from, to }. No write happens when already in sync.
 */
export function syncWidgetVersion(rootDir) {
  const pkg = loadJson(rootDir, "package.json");
  const next = requireVersion(pkg.data, "package.json");

  const manifest = loadJson(rootDir, "widget.json");
  const current = requireVersion(manifest.data, "widget.json");
  if (current === next) {
    return { changed: false, from: current, to: next };
  }

  if (!VERSION_LINE.test(manifest.text)) {
    throw new Error(
      "sync-widget-version: widget.json has no top-level version line to replace",
    );
  }
  const updated = manifest.text.replace(
    VERSION_LINE,
    `  "version": ${JSON.stringify(next)}`,
  );

  // Guard the text edit: the rewritten file must parse, carry the new
  // version, and differ from the old manifest in the version field only.
  const reparsed = JSON.parse(updated);
  if (reparsed.version !== next) {
    throw new Error("sync-widget-version: rewrite did not set the new version");
  }
  const { version: _old, ...before } = manifest.data;
  const { version: _new, ...after } = reparsed;
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("sync-widget-version: rewrite changed more than the version");
  }

  writeFileSync(path.join(rootDir, "widget.json"), updated, "utf8");
  return { changed: true, from: current, to: next };
}

function main() {
  const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : ROOT;
  try {
    const result = syncWidgetVersion(rootDir);
    if (result.changed) {
      console.log(
        `sync-widget-version: widget.json ${result.from} -> ${result.to}`,
      );
    } else {
      console.log(`sync-widget-version: widget.json already at ${result.to}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const invokedAsScript =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  main();
}
