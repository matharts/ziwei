import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "@rstest/core";

const packageRoot = fileURLToPath(new URL("../../packages/ziwei/", import.meta.url));
const packageRequire = createRequire(join(packageRoot, "package.json"));
const rslibManifest = packageRequire.resolve("@rslib/core/package.json");
const rslib = join(
  dirname(rslibManifest),
  JSON.parse(readFileSync(rslibManifest, "utf8")).bin.rslib,
);

test("Rslib rejects type errors even in a source file not imported by the entry", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ziwei-rslib-build-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, "src"));
  mkdirSync(join(directory, "node_modules"));
  // A standalone project must resolve its own compiler, without a bin shim's NODE_PATH.
  symlinkSync(
    dirname(packageRequire.resolve("typescript/package.json")),
    join(directory, "node_modules/typescript"),
    "junction",
  );
  cpSync(join(packageRoot, "tsconfig.json"), join(directory, "tsconfig.json"));
  writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
  writeFileSync(join(directory, "src/index.ts"), "export const valid: number = 42;\n");
  const build = () =>
    spawnSync(
      process.execPath,
      [rslib, "build", "--config", join(packageRoot, "rslib.config.ts"), "--root", directory],
      { cwd: directory, encoding: "utf8", timeout: 60_000 },
    );
  // Establish that this fixture builds before introducing an unreferenced error.
  const valid = build();
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  writeFileSync(
    join(directory, "src/invalid.ts"),
    "export const invalid: number = 'not a number';\n",
  );
  const result = build();
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /TS2322/);
});
