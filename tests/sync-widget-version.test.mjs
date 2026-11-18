import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { syncWidgetVersion } from "../scripts/sync-widget-version.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "sync-widget-version.mjs");

function fixtureDir({ pkgVersion, widgetVersion }) {
  const dir = mkdtempSync(path.join(tmpdir(), "sync-widget-version-"));
  writeFileSync(
    path.join(dir, "package.json"),
    `${JSON.stringify({ name: "fixture", version: pkgVersion }, null, 2)}\n`,
  );
  // Compact single-line array on purpose: the sync must not reformat it.
  writeFileSync(
    path.join(dir, "widget.json"),
    [
      "{",
      '  "id": "fixture.widget",',
      `  "version": "${widgetVersion}",`,
      '  "surfaces": ["panel", "standalone"]',
      "}",
      "",
    ].join("\n"),
  );
  return dir;
}

function readWidget(dir) {
  return readFileSync(path.join(dir, "widget.json"), "utf8");
}

describe("sync-widget-version", () => {
  it("writes the package version into widget.json, touching only that line", () => {
    const dir = fixtureDir({ pkgVersion: "0.2.0", widgetVersion: "0.1.0" });
    const before = readWidget(dir);

    const result = syncWidgetVersion(dir);

    assert.deepEqual(result, { changed: true, from: "0.1.0", to: "0.2.0" });
    const after = readWidget(dir);
    assert.equal(JSON.parse(after).version, "0.2.0");
    const beforeLines = before.split("\n");
    const afterLines = after.split("\n");
    assert.equal(afterLines.length, beforeLines.length);
    const changedLines = beforeLines.filter((line, i) => line !== afterLines[i]);
    assert.deepEqual(changedLines, ['  "version": "0.1.0",']);
    assert.match(after, /"surfaces": \["panel", "standalone"\]/);
  });

  it("is a no-op when the versions already match", () => {
    const dir = fixtureDir({ pkgVersion: "0.1.0", widgetVersion: "0.1.0" });
    const before = readWidget(dir);

    const result = syncWidgetVersion(dir);

    assert.deepEqual(result, { changed: false, from: "0.1.0", to: "0.1.0" });
    assert.equal(readWidget(dir), before);
  });

  it("fails when widget.json has no version field", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sync-widget-version-"));
    writeFileSync(
      path.join(dir, "package.json"),
      '{"name": "fixture", "version": "0.2.0"}\n',
    );
    writeFileSync(path.join(dir, "widget.json"), '{"id": "fixture.widget"}\n');

    assert.throws(() => syncWidgetVersion(dir), /no version string/);
  });

  it("fails when package.json has no version field", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sync-widget-version-"));
    writeFileSync(path.join(dir, "package.json"), '{"name": "fixture"}\n');
    writeFileSync(
      path.join(dir, "widget.json"),
      '{"id": "fixture.widget", "version": "0.1.0"}\n',
    );

    assert.throws(() => syncWidgetVersion(dir), /no version string/);
  });

  it("fails when widget.json is missing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sync-widget-version-"));
    writeFileSync(
      path.join(dir, "package.json"),
      '{"name": "fixture", "version": "0.2.0"}\n',
    );

    assert.throws(() => syncWidgetVersion(dir), /ENOENT/);
  });

  it("runs as a CLI against a given root directory", () => {
    const dir = fixtureDir({ pkgVersion: "1.0.0", widgetVersion: "0.1.0" });

    const out = execFileSync("node", [script, dir], { encoding: "utf8" });

    assert.match(out, /widget\.json 0\.1\.0 -> 1\.0\.0/);
    assert.equal(JSON.parse(readWidget(dir)).version, "1.0.0");
  });

  it("changeset:version runs the sync step", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    assert.match(pkg.scripts["changeset:version"], /sync-widget-version\.mjs/);
    assert.ok(
      pkg.scripts["changeset:version"].indexOf("changeset version") <
        pkg.scripts["changeset:version"].indexOf("sync-widget-version"),
      "sync must run after changeset version bumps package.json",
    );
  });
});
