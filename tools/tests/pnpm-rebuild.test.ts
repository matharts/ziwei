import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { test } from "@rstest/core";

import { digest } from "../../packages/ziwei/tools/candidate.ts";
import {
  pnpmBuild,
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
