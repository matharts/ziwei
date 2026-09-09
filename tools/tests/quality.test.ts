import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "@rstest/core";
import type { TestContext } from "@rstest/core";

const root = fileURLToPath(new URL("../..", import.meta.url));

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "ziwei oxc quality-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  for (const file of [".editorconfig", ".oxlintrc.json", ".oxfmtrc.json"]) {
    cpSync(join(root, file), join(directory, file));
  }
  for (const folder of ["src", "native", "dist", "node_modules", "target"]) {
    mkdirSync(join(directory, folder));
    // Invalid generated code proves the ignore policy is effective for both tools.
    writeFileSync(
      join(directory, folder, "index.ts"),
      folder === "src" ? "export const value = 1;\n" : "export const = ;\n",
    );
  }
  const run = (tool: "oxlint" | "oxfmt", args: string[]) => {
    const result = spawnSync(
      process.execPath,
      [join(root, "node_modules", tool, "bin", tool), ...args],
      {
        cwd: directory,
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    return result;
  };
  return { directory, source: join(directory, "src/index.ts"), run };
}

test("Oxlint checks correctness while ignoring generated code", (t) => {
  const { source, run } = fixture(t);
  const clean = run("oxlint", ["--deny-warnings", "."]);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  const invalid = "export const value = 1;\nconst unused = 2;\n";
  writeFileSync(source, invalid);
  const rejected = run("oxlint", ["--deny-warnings", "."]);
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  assert.match(rejected.stdout + rejected.stderr, /no-unused-vars/);
  assert.equal(readFileSync(source, "utf8"), invalid);
});

test("Oxfmt check is read-only and formatting leaves generated files untouched", (t) => {
  const { directory, source, run } = fixture(t);
  const clean = run("oxfmt", ["--check", "."]);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  const unformatted = "export const value={first:1,second:2}\n";
  writeFileSync(source, unformatted);
  const rejected = run("oxfmt", ["--check", "."]);
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  assert.equal(readFileSync(source, "utf8"), unformatted);
  const formatted = run("oxfmt", ["."]);
  assert.equal(formatted.status, 0, formatted.stdout + formatted.stderr);
  assert.notEqual(readFileSync(source, "utf8"), unformatted);
  const checked = run("oxfmt", ["--check", "."]);
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  for (const folder of ["native", "dist", "node_modules", "target"]) {
    assert.equal(readFileSync(join(directory, folder, "index.ts"), "utf8"), "export const = ;\n");
  }
});

test("Oxfmt sorts origin groups, workspace imports and types across blank lines", (t) => {
  const { source, run } = fixture(t);
  writeFileSync(
    source,
    [
      'import styles from "./theme.css";',
      'import { sibling } from "./sibling.js";',
      'import { parent } from "../parent.js";',
      'import { index } from "./index.js";',
      'import { internal } from "#profile";',
      'import type { Natal } from "@matharts/ziwei";',
      'import { Ziwei } from "@matharts/ziwei";',
      'import { other } from "@matharts-extra/ziwei";',
      'import { z } from "Z-external";',
      "",
      'import { a } from "a-external";',
      'import type { External } from "a-external";',
      'import type { PathLike } from "node:fs";',
      'import assert from "node:assert/strict";',
      "",
    ].join("\n"),
  );
  const result = run("oxfmt", ["src"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const formatted = readFileSync(source, "utf8");
  assert.equal(
    formatted,
    [
      'import assert from "node:assert/strict";',
      'import type { PathLike } from "node:fs";',
      "",
      'import { other } from "@matharts-extra/ziwei";',
      'import { a } from "a-external";',
      'import type { External } from "a-external";',
      'import { z } from "Z-external";',
      "",
      'import { internal } from "#profile";',
      'import type { Natal } from "@matharts/ziwei";',
      'import { Ziwei } from "@matharts/ziwei";',
      "",
      'import { parent } from "../parent.js";',
      'import { index } from "./index.js";',
      'import { sibling } from "./sibling.js";',
      "",
      'import styles from "./theme.css";',
      "",
    ].join("\n"),
  );
  const repeated = run("oxfmt", ["src"]);
  assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
  assert.equal(readFileSync(source, "utf8"), formatted);
});

test("Oxfmt keeps side-effect slots and comment partitions while sorting ordinary imports", (t) => {
  const { source, run } = fixture(t);
  writeFileSync(
    source,
    [
      'import { z } from "z";',
      'import { b } from "b";',
      'import "z-init";',
      'import { a } from "a";',
      'import "a-init";',
      "// Keep this section separate.",
      'import { first } from "0-first";',
      "",
    ].join("\n"),
  );
  const result = run("oxfmt", ["src"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const lines = readFileSync(source, "utf8").split("\n").filter(Boolean);
  // Side-effect imports keep their slots, but do not partition ordinary imports.
  // The comment, unlike a bare import, prevents 0-first from moving across it.
  assert.deepEqual(lines, [
    'import { a } from "a";',
    'import { b } from "b";',
    'import "z-init";',
    'import { z } from "z";',
    'import "a-init";',
    "// Keep this section separate.",
    'import { first } from "0-first";',
  ]);
});
