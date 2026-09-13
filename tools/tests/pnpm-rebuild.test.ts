import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test } from "@rstest/core";

import { runCandidateExperiment } from "../../packages/ziwei/tools/candidate-runtime.ts";
import { digest } from "../../packages/ziwei/tools/candidate.ts";
import {
  pnpmBuild,
  readVerifiedPnpmBuild,
  verifiedPnpmBuild,
  verifyPnpmRebuild,
} from "../../packages/ziwei/tools/diagnostics/pnpm-rebuild.ts";
import { runPnpmRepro } from "../../packages/ziwei/tools/diagnostics/pnpm-repro.ts";

const batch = { commit: "a".repeat(40), runId: "123", runAttempt: "1" };
function fixture() {
  // Structural fixture only; real execution is covered by the Linux CI probes.
  const binary = Buffer.alloc(64);
  binary.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
  binary.writeUInt16LE(3, 16);
  binary.writeUInt16LE(21, 18);
  return {
    binary,
    receipt: {
      kind: "pnpm-rebuild-experiment",
      completed: true,
      runtimeVerified: false,
      batch,
      sourceCommit: pnpmBuild.sourceCommit,
      version: pnpmBuild.version,
      rust: pnpmBuild.rust,
      target: pnpmBuild.target,
      builderImage: pnpmBuild.builderImage,
      lockfile: { bytes: 100, sha256: "b".repeat(64) },
      binary: digest(binary),
    },
  };
}

test("rebuilt pnpm is explicitly experimental, same-batch and bound to exact bytes", () => {
  const { binary, receipt } = fixture();
  verifyPnpmRebuild(receipt, binary, batch);
  for (const changes of [
    { kind: "official" },
    { completed: false },
    { sourceCommit: "0".repeat(40) },
    { version: "12.4.0" },
    { rust: "stable" },
    { target: "s390x-unknown-linux-gnu" },
    { builderImage: "rust:latest" },
    { batch: { ...batch, runAttempt: "2" } },
    { lockfile: null },
  ])
    assert.throws(() => verifyPnpmRebuild({ ...receipt, ...changes }, binary, batch));
  const changed = Buffer.from(binary);
  changed[63] = 1;
  assert.throws(() => verifyPnpmRebuild(receipt, changed, batch));
  for (const [offset, byte] of [
    [4, 1],
    [5, 2],
    [18, 22],
  ] as const) {
    const wrongTarget = Buffer.from(binary);
    wrongTarget[offset] = byte;
    assert.throws(() =>
      verifyPnpmRebuild({ ...receipt, binary: digest(wrongTarget) }, wrongTarget, batch),
    );
  }
  assert.throws(() => verifyPnpmRebuild(receipt, binary.subarray(0, 20), batch));
});

test("rebuilt startup rejects mixed variables before reading artifacts or starting Docker", async () => {
  for (const [qemu, pnpm, image, debug] of [
    [undefined, "baseline", "baseline", false],
    ["comparison", "baseline", "baseline", false],
    ["baseline", "comparison", "baseline", false],
    ["baseline", "baseline", "comparison", false],
    ["baseline", "baseline", "baseline", true],
  ] as const) {
    await assert.rejects(
      runPnpmRepro("unused", qemu, pnpm, image, debug, "missing/build.json"),
      /重建对照必须固定/,
    );
  }
});

test("rebuild is opt-in and cannot hide the baseline or replace the candidate gate", () => {
  const workflow = readFileSync(".github/workflows/pnpm-repro.yml", "utf8");
  assert.match(workflow, /inputs.comparison == 'rebuild'/);
  assert.match(workflow, /pnpm-rebuild-results\/build.json/);
  assert.match(workflow, /steps.rebuild.outcome == 'success'/);
  assert.doesNotMatch(workflow, /continue-on-error/);
  assert.match(workflow, new RegExp(`ref: ${pnpmBuild.sourceCommit}`));
  assert.doesNotMatch(readFileSync(".github/workflows/native-candidates.yml", "utf8"), /rebuilt/);
});

test("consumer pins the previously verified tool independently of the new Ziwei cohort", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "pnpm-verified-test-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const { binary, receipt } = fixture();
  writeFileSync(join(directory, "pnpm"), binary);
  writeFileSync(
    join(directory, "build.json"),
    JSON.stringify({ ...receipt, batch: verifiedPnpmBuild.batch }),
  );
  // Self-consistent receipt + bytes must not bypass the separately pinned actual CI digest.
  assert.throws(() => readVerifiedPnpmBuild(join(directory, "build.json")), /固定摘要/);
  await assert.rejects(
    runCandidateExperiment("s390x-unknown-linux-gnu", "unused", "unused", { binary, receipt }),
    /仅用于 ppc64le/,
  );
  await assert.rejects(
    runCandidateExperiment("powerpc64le-unknown-linux-gnu", "unused", "unused", {
      binary,
      receipt: { ...receipt, completed: false },
    }),
  );

  const workflow = readFileSync(".github/workflows/pnpm-repro.yml", "utf8");
  const consumer = workflow.split("  consume-rebuilt:\n")[1]!;
  assert.match(consumer, /if: inputs.comparison == 'consumer'/);
  assert.ok(consumer.includes(`run-id: ${verifiedPnpmBuild.batch.runId}`));
  assert.match(consumer, /artifact-ids: 10323128266/);
  assert.match(consumer, /--mode consume/);
  assert.match(consumer, /mise run pack:node:candidate/);
  assert.doesNotMatch(consumer, /continue-on-error|GITHUB_SHA:|GITHUB_RUN_ID:|GITHUB_RUN_ATTEMPT:/);
  const controller = readFileSync("packages/ziwei/tools/candidate-runtime.ts", "utf8");
  const cli = controller.split("if (import.meta.main)")[1]!;
  assert.doesNotMatch(cli, /experimentalPnpm|rebuilt/);
});
