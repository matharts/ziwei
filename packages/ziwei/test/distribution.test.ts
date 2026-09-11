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

import { digest, readCandidate } from "../tools/candidate.ts";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const root = join(packageRoot, "../..");
const packModule = new URL("../tools/pack.ts", import.meta.url).href;
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const options = { encoding: "utf8" as const, timeout: 30_000, stdio: "pipe" as const };
// Independent contract, not napi-rs-derived expectations.
// Packaging needs generated dist/native files; it belongs after build, not in node-tools.
for (const [target, suffix, arch, little, machine] of [
  ["powerpc64le-unknown-linux-gnu", "linux-ppc64-gnu", "ppc64", true, 21],
  ["s390x-unknown-linux-gnu", "linux-s390x-gnu", "s390x", false, 22],
] as const) {
  test(`candidate sealing reuses audited bytes and never widens release metadata (${target})`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), "ziwei-candidate-pack-test-"));
    t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
    const source = readJson(join(packageRoot, "package.json"));
    const batch = { commit: "a".repeat(40), runId: "123", runAttempt: "2" };
    // Synthetic ABI header exercises sealing, never loading or platform support.
    const binary = Buffer.alloc(64);
    binary.set([0x7f, 0x45, 0x4c, 0x46, 2, little ? 1 : 2, 1]);
    const header = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    header.setUint16(16, 3, little);
    header.setUint16(18, machine, little);
    header.setUint32(20, 1, little);
    header.setUint32(48, little ? 2 : 0, little);
    header.setUint16(52, 64, little);
    const data = { platforms: [{ binaryDigest: digest(binary) }] };
    const input = join(directory, "package");
    mkdirSync(input);
    writeFileSync(join(input, `ziwei-native.${suffix}.node`), binary);
    const output = join(directory, "sealed");
    const audit = {
      target,
      verification: "static",
      ...data.platforms[0]!.binaryDigest,
      elf: {
        bits: 64,
        endian: little ? "little" : "big",
        machine: little ? 21 : 22,
        flags: little ? 2 : 0,
      },
    };
    writeFileSync(join(input, "audit.json"), JSON.stringify(audit));
    const cli = join(root, "packages/ziwei/tools/candidate.ts");
    const options = {
      env: {
        ...process.env,
        GITHUB_SHA: batch.commit,
        GITHUB_RUN_ID: batch.runId,
        GITHUB_RUN_ATTEMPT: batch.runAttempt,
      },
      stdio: "pipe" as const,
      timeout: 30_000,
    };
    const run = (destination: string) =>
      execFileSync(
        process.execPath,
        [cli, "--mode", "pack", "--target", target, "--input", input, "--output", destination],
        options,
      );
    const before = readFileSync(join(root, "packages/ziwei/package.json"));
    run(output);
    const sealed = readCandidate(output, target, batch);
    assert.deepEqual(sealed.platforms[0]!.binaryDigest, data.platforms[0]!.binaryDigest);
    for (const item of [sealed.main, sealed.platforms[0]!]) {
      const manifest = JSON.parse(
        execFileSync("tar", ["-xOzf", "-", "package/package.json"], {
          input: readFileSync(join(output, item.tarball)),
          encoding: "utf8",
        }),
      );
      assert.equal(manifest.private, true);
      assert.equal(manifest.scripts, undefined);
      assert.equal(manifest.version, source.version);
      if (item === sealed.main)
        assert.deepEqual(manifest.optionalDependencies, {
          [sealed.platforms[0]!.name]: source.version,
        });
      else {
        assert.deepEqual(manifest.os, ["linux"]);
        assert.deepEqual(manifest.cpu, [arch]);
        assert.deepEqual(manifest.libc, ["glibc"]);
      }
    }
    assert.deepEqual(readFileSync(join(root, "packages/ziwei/package.json")), before);
    const receiptBytes = readFileSync(join(output, "candidate.json"));
    assert.throws(() => run(output));
    assert.deepEqual(readFileSync(join(output, "candidate.json")), receiptBytes);
    writeFileSync(join(input, "audit.json"), JSON.stringify({ ...audit, sha256: "0".repeat(64) }));
    const rejected = join(directory, "rejected");
    assert.throws(() => run(rejected));
    assert.equal(existsSync(rejected), false);
  });
}

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
    // GitHub enables colored Node assertion diffs; keep that rendering in the regression.
    { ...options, timeout: 90_000, env: { ...process.env, FORCE_COLOR: "1" } },
  );
  assert.match(result, /artifact-contract-ok/);
}, 120_000);

test("npm and pnpm select the platform without overrides and load it in a Worker", () => {
  const result = execFileSync(
    process.execPath,
    [fileURLToPath(new URL("./fixtures/registry-contract.ts", import.meta.url)), "--worker"],
    { ...options, timeout: 180_000 },
  );
  assert.equal(result.match(/registry-consumer-ok/g)?.length, 8);
  assert.match(result, /registry-runtime-success-ok/);
}, 200_000);

test("registry diagnostics survive a failing native import without converting it to success", () => {
  const result = execFileSync(
    process.execPath,
    [fileURLToPath(new URL("./fixtures/registry-contract.ts", import.meta.url)), "--broken-native"],
    { ...options, timeout: 180_000 },
  );
  assert.match(result, /registry-runtime-failure-ok/);
  assert.doesNotMatch(result, /registry-consumer-ok/);
}, 200_000);

test("registry clients ignore the caller workspace configuration, including the version probe", () => {
  const result = execFileSync(
    process.execPath,
    [fileURLToPath(new URL("./fixtures/registry-contract.ts", import.meta.url)), "--hostile-cwd"],
    { ...options, timeout: 180_000 },
  );
  assert.equal(result.match(/registry-consumer-ok/g)?.length, 8);
  assert.match(result, /registry-runtime-success-ok/);
}, 200_000);

test("npm-only registry verification does not require a working pnpm executable", () => {
  const result = execFileSync(
    process.execPath,
    [fileURLToPath(new URL("./fixtures/registry-contract.ts", import.meta.url)), "--npm-only"],
    { ...options, timeout: 180_000 },
  );
  assert.equal(result.match(/registry-consumer-ok npm\//g)?.length, 4);
  assert.doesNotMatch(result, /registry-consumer-ok pnpm\//);
  assert.match(result, /registry-runtime-success-ok/);
}, 200_000);

test.each([
  { scenario: "healthy clients", flags: [], successfulScenarios: 8 },
  { scenario: "pnpm startup failure", flags: ["--pnpm-startup-failure"], successfulScenarios: 4 },
  {
    scenario: "pnpm bootstrap failure",
    flags: ["--pnpm-bootstrap-failure"],
    successfulScenarios: 4,
  },
  { scenario: "both native imports failing", flags: ["--broken-native"], successfulScenarios: 0 },
])(
  "Windows consumer aggregation preserves independent results: $scenario",
  ({ flags, successfulScenarios }) => {
    const result = execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("./fixtures/registry-contract.ts", import.meta.url)),
        "--windows-consumers",
        ...flags,
      ],
      { ...options, timeout: 180_000 },
    );
    assert.equal(result.match(/registry-consumer-ok/g)?.length ?? 0, successfulScenarios);
    assert.match(result, /windows-independent-consumers-ok/);
  },
  200_000,
);

test.each([
  { manager: "npm", broken: false },
  { manager: "pnpm", broken: false },
  { manager: "npm", broken: true },
  { manager: "pnpm", broken: true },
])(
  "Windows selected consumer runs only $manager and propagates native failure ($broken)",
  ({ manager, broken }) => {
    const result = execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("./fixtures/registry-contract.ts", import.meta.url)),
        `--windows-${manager}-only`,
        ...(broken ? ["--broken-native"] : []),
      ],
      { ...options, timeout: 180_000 },
    );
    assert.equal(result.match(/registry-consumer-ok/g)?.length ?? 0, broken ? 0 : 4);
    assert.match(result, /windows-selected-consumer-ok/);
    assert.match(result, broken ? /registry-runtime-failure-ok/ : /registry-runtime-success-ok/);
  },
  200_000,
);

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
