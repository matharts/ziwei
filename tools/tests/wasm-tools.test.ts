import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "@rstest/core";
import type { TestContext } from "@rstest/core";

const root = fileURLToPath(new URL("../..", import.meta.url));

// Only external build programs are fixtures; mise executes the real glue task.
function writeCommand(directory: string, name: string, body: string) {
  mkdirSync(directory, { recursive: true });
  const script = join(directory, `${name}.cjs`);
  writeFileSync(script, body);
  const command = join(directory, process.platform === "win32" ? `${name}.cmd` : name);
  writeFileSync(
    command,
    process.platform === "win32"
      ? `@echo off\r\n"${process.execPath}" "${script}" %*\r\nexit /b %errorlevel%\r\n`
      : `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${script.replaceAll("'", "'\\''")}' "$@"\n`,
  );
  if (process.platform !== "win32") chmodSync(command, 0o755);
}

function fixture(t: TestContext, installStatus = 0, glueStatus = 0) {
  const directory = mkdtempSync(join(tmpdir(), "ziwei wasm tools-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const mise = (process.env[pathKey] ?? "")
    .split(delimiter)
    .map((path) => join(path, process.platform === "win32" ? "mise.exe" : "mise"))
    .find(existsSync);
  assert.ok(mise, "mise must be available to run the engineering tests");
  const version = readFileSync(join(root, "bindings/wasm/Cargo.toml"), "utf8").match(
    /^wasm-bindgen = "=([^"]+)"$/m,
  )?.[1];
  assert.ok(version);
  const glue = readFileSync(join(root, "mise.toml"), "utf8").match(
    /^\[tasks\."build:wasm:glue"\][\s\S]*?(?=^\[|$(?![\s\S]))/m,
  )?.[0];
  assert.ok(glue);
  writeFileSync(
    join(directory, "mise.toml"),
    `
[tasks.verify]
run = [{ task = "build" }]
[tasks.build]
run = [{ task = "build:wasm:glue" }]
${glue}
`,
  );
  const bin = join(directory, "bin");
  const events = join(directory, "events.jsonl");
  const record = `const fs = require('node:fs');
    const record = event => fs.appendFileSync(${JSON.stringify(events)}, JSON.stringify(event) + '\\n');`;
  writeCommand(
    bin,
    "mise",
    `const {spawnSync} = require('node:child_process');
    const result = spawnSync(${JSON.stringify(mise)}, process.argv.slice(2), {stdio: 'inherit'});
    process.exit(result.status ?? 1);`,
  );
  const tool = `${record}
    record({kind: 'glue', version: ${JSON.stringify(version)}, args: process.argv.slice(2)});
    process.exit(${glueStatus});`;
  writeCommand(
    bin,
    "cargo",
    String.raw`${record}
    const assert = require('node:assert/strict');
    const {join} = require('node:path');
    const args = process.argv.slice(2);
    record({kind: 'install', args});
    assert.equal(args[0], 'install');
    assert.equal(args[1], ${JSON.stringify(`wasm-bindgen-cli@${version}`)});
    assert.ok(args.includes('--locked'));
    assert.ok(args.includes('--root'));
    if (${installStatus} !== 0) process.exit(${installStatus});
    const destination = args[args.indexOf('--root') + 1];
    const script = join(destination, 'bin', 'wasm-bindgen.cjs');
    fs.mkdirSync(join(destination, 'bin'), {recursive: true});
    fs.writeFileSync(script, ${JSON.stringify(tool)});
    const executable = join(destination, 'bin', process.platform === 'win32' ? 'wasm-bindgen.cmd' : 'wasm-bindgen');
    fs.writeFileSync(executable, process.platform === 'win32'
      ? '@echo off\r\n"' + process.execPath + '" "' + script + '" %*\r\nexit /b %errorlevel%\r\n'
      : '#!/bin/sh\nexec "' + process.execPath + '" "' + script + '" "$@"\n');
    if (process.platform !== 'win32') fs.chmodSync(executable, 0o755);`,
  );
  writeCommand(bin, "pnpm", `${record} record({kind: 'manifest', args: process.argv.slice(2)});`);
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(?:MISE_|__MISE_|CARGO_|RUSTUP_)/.test(key)) delete env[key];
  }
  Object.assign(env, {
    MISE_DATA_DIR: join(directory, "data"),
    MISE_CACHE_DIR: join(directory, "cache"),
    MISE_STATE_DIR: join(directory, "state"),
    MISE_CONFIG_DIR: join(directory, "config"),
    MISE_GLOBAL_CONFIG_FILE: join(directory, "global.toml"),
    MISE_TRUSTED_CONFIG_PATHS: directory,
    MISE_YES: "1",
    MISE_CARGO_BINSTALL: "0",
  });
  // No inherited tool directories or shims: a warm developer machine must not rescue the task.
  env[pathKey] = [
    bin,
    ...(process.platform === "win32"
      ? [join(process.env.SystemRoot ?? "C:\\Windows", "System32")]
      : ["/usr/bin", "/bin", "/usr/sbin", "/sbin"]),
  ].join(delimiter);
  const run = () => {
    const result = spawnSync(mise, ["run", "verify"], {
      cwd: directory,
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.ifError(result.error);
    const observed: { kind: string; version?: string; args: string[] }[] = existsSync(events)
      ? readFileSync(events, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    return { result, observed };
  };
  return { run, version };
}

test("nested Wasm glue installs and activates its exact CLI in an empty tool cache", (t) => {
  const { run, version } = fixture(t);
  const { result, observed } = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    observed.map((event) => event.kind),
    ["install", "glue", "manifest"],
  );
  assert.equal(observed[1].version, version);
  assert.equal(observed[1].args[0], "--target");
  assert.equal(observed[1].args[1], "web");
  const warm = run();
  assert.equal(warm.result.status, 0, warm.result.stderr);
  assert.deepEqual(
    warm.observed.map((event) => event.kind),
    ["install", "glue", "manifest", "glue", "manifest"],
  );
});

for (const [stage, installStatus, glueStatus, expected] of [
  ["installation", 23, 0, ["install"]],
  ["glue", 0, 29, ["install", "glue"]],
] as const) {
  test(`a Wasm CLI ${stage} failure stops the manifest and parent task`, (t) => {
    const { result, observed } = fixture(t, installStatus, glueStatus).run();
    assert.notEqual(result.status, 0);
    assert.deepEqual(
      observed.map((event) => event.kind),
      expected,
    );
  });
}
