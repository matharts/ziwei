import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { endianness, release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  consumeRegistry,
  readRegistryPackages,
  type RegistryPackages,
  type RuntimeObservation,
} from "../test/fixtures/registry-consumer.ts";
import { inspectGnuBinary } from "./compatibility.ts";

export const candidateTargets = {
  "powerpc64le-unknown-linux-gnu": {
    arch: "ppc64",
    dockerArch: "ppc64le",
    endian: "LE",
    suffix: "linux-ppc64-gnu",
  },
  "s390x-unknown-linux-gnu": {
    arch: "s390x",
    dockerArch: "s390x",
    endian: "BE",
    suffix: "linux-s390x-gnu",
  },
} as const;
export type CandidateTarget = keyof typeof candidateTargets;
export type Batch = { commit: string; runId: string; runAttempt: string };
const root = fileURLToPath(new URL("../../..", import.meta.url));
const packageRoot = join(root, "packages/ziwei");
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
export const digest = (bytes: Buffer) => ({
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
});
const save = (path: string, value: unknown) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");

export function candidateTarget(value: string): CandidateTarget {
  assert.ok(Object.hasOwn(candidateTargets, value), "仅允许 ppc64le 与 s390x 候选");
  return value as CandidateTarget;
}

export function currentBatch(): Batch {
  const batch = {
    commit: process.env.GITHUB_SHA ?? "",
    runId: process.env.GITHUB_RUN_ID ?? "",
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "",
  };
  verifyBatch(batch);
  return batch;
}

function verifyBatch(batch: Batch) {
  assert.match(batch.commit, /^[a-f0-9]{40}$/);
  assert.match(batch.runId, /^[1-9]\d*$/);
  assert.match(batch.runAttempt, /^[1-9]\d*$/);
}

/** Private experiment receipt. It is deliberately not a release batch.json. */
export type CandidateReceipt = RegistryPackages & {
  schemaVersion: 1;
  kind: "node-candidate";
  batch: Batch;
  target: CandidateTarget;
  name: string;
  version: string;
};

export function verifyCandidateReceipt(
  value: CandidateReceipt,
  target: CandidateTarget,
  batch: Batch,
) {
  candidateTarget(target);
  verifyBatch(batch);
  const source = json(join(packageRoot, "package.json"));
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.kind, "node-candidate");
  assert.deepEqual(value.batch, batch, "候选工件混用了提交、run 或 attempt");
  assert.equal(value.target, target);
  assert.equal(value.name, source.name);
  assert.equal(value.version, source.version);
  assert.equal(value.main.tarball, "ziwei.tgz");
  assert.equal(value.platforms.length, 1, "候选工件只能包含一个目标");
  const platform = value.platforms[0]!;
  assert.equal(platform.target, target);
  assert.equal(platform.name, `${source.name}-${candidateTargets[target].suffix}`);
  assert.equal(platform.tarball, `${target}.tgz`);
  for (const item of [value.main, platform, platform.binaryDigest]) {
    assert.ok(Number.isSafeInteger(item.bytes) && item.bytes > 0 && item.bytes <= 32 * 1024 * 1024);
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
  }
  return value;
}

export function readCandidate(directory: string, target: CandidateTarget, batch: Batch) {
  const stat = lstatSync(join(directory, "candidate.json"));
  assert.ok(stat.isFile() && stat.size <= 1024 * 1024);
  const receipt = verifyCandidateReceipt(json(join(directory, "candidate.json")), target, batch);
  verifyCandidateArchives(directory, receipt);
  return receipt;
}

function verifyCandidateArchives(directory: string, receipt: CandidateReceipt) {
  const target = receipt.target;
  for (const entry of [receipt.main, ...receipt.platforms]) {
    const path = join(directory, entry.tarball);
    const stat = lstatSync(path);
    assert.ok(stat.isFile());
    assert.equal(stat.size, entry.bytes);
    assert.deepEqual(digest(readFileSync(path)), { bytes: entry.bytes, sha256: entry.sha256 });
  }
  const platform = receipt.platforms[0]!;
  const binary = execFileSync(
    "tar",
    ["-xOzf", "-", `package/ziwei-native.${candidateTargets[target].suffix}.node`],
    {
      input: readFileSync(join(directory, platform.tarball)),
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  assert.deepEqual(digest(binary), platform.binaryDigest);
  inspectGnuBinary(binary, target);
}

export async function packCandidate(
  input: string,
  output: string,
  target: CandidateTarget,
  batch: Batch,
) {
  candidateTarget(target);
  verifyBatch(batch);
  const binaryName = `ziwei-native.${candidateTargets[target].suffix}.node`;
  const binaryPath = join(input, binaryName);
  const stat = lstatSync(binaryPath);
  assert.ok(stat.isFile() && stat.size > 0 && stat.size <= 16 * 1024 * 1024);
  const binary = readFileSync(binaryPath);
  const audit = json(join(input, "audit.json"));
  assert.equal(audit.target, target);
  assert.equal(audit.verification, "static");
  assert.deepEqual(digest(binary), { bytes: audit.bytes, sha256: audit.sha256 });
  assert.deepEqual(inspectGnuBinary(binary, target), audit.elf);
  // Reuse packaging without broadening the real package's target allowlist.
  const { distributionFiles, packDistribution } = await import("./pack.ts");
  const temporary = mkdtempSync(join(tmpdir(), "ziwei-candidate-stage-"));
  try {
    const fixture = join(temporary, "packages/ziwei");
    mkdirSync(join(fixture, "native"), { recursive: true });
    mkdirSync(join(fixture, "dist"));
    const source = json(join(packageRoot, "package.json"));
    save(join(fixture, "package.json"), {
      ...source,
      private: true,
      napi: { ...source.napi, targets: [target] },
    });
    cpSync(join(packageRoot, "src"), join(fixture, "src"), { recursive: true });
    for (const file of distributionFiles(packageRoot).filter((file) => file !== "LICENSE")) {
      copyFileSync(join(packageRoot, file), join(fixture, file));
    }
    copyFileSync(join(root, "LICENSE"), join(temporary, "LICENSE"));
    copyFileSync(binaryPath, join(fixture, "native", binaryName));
    const packed = await packDistribution(fixture, temporary, [target]);
    const platform = packed.packages[0]!;
    const receipt: CandidateReceipt = {
      schemaVersion: 1,
      kind: "node-candidate",
      batch,
      target,
      name: source.name,
      version: source.version,
      main: { tarball: "ziwei.tgz", ...digest(readFileSync(packed.mainTarball)) },
      platforms: [
        {
          target,
          name: platform.name,
          tarball: `${target}.tgz`,
          ...digest(readFileSync(platform.tarball)),
          binaryDigest: digest(binary),
        },
      ],
    };
    verifyCandidateReceipt(receipt, target, batch);
    mkdirSync(dirname(output), { recursive: true });
    mkdirSync(output); // Never overwrite an earlier candidate receipt.
    copyFileSync(packed.mainTarball, join(output, receipt.main.tarball));
    copyFileSync(platform.tarball, join(output, receipt.platforms[0]!.tarball));
    verifyCandidateArchives(output, receipt);
    save(join(output, "candidate.json"), receipt); // Written last, only after both archives pass validation.
    return receipt;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function verifyCandidateHost(
  observed: { platform: string; arch: string; endian: string; node: string; glibc?: string },
  target: CandidateTarget,
  nodeVersion: string,
) {
  const expected = candidateTargets[candidateTarget(target)];
  assert.ok(["24.15.0", "24.21.0"].includes(nodeVersion));
  assert.equal(observed.platform, "linux");
  assert.equal(observed.arch, expected.arch);
  assert.equal(observed.endian, expected.endian);
  assert.equal(observed.node, `v${nodeVersion}`);
  assert.match(observed.glibc ?? "", /^\d+\.\d+$/);
  const [major, minor] = observed.glibc!.split(".").map(Number);
  assert.ok(major! > 2 || (major === 2 && minor! >= 28), "Node 需要 glibc >= 2.28");
}

export async function consumeCandidate(
  directory: string,
  target: CandidateTarget,
  nodeVersion: string,
  output: string,
) {
  const batch = currentBatch();
  const runtimes: RuntimeObservation[] = [];
  const clients: Record<string, unknown>[] = [];
  const report: Record<string, unknown> = {
    verification: "emulated",
    passed: false,
    batch,
    target,
    nodeVersion,
    runtimes,
    clients,
  };
  // The caller supplies a new result path; failed attempts cannot reuse success evidence.
  writeFileSync(output, JSON.stringify(report), { flag: "wx" });
  try {
    const header = (process.report.getReport() as { header: { glibcVersionRuntime?: string } })
      .header;
    const host = {
      platform: process.platform,
      arch: process.arch,
      endian: endianness(),
      node: process.version,
      glibc: header.glibcVersionRuntime,
      kernel: release(),
    };
    report.host = host;
    verifyCandidateHost(host, target, nodeVersion);
    const receipt = readCandidate(directory, target, batch);
    report.receipt = digest(readFileSync(join(directory, "candidate.json")));
    const packages = readRegistryPackages(directory, receipt, receipt);
    assert.deepEqual(packages.matching.manifest.os, ["linux"]);
    assert.deepEqual(packages.matching.manifest.cpu, [candidateTargets[target].arch]);
    assert.deepEqual(packages.matching.manifest.libc, ["glibc"]);
    const failures: unknown[] = [];
    for (const manager of ["npm", "pnpm"] as const) {
      const client: Record<string, unknown> = { manager, passed: false };
      clients.push(client);
      save(output, report);
      try {
        await consumeRegistry(packages, {
          managers: [manager],
          testWorker: true,
          commandTimeoutMs: 180_000,
          onRuntime: (runtime) => {
            runtimes.push(runtime);
            save(output, report);
          },
        });
        client.passed = true;
      } catch (error) {
        client.error = error instanceof Error ? error.message : String(error);
        failures.push(error);
      } finally {
        save(output, report);
      }
    }
    if (failures.length) throw new AggregateError(failures, "候选包管理器消费验证失败");
    assert.deepEqual(
      runtimes.map((runtime) => runtime.manager),
      ["npm", "pnpm"],
    );
    report.passed = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    save(output, report);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      mode: { type: "string" },
      target: { type: "string" },
      input: { type: "string" },
      output: { type: "string" },
      node: { type: "string" },
    },
  });
  assert.ok(values.input && values.output && values.target);
  const target = candidateTarget(values.target);
  if (values.mode === "pack")
    await packCandidate(resolve(values.input), resolve(values.output), target, currentBatch());
  else {
    assert.equal(values.mode, "consume");
    assert.ok(values.node);
    await consumeCandidate(resolve(values.input), target, values.node, resolve(values.output));
  }
}
