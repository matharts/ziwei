import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { test, type TestContext } from "@rstest/core";

import { verifyRegistry } from "../../packages/ziwei/test/fixtures/registry-consumer.ts";
import {
  candidateDockerArgs,
  candidateImage,
  candidateRuntimes,
  verifyDownload,
} from "../../packages/ziwei/tools/candidate-runtime.ts";
import {
  candidateTarget,
  candidateTargets,
  digest,
  readCandidate,
  verifyCandidateHost,
  verifyCandidateReceipt,
  type Batch,
  type CandidateReceipt,
  type CandidateTarget,
} from "../../packages/ziwei/tools/candidate.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const source = JSON.parse(readFileSync(join(root, "packages/ziwei/package.json"), "utf8"));
const batch: Batch = { commit: "a".repeat(40), runId: "123", runAttempt: "2" };
const targets = ["powerpc64le-unknown-linux-gnu", "s390x-unknown-linux-gnu"] as const;
const receipt = (target: CandidateTarget): CandidateReceipt => ({
  schemaVersion: 1,
  kind: "node-candidate",
  batch: { ...batch },
  target,
  name: source.name,
  version: source.version,
  main: { tarball: "ziwei.tgz", bytes: 10, sha256: "b".repeat(64) },
  platforms: [
    {
      target,
      name: `${source.name}-${candidateTargets[target].suffix}`,
      tarball: `${target}.tgz`,
      bytes: 20,
      sha256: "c".repeat(64),
      binaryDigest: { bytes: 64, sha256: "d".repeat(64) },
    },
  ],
});
const temporary = (t: TestContext) => {
  const directory = mkdtempSync(join(tmpdir(), "ziwei-candidate-test-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};

// Minimal ABI headers test integrity checks only; these are not executable addons.
function cohort(t: TestContext, target: CandidateTarget) {
  const directory = temporary(t);
  const binary = Buffer.alloc(64);
  const little = target === targets[0];
  binary.set([0x7f, 0x45, 0x4c, 0x46, 2, little ? 1 : 2, 1]);
  const u16 = (n: number, offset: number) =>
    little ? binary.writeUInt16LE(n, offset) : binary.writeUInt16BE(n, offset);
  const u32 = (n: number, offset: number) =>
    little ? binary.writeUInt32LE(n, offset) : binary.writeUInt32BE(n, offset);
  u16(3, 16);
  u16(little ? 21 : 22, 18);
  u32(1, 20);
  u32(little ? 2 : 0, 48);
  u16(64, 52);
  const data = receipt(target);
  const packageDirectory = join(directory, "package");
  mkdirSync(packageDirectory);
  writeFileSync(
    join(packageDirectory, `ziwei-native.${candidateTargets[target].suffix}.node`),
    binary,
  );
  execFileSync(
    "tar",
    ["-czf", join(directory, data.platforms[0]!.tarball), "-C", directory, "package"],
    { stdio: "pipe" },
  );
  writeFileSync(join(directory, "ziwei.tgz"), "main archive digest fixture");
  Object.assign(data.main, digest(readFileSync(join(directory, "ziwei.tgz"))));
  Object.assign(
    data.platforms[0]!,
    digest(readFileSync(join(directory, data.platforms[0]!.tarball))),
  );
  data.platforms[0]!.binaryDigest = digest(binary);
  writeFileSync(join(directory, "candidate.json"), JSON.stringify(data));
  return { directory, data };
}

test("candidate allowlist is separate from the unchanged eight release targets", () => {
  assert.deepEqual(Object.keys(candidateTargets), targets);
  assert.equal(source.napi.targets.length, 8);
  for (const target of targets) {
    assert.equal(candidateTarget(target), target);
    assert.ok(!source.napi.targets.includes(target));
  }
  for (const target of [
    "constructor",
    "__proto__",
    "armv7-unknown-linux-gnueabihf",
    "x86_64-unknown-freebsd",
    ...source.napi.targets,
  ])
    assert.throws(() => candidateTarget(target), /仅允许/);
});

for (const target of targets) {
  test(`candidate receipt rejects mixed provenance and unsafe archive metadata (${target})`, () => {
    assert.deepEqual(verifyCandidateReceipt(receipt(target), target, batch), receipt(target));
    const edits: ((value: CandidateReceipt) => void)[] = [
      (v) => {
        v.batch.commit = "e".repeat(40);
      },
      (v) => {
        v.batch.runId = "124";
      },
      (v) => {
        v.batch.runAttempt = "3";
      },
      (v) => {
        v.target = targets.find((item) => item !== target)!;
      },
      (v) => {
        v.name = "other";
      },
      (v) => {
        v.version = "0.0.0";
      },
      (v) => {
        Object.assign(v, { schemaVersion: 2, kind: "release" });
      },
      (v) => {
        v.platforms.push({ ...v.platforms[0]! });
      },
      (v) => {
        v.platforms = [];
      },
      (v) => {
        v.main.tarball = "../ziwei.tgz";
      },
      (v) => {
        v.platforms[0]!.tarball = "/outside.tgz";
      },
      (v) => {
        v.platforms[0]!.name += "-other";
      },
      (v) => {
        v.platforms[0]!.target = "other";
      },
      (v) => {
        v.main.bytes = 0;
      },
      (v) => {
        v.main.bytes = 1.5;
      },
      (v) => {
        v.main.bytes = 32 * 1024 * 1024 + 1;
      },
      (v) => {
        v.platforms[0]!.sha256 = "invalid";
      },
      (v) => {
        v.platforms[0]!.binaryDigest.bytes = -1;
      },
    ];
    for (const edit of edits) {
      const value = receipt(target);
      edit(value);
      assert.throws(() => verifyCandidateReceipt(value, target, batch));
    }
    for (const fields of [{ commit: "main" }, { runId: "0" }, { runAttempt: "" }]) {
      const invalidBatch = { ...batch, ...fields };
      assert.throws(() =>
        verifyCandidateReceipt({ ...receipt(target), batch: invalidBatch }, target, invalidBatch),
      );
    }
  });

  test(`candidate archives are checked before any runtime operation (${target})`, async (t) => {
    const { directory, data } = cohort(t, target);
    assert.deepEqual(readCandidate(directory, target, batch), data);
    // Renaming a candidate receipt cannot bypass the release cohort's exact target set.
    writeFileSync(join(directory, "batch.json"), JSON.stringify(data));
    await assert.rejects(verifyRegistry(directory));
    const receiptPath = join(directory, "candidate.json");
    const badBinary = structuredClone(data);
    badBinary.platforms[0]!.binaryDigest.sha256 = "0".repeat(64);
    writeFileSync(receiptPath, JSON.stringify(badBinary));
    assert.throws(() => readCandidate(directory, target, batch));
    writeFileSync(receiptPath, JSON.stringify(data));
    assert.throws(() => readCandidate(directory, target, { ...batch, runAttempt: "3" }));
    const mainPath = join(directory, data.main.tarball);
    const original = readFileSync(mainPath);
    writeFileSync(mainPath, Buffer.alloc(original.length));
    assert.throws(() => readCandidate(directory, target, batch));
    writeFileSync(mainPath, Buffer.concat([original, Buffer.from("extra")]));
    assert.throws(() => readCandidate(directory, target, batch));
    // A symlink may not redirect a supposedly immutable archive to another input.
    rmSync(mainPath);
    writeFileSync(join(directory, "elsewhere"), original);
    symlinkSync(join(directory, "elsewhere"), mainPath);
    assert.throws(() => readCandidate(directory, target, batch));
  });

  test(`candidate sealing reuses audited bytes and never widens release metadata (${target})`, (t) => {
    const { directory, data } = cohort(t, target);
    const input = join(directory, "package");
    const output = join(directory, "sealed");
    const audit = {
      target,
      verification: "static",
      ...data.platforms[0]!.binaryDigest,
      elf: {
        bits: 64,
        endian: target === targets[0] ? "little" : "big",
        machine: target === targets[0] ? 21 : 22,
        flags: target === targets[0] ? 2 : 0,
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
        assert.deepEqual(manifest.cpu, [candidateTargets[target].arch]);
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

  test(`candidate host gate checks actual CPU, endian, Node and libc (${target})`, () => {
    const observed = {
      platform: "linux",
      arch: candidateTargets[target].arch,
      endian: candidateTargets[target].endian,
      node: "v24.15.0",
      glibc: "2.36",
    };
    for (const version of ["24.15.0", "24.21.0"])
      verifyCandidateHost({ ...observed, node: `v${version}` }, target, version);
    for (const fields of [
      { platform: "darwin" },
      { arch: "x64" },
      { endian: observed.endian === "LE" ? "BE" : "LE" },
      { node: "v24.21.0" },
      { glibc: undefined },
      { glibc: "2.27" },
      { glibc: "2.36.1" },
    ])
      assert.throws(() => verifyCandidateHost({ ...observed, ...fields }, target, "24.15.0"));
    assert.throws(() => verifyCandidateHost(observed, target, "24.14.0"));
  });

  test(`candidate container pins its runtime and isolates the real consumer (${target})`, () => {
    const input = {
      name: "owned-container",
      target,
      nodeVersion: "24.15.0",
      harness: "/test/harness",
      cohort: "/test/cohort",
      runtime: "/test/runtime",
      output: "/test/output",
      batch,
    };
    const args = candidateDockerArgs(input);
    assert.match(candidateImage, /^node@sha256:[a-f0-9]{64}$/);
    assert.ok(args.includes(candidateImage));
    for (const pair of [
      ["--network", "none"],
      ["--cap-drop", "ALL"],
      ["--security-opt", "no-new-privileges"],
      ["--platform", `linux/${candidateTargets[target].dockerArch}`],
      ["--entrypoint", "/runtime/node/bin/node"],
    ])
      assert.equal(args[args.indexOf(pair[0]!) + 1], pair[1]);
    assert.ok(args.includes("--read-only"));
    const mounts = args.filter((_, i) => args[i - 1] === "--mount");
    assert.equal(mounts.length, 4);
    assert.equal(mounts.filter((m) => m.endsWith(",readonly")).length, 3);
    assert.ok(args.includes(`GITHUB_SHA=${batch.commit}`));
    assert.ok(args.includes(`GITHUB_RUN_ID=${batch.runId}`));
    assert.ok(args.includes(`GITHUB_RUN_ATTEMPT=${batch.runAttempt}`));
    assert.ok(args.includes("ZIWEI_PNPM_BIN=/runtime/pnpm"));
    assert.ok(args.includes("ZIWEI_NPM_CLI=/runtime/node/lib/node_modules/npm/bin/npm-cli.js"));
    assert.equal(args.at(-1), "24.15.0");
    assert.throws(() => candidateDockerArgs({ ...input, cohort: "/input,unexpected" }));
  });
}

test("candidate download receipts verify bytes with pinned SHA-256 and SHA-512", () => {
  const data = Buffer.from("fixed archive");
  for (const algorithm of ["sha256", "sha512"] as const) {
    const hash = createHash(algorithm)
      .update(data)
      .digest(algorithm === "sha256" ? "hex" : "base64");
    assert.deepEqual(verifyDownload(data, hash, algorithm), digest(data));
    assert.throws(() => verifyDownload(Buffer.from("other archive"), hash, algorithm), /固定摘要/);
  }
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(
    manifest.devEngines.packageManager.version,
    "12.4.1",
    "refresh pinned candidate clients after a pnpm upgrade",
  );
  const minimum = manifest.devEngines.runtime.version.match(/24\.\d+\.\d+/)?.[0];
  const mise = readFileSync(join(root, "mise.toml"), "utf8");
  const development = mise.match(/^node = "(.*?)"/m)?.[1];
  for (const runtime of Object.values(candidateRuntimes)) {
    assert.deepEqual(Object.keys(runtime.node), [minimum, development]);
    for (const hash of Object.values(runtime.node)) assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(Buffer.from(runtime.pnpmIntegrity, "base64").length, 64);
  }
});

test("candidate consumer fails closed and will not overwrite an existing result", (t) => {
  const directory = temporary(t);
  const output = join(directory, "consumer.json");
  const args = [
    join(root, "packages/ziwei/tools/candidate.ts"),
    "--mode",
    "consume",
    "--target",
    targets[0],
    "--input",
    directory,
    "--output",
    output,
    "--node",
    "24.0.0",
  ];
  const env = {
    ...process.env,
    GITHUB_SHA: batch.commit,
    GITHUB_RUN_ID: batch.runId,
    GITHUB_RUN_ATTEMPT: batch.runAttempt,
  };
  assert.throws(() =>
    execFileSync(process.execPath, args, { env, stdio: "pipe", timeout: 10_000 }),
  );
  assert.ok(existsSync(output));
  const bytes = readFileSync(output);
  const result = JSON.parse(bytes.toString());
  assert.equal(result.passed, false);
  assert.equal(result.verification, "emulated");
  assert.deepEqual(result.batch, batch);
  assert.ok(result.error);
  assert.throws(() =>
    execFileSync(process.execPath, args, { env, stdio: "pipe", timeout: 10_000 }),
  );
  assert.deepEqual(readFileSync(output), bytes);
});

test("candidate CI consumes sealed same-run inputs and requires both emulated targets", () => {
  const workflow = readFileSync(join(root, ".github/workflows/native-candidates.yml"), "utf8");
  const runtime = workflow.split("  gnu-runtime:")[1]!.split("  verify:")[0]!;
  for (const target of targets) assert.ok(runtime.includes(`- ${target}`));
  assert.ok(!runtime.includes("armv7"));
  assert.match(workflow, /needs: \[core-check, gnu-addon, gnu-runtime\]/);
  assert.match(workflow, /test "\$RUNTIME_RESULT" = success/);
  assert.equal(
    workflow.split(
      "name: native-candidate-input-${{ github.sha }}-${{ github.run_attempt }}-${{ matrix.target }}",
    ).length - 1,
    2,
  );
  assert.match(runtime, /docker\/setup-qemu-action@[a-f0-9]{40}/);
  assert.match(runtime, /image: tonistiigi\/binfmt@sha256:[a-f0-9]{64}/);
  assert.match(runtime, /mise run check:node:candidate/);
  assert.match(runtime, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.doesNotMatch(runtime, /continue-on-error|build:node|cargo build/);
});
