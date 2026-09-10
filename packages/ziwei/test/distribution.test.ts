import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "@rstest/core";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const root = join(packageRoot, "../..");
const packModule = new URL("../tools/pack.ts", import.meta.url).href;
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const options = { encoding: "utf8" as const, timeout: 30_000, stdio: "pipe" as const };
// Independent contract, not napi-rs-derived expectations.
const targets = [
  ["aarch64-apple-darwin", "darwin-arm64", "darwin", "arm64", null],
  ["x86_64-apple-darwin", "darwin-x64", "darwin", "x64", null],
  ["aarch64-pc-windows-msvc", "win32-arm64-msvc", "win32", "arm64", null],
  ["x86_64-pc-windows-msvc", "win32-x64-msvc", "win32", "x64", null],
  ["x86_64-unknown-linux-gnu", "linux-x64-gnu", "linux", "x64", "glibc"],
  ["aarch64-unknown-linux-gnu", "linux-arm64-gnu", "linux", "arm64", "glibc"],
  ["x86_64-unknown-linux-musl", "linux-x64-musl", "linux", "x64", "musl"],
  ["aarch64-unknown-linux-musl", "linux-arm64-musl", "linux", "arm64", "musl"],
] as const;

test("distributed tarballs load through an optional platform package, including failure paths", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ziwei-pack-test-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const host = execFileSync("rustc", ["-vV"], options)
    .match(/^host: (.+)$/m)?.[1]
    ?.trim();
  assert.ok(host);
  // A native runner can use a cross-host Rust toolchain. The consumer checks the
  // actual Node CPU/libc against the installed artifact, not rustc's host triple.
  const target = process.env.ZIWEI_NODE_TARGET ?? process.env.CARGO_BUILD_TARGET ?? host;
  execFileSync("mise", ["run", "pack:node", "--", "--target", target, "--output", directory], {
    ...options,
    cwd: root,
  });
  const staged = join(directory, readdirSync(directory)[0]!);
  // Resolve the npm CLI belonging to this selected Node installation, not a .cmd shim.
  const nodeBin = dirname(process.execPath);
  const npmCli =
    process.platform === "win32"
      ? join(nodeBin, "node_modules/npm/bin/npm-cli.js")
      : join(nodeBin, "../lib/node_modules/npm/bin/npm-cli.js");
  assert.ok(existsSync(npmCli), npmCli);
  const result = execFileSync(
    process.execPath,
    [fileURLToPath(new URL("./fixtures/distribution-consumer.ts", import.meta.url)), staged],
    {
      ...options,
      env: {
        ...process.env,
        ZIWEI_NPM_CLI: npmCli,
        ZIWEI_TSC_CLI: join(packageRoot, "node_modules/typescript/bin/tsc"),
      },
    },
  );
  assert.match(result, /distribution-consumer-ok/);
  // CI uploads only these exact tested tarballs, even if a later task rebuilds dist.
  if (process.env.ZIWEI_NODE_ARTIFACTS) {
    execFileSync(
      "mise",
      [
        "run",
        "capture:node",
        "--",
        "--input",
        staged,
        "--target",
        target,
        "--output",
        process.env.ZIWEI_NODE_ARTIFACTS,
      ],
      { ...options, cwd: root },
    );
  }
});

test("complete artifact cohorts preserve tested bytes and reject mixed or damaged inputs", () => {
  const result = execFileSync(
    process.execPath,
    [fileURLToPath(new URL("./fixtures/artifact-contract.ts", import.meta.url))],
    { ...options, timeout: 90_000 },
  );
  assert.match(result, /artifact-contract-ok/);
}, 120_000);

test("staging validates all eight target manifests and refuses incomplete or unknown sets", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ziwei-metadata-test-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const fixture = join(directory, "packages/ziwei");
  mkdirSync(join(fixture, "native"), { recursive: true });
  cpSync(join(packageRoot, "dist"), join(fixture, "dist"), { recursive: true });
  cpSync(join(packageRoot, "src"), join(fixture, "src"), { recursive: true });
  for (const file of [
    "package.json",
    "README.md",
    "AGENTS.md",
    "native/binding.cjs",
    "native/binding.d.cts",
  ])
    cpSync(join(packageRoot, file), join(fixture, file));
  cpSync(join(root, "LICENSE"), join(directory, "LICENSE"));
  const manifest = readJson(join(fixture, "package.json"));
  assert.deepEqual([...manifest.napi.targets].sort(), targets.map(([target]) => target).sort());
  // These bytes test metadata/copying only; only the runtime test claims real native loading.
  for (const [, suffix] of targets)
    writeFileSync(join(fixture, "native", `ziwei-native.${suffix}.node`), `fixture-${suffix}`);
  const output = join(directory, "output");
  const stage = (selected: readonly string[]) =>
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `
    const {stageDistribution} = await import(${JSON.stringify(packModule)});
    console.log(JSON.stringify(await stageDistribution(${JSON.stringify(fixture)}, ${JSON.stringify(output)}, ${JSON.stringify(selected)})));
  `,
      ],
      options,
    );
  for (const selected of [[], ["unknown-target"], [targets[0][0], targets[0][0]]])
    assert.throws(() => stage(selected));
  // Non-entry JS and declarations are required too, even when absent from readdir.
  for (const file of ["natal.js", "types.d.ts"]) {
    rmSync(join(fixture, "dist", file));
    assert.throws(() => stage([targets[0][0]]), /ENOENT/);
    assert.equal(existsSync(output), false);
    cpSync(join(packageRoot, "dist", file), join(fixture, "dist", file));
  }
  assert.equal(existsSync(output), false);
  const result = stage(targets.map(([target]) => target));
  const staged = JSON.parse(result.trim().split("\n").at(-1)!);
  const main = readJson(join(staged.mainDirectory, "package.json"));
  for (const [target, suffix, os, cpu, libc] of targets) {
    const pkg = readJson(join(staged.directory, "platforms", suffix, "package.json"));
    assert.equal(pkg.name, `@matharts/ziwei-${suffix}`, target);
    assert.equal(pkg.version, manifest.version);
    assert.equal(pkg.private, true);
    assert.deepEqual(pkg.os, [os]);
    assert.deepEqual(pkg.cpu, [cpu]);
    assert.deepEqual(pkg.libc, libc ? [libc] : undefined);
    assert.equal(pkg.main, `ziwei-native.${suffix}.node`);
    assert.equal(
      readFileSync(join(staged.directory, "platforms", suffix, pkg.main), "utf8"),
      `fixture-${suffix}`,
    );
    assert.equal(main.optionalDependencies[pkg.name], manifest.version);
  }
  assert.equal(Object.keys(main.optionalDependencies).length, 8);
  assert.equal(readJson(join(packageRoot, "package.json")).optionalDependencies, undefined);
  rmSync(join(fixture, "native", "ziwei-native.darwin-arm64.node"));
  assert.throws(() => stage(targets.map(([target]) => target)), /ENOENT/);
  assert.equal(readdirSync(output).length, 1, "failed preflight must not stage partial packages");
});
