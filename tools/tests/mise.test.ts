import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "@rstest/core";
import type { TestContext } from "@rstest/core";

const root = fileURLToPath(new URL("../..", import.meta.url));
const literalArgs = Object.freeze([
  "--name",
  "contains spaces",
  "中文",
  "quote'\"",
  "literal;$()&",
  "",
  " ",
  "\t",
  "\n",
  "\r\n",
  "C:\\path with spaces\\file\\",
  "line one\nline two",
  " leading ",
  "  $ZIWEI_LITERAL  ",
  "$ZIWEI_LITERAL",
  "${ZIWEI_LITERAL}",
  "`echo expanded`",
  "%ZIWEI_LITERAL%",
  "*",
  "?",
  "[ab]",
  "--dir",
  "unchanged",
  "--filter",
  "unchanged",
  "--color",
  "--",
  "-C",
  "unchanged",
]);

// Independent expectations for the commands declared in mise.toml, not a runner.
const tasks: Record<
  string,
  { cwd: string; package: string; bin: string; path: string; args: string[] }
> = {
  "build:node:native": {
    cwd: "packages/ziwei",
    package: "@napi-rs/cli",
    bin: "napi",
    path: "dist/cli.js",
    args: [
      "build",
      "--manifest-path",
      "../../bindings/node/Cargo.toml",
      "--package",
      "ziwei-node",
      "--platform",
      "--release",
      "--output-dir",
      "native",
      "--js",
      "binding.cjs",
      "--dts",
      "binding.d.cts",
      "--",
      "--locked",
    ],
  },
  "build:node:ts": {
    cwd: "packages/ziwei",
    package: "@rslib/core",
    bin: "rslib",
    path: "bin/rslib.js",
    args: ["build"],
  },
  "test:node": {
    cwd: ".",
    package: "@rstest/core",
    bin: "rstest",
    path: "bin/rstest.js",
    args: ["--project", "ziwei"],
  },
  "check:node:types": {
    cwd: "packages/ziwei",
    package: "typescript",
    bin: "tsc",
    path: "bin/tsc",
    args: ["--project", "test/tsconfig.json"],
  },
  "check:typescript": {
    cwd: ".",
    package: "typescript",
    bin: "tsc",
    path: "bin/tsc",
    args: ["--project", "tsconfig.json"],
  },
  "lint:node": {
    cwd: ".",
    package: "oxlint",
    bin: "oxlint",
    path: "bin/oxlint",
    args: ["--deny-warnings", "packages", "tools/tests", "rstest.config.ts"],
  },
  "lint:node:fix": {
    cwd: ".",
    package: "oxlint",
    bin: "oxlint",
    path: "bin/oxlint",
    args: ["--fix", "--deny-warnings", "packages", "tools/tests", "rstest.config.ts"],
  },
  "format:node": {
    cwd: ".",
    package: "oxfmt",
    bin: "oxfmt",
    path: "bin/oxfmt",
    args: [
      "packages/**/*.{ts,json,jsonc}",
      "tools/tests/**/*.ts",
      "rstest.config.ts",
      "package.json",
      "tsconfig.json",
      ".oxlintrc.json",
      ".oxfmtrc.json",
    ],
  },
  "check:node:format": {
    cwd: ".",
    package: "oxfmt",
    bin: "oxfmt",
    path: "bin/oxfmt",
    args: [
      "--check",
      "packages/**/*.{ts,json,jsonc}",
      "tools/tests/**/*.ts",
      "rstest.config.ts",
      "package.json",
      "tsconfig.json",
      ".oxlintrc.json",
      ".oxfmtrc.json",
    ],
  },
};

type Probe = {
  version: string;
  executable: string;
  child: { version: string; executable: string };
  args: string[];
  cwd: string;
};
const rows = (stdout: string): Probe[] =>
  stdout
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));

function fixture(t: TestContext, { activated = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "ziwei mise runtime-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, "packages/ziwei"), { recursive: true });
  for (const file of [
    "package.json",
    "pnpm-workspace.yaml",
    "mise.toml",
    "packages/ziwei/package.json",
  ]) {
    cpSync(join(root, file), join(directory, file));
  }
  const cliPaths: Record<string, string> = {};
  for (const [task, spec] of Object.entries(tasks)) {
    const moduleRoot = join(directory, spec.cwd, "node_modules", spec.package);
    const cli = join(moduleRoot, spec.path);
    mkdirSync(dirname(cli), { recursive: true });
    // Installed CLIs are generated JS; Node does not strip TS in node_modules.
    writeFileSync(
      join(moduleRoot, "package.json"),
      JSON.stringify({
        name: spec.package,
        type: "commonjs",
        bin: { [spec.bin]: spec.path },
      }),
    );
    writeFileSync(
      cli,
      `
      const {spawnSync} = require('node:child_process');
      const child = spawnSync('node', ['-p', 'JSON.stringify({version: process.version, executable: process.execPath})'], {encoding: 'utf8'});
      if (child.status !== 0) process.exit(child.status ?? 1);
      console.log(JSON.stringify({version: process.version, executable: process.execPath,
        child: JSON.parse(child.stdout), args: process.argv.slice(2), cwd: process.cwd()}));
    `,
    );
    cliPaths[task] = cli;
  }
  const shadow = join(directory, "shadow bin");
  mkdirSync(shadow);
  const executable = join(shadow, process.platform === "win32" ? "node.cmd" : "node");
  writeFileSync(
    executable,
    process.platform === "win32" ? "@echo off\r\nexit /b 19\r\n" : "#!/bin/sh\nexit 19\n",
  );
  if (process.platform !== "win32") chmodSync(executable, 0o755);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MISE_TRUSTED_CONFIG_PATHS: directory,
    ZIWEI_LITERAL: "must not expand",
  };
  if (!activated) delete env.__MISE_DIFF;
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  env[pathKey] = shadow + delimiter + env[pathKey];
  const run = (args: string[], cwd = directory) =>
    spawnSync("mise", args, {
      cwd,
      env,
      encoding: "utf8",
      timeout: 60_000,
    });
  return { directory, run, env, cliPaths };
}

function assertRuntime(row: Probe) {
  assert.equal(row.version, process.version);
  assert.equal(realpathSync.native(row.executable), realpathSync.native(process.execPath));
  assert.equal(row.child.version, process.version);
  assert.equal(realpathSync.native(row.child.executable), realpathSync.native(process.execPath));
}

for (const activated of [true, false]) {
  test(`mise tasks select Node and preserve command order (activation record: ${activated})`, (t) => {
    const { directory, run, env } = fixture(t, { activated });
    // Prove the shadow is active independently of pnpm's platform-specific diagnostics.
    // Windows needs cmd.exe to resolve the node.cmd fixture through PATH.
    const blocked = spawnSync(
      process.platform === "win32" ? "cmd.exe" : "node",
      process.platform === "win32" ? ["/d", "/s", "/c", "node --version"] : ["--version"],
      { cwd: directory, env, encoding: "utf8", timeout: 30_000 },
    );
    assert.ifError(blocked.error);
    assert.equal(blocked.status, 19, blocked.stderr);
    // check:node traverses the native build, TS build, package tests and type check.
    for (const [task, expected] of [
      ["check:node", ["build:node:native", "build:node:ts", "test:node", "check:node:types"]],
      ["check:typescript", ["check:typescript"]],
      ["lint:node", ["lint:node"]],
      ["lint:node:fix", ["lint:node:fix"]],
      ["format:node", ["format:node"]],
      ["check:node:format", ["check:node:format"]],
    ] as const) {
      const result = run(["run", task]);
      assert.equal(result.status, 0, result.stderr);
      const output = rows(result.stdout);
      assert.equal(output.length, expected.length);
      for (const [i, name] of expected.entries()) {
        assertRuntime(output[i]);
        assert.deepEqual(output[i].args, tasks[name].args);
        assert.equal(
          realpathSync.native(output[i].cwd),
          realpathSync.native(join(directory, tasks[name].cwd)),
        );
      }
    }
  });
}

test("mise owns task definitions and CLI paths match installed dependency manifests", () => {
  for (const path of ["package.json", "packages/ziwei/package.json"]) {
    assert.equal(JSON.parse(readFileSync(join(root, path), "utf8")).scripts, undefined);
  }
  for (const spec of Object.values(tasks)) {
    const manifest = JSON.parse(
      readFileSync(join(root, spec.cwd, "node_modules", spec.package, "package.json"), "utf8"),
    );
    assert.equal(manifest.bin[spec.bin].replace(/^\.\//, ""), spec.path);
  }
  assert.doesNotMatch(
    readFileSync(join(root, "mise.toml"), "utf8"),
    /tools\/node\/run\.|pnpm (?:--filter \S+ )?run /,
  );
});

test("root devEngines owns development constraints and agrees with mise and the consumer floor", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const consumer = JSON.parse(readFileSync(join(root, "packages/ziwei/package.json"), "utf8"));
  const mise = readFileSync(join(root, "mise.toml"), "utf8");
  assert.deepEqual(manifest.devEngines, {
    runtime: { name: "node", version: consumer.engines.node, onFail: "error" },
    packageManager: {
      name: "pnpm",
      version: /^pnpm = "([^"]+)"$/m.exec(mise)?.[1],
      onFail: "error",
    },
  });
  assert.equal(manifest.packageManager, undefined);
  assert.equal(manifest.engines, undefined);
  assert.equal(consumer.devEngines, undefined);
  assert.doesNotMatch(
    readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"),
    /^(?:pmOnFail|runtimeOnFail):/m,
  );
});

for (const [engine, code] of [
  ["runtime", "ERR_PNPM_BAD_RUNTIME_VERSION"],
  ["packageManager", "ERR_PNPM_BAD_PM_VERSION"],
] as const) {
  test(`devEngines rejects a mismatched ${engine} before install and mise tasks`, (t) => {
    const { directory, run } = fixture(t);
    const manifestPath = join(directory, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const valid = run(["run", "test:node"]);
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(rows(valid.stdout).length, 1);
    manifest.devEngines[engine].version = "0.0.0";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    for (const args of [
      ["exec", "--", "pnpm", "install", "--offline", "--frozen-lockfile"],
      ["run", "test:node"],
    ]) {
      const result = run(args);
      assert.notEqual(result.status, 0, args.join(" "));
      assert.ok(result.stderr.includes(code), result.stderr);
      assert.equal(rows(result.stdout).length, 0);
    }
  });
}

test("the documented direct CLI entry preserves literal arguments and the selected Node", (t) => {
  const { run } = fixture(t);
  const spec = tasks["test:node"];
  const cli = `node_modules/${spec.package}/${spec.path}`;
  const result = run([
    "exec",
    "--",
    "pnpm",
    "exec",
    "--",
    "node",
    cli,
    ...spec.args,
    ...literalArgs,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const output = rows(result.stdout);
  assert.equal(output.length, 1);
  assertRuntime(output[0]);
  assert.deepEqual(output[0].args, [...spec.args, ...literalArgs]);
});

test("leaf tasks accept ordinary CLI options without invoking aggregate builds", (t) => {
  const { run } = fixture(t);
  for (const [task, args] of [
    ["test:node", ["-t", "palace"]],
    ["build:node:ts", ["--watch"]],
  ] as const) {
    const result = run(["run", task, "--", ...args]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      rows(result.stdout).map((row) => row.args),
      [[...tasks[task].args, ...args]],
    );
  }
});

for (const [failed, expected] of [
  ["build:node:native", []],
  ["build:node:ts", ["build:node:native"]],
  ["test:node", ["build:node:native", "build:node:ts"]],
  ["check:node:types", ["build:node:native", "build:node:ts", "test:node"]],
] as const) {
  test(`a ${failed} failure preserves diagnostics and stops subsequent checks`, (t) => {
    const { run, cliPaths } = fixture(t, { activated: false });
    writeFileSync(
      cliPaths[failed],
      "process.stdout.write('tool-out\\n'); process.stderr.write('tool-error\\n'); process.exit(23);\n",
    );
    const result = run(["run", "check:node"]);
    assert.equal(result.status, 23);
    assert.match(result.stdout, /tool-out/);
    assert.match(result.stderr, /tool-error/);
    assert.deepEqual(
      rows(result.stdout).map((row) => row.args),
      expected.map((task) => tasks[task].args),
    );
  });
}
