import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test } from "@rstest/core";

import {
  readCandidatePnpm,
  runCandidateExperiment,
} from "../../packages/ziwei/tools/candidate-runtime.ts";
import { digest } from "../../packages/ziwei/tools/candidate.ts";
import {
  readVerifiedPnpmBuild,
  verifiedPnpmBuild,
} from "../../packages/ziwei/tools/diagnostics/pnpm-rebuild.ts";
import { runPnpmRepro } from "../../packages/ziwei/tools/diagnostics/pnpm-repro.ts";
import {
  pnpmBuild,
  pnpmBuildRecipe,
  verifyPnpmRebuild,
} from "../../packages/ziwei/tools/pnpm-rebuild.ts";
import { readWorkflow, requireSuccess, script, step } from "./workflow.ts";

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
      kind: "pnpm-source-build",
      completed: true,
      runtimeVerified: false,
      batch,
      sourceCommit: pnpmBuild.sourceCommit,
      version: pnpmBuild.version,
      rust: pnpmBuild.rust,
      target: pnpmBuild.target,
      builderImage: pnpmBuild.builderImage,
      lockfile: pnpmBuild.lockfile,
      recipe: pnpmBuildRecipe(),
      cleanup: "removed-or-not-created",
      builder: { passed: true },
      compile: { passed: true },
      binary: digest(binary),
    },
  };
}

test("source-built pnpm is same-batch and bound to the pinned recipe and exact bytes", () => {
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
    { lockfile: { bytes: 100, sha256: "b".repeat(64) } },
    { kind: "pnpm-rebuild-experiment" },
    { recipe: { ...receipt.recipe, script: { bytes: 1, sha256: "f".repeat(64) } } },
    { recipe: { ...receipt.recipe, dockerfile: { bytes: 1, sha256: "f".repeat(64) } } },
    { cleanup: "pending" },
    { builder: { passed: false } },
    { compile: { passed: false } },
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

test("manual diagnostics keep the official failing baseline independent of daily acceptance", () => {
  const workflow = readWorkflow("pnpm-repro");
  const reproduce = workflow.jobs.reproduce!;
  assert.match(step(reproduce, "rebuild-source").if!, /inputs.comparison == 'rebuild'/);
  assert.match(script(step(reproduce, "rebuilt-probe")), /pnpm-rebuild-results\/build.json/);
  assert.match(step(reproduce, "rebuilt-probe").if!, /steps.rebuild.outcome == 'success'/);
  for (const job of Object.values(workflow.jobs)) requireSuccess(job);
  assert.equal(step(reproduce, "rebuild-source").with?.ref, pnpmBuild.sourceCommit);
  assert.match(readFileSync("mise.toml", "utf8"), /node packages\/ziwei\/tools\/pnpm-rebuild.ts/);
});

test("consumer pins the previously verified tool independently of the new Ziwei cohort", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "pnpm-verified-test-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const { binary, receipt } = fixture();
  writeFileSync(join(directory, "pnpm"), binary);
  writeFileSync(
    join(directory, "build.json"),
    JSON.stringify({ ...receipt, kind: "pnpm-rebuild-experiment", batch: verifiedPnpmBuild.batch }),
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

  const consumer = readWorkflow("pnpm-repro").jobs["consume-rebuilt"]!;
  assert.equal(consumer.if, "inputs.comparison == 'consumer'");
  const download = step(consumer, "verified-pnpm");
  assert.equal(String(download.with?.["run-id"]), String(verifiedPnpmBuild.batch.runId));
  assert.equal(String(download.with?.["artifact-ids"]), "10323128266");
  assert.match(script(step(consumer, "consumer")), /--mode consume/);
  assert.match(script(consumer), /mise run pack:node:candidate/);
  requireSuccess(consumer);
  for (const env of [consumer.env, ...consumer.steps.map((item) => item.env)]) {
    for (const key of ["GITHUB_SHA", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"])
      assert.equal(env?.[key], undefined);
  }
  const controller = readFileSync("packages/ziwei/tools/candidate-runtime.ts", "utf8");
  const cli = controller.split("if (import.meta.main)")[1]!;
  assert.match(cli, /readCandidatePnpm/);
  assert.doesNotMatch(cli, /verifiedPnpmBuild|experimentalPnpm/);
});

test("daily ppc64le consumers require the current build and reject historical receipts", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "pnpm-current-test-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const { binary, receipt } = fixture();
  const path = join(directory, "build.json");
  writeFileSync(join(directory, "pnpm"), binary);
  writeFileSync(path, JSON.stringify(receipt));
  assert.deepEqual(readCandidatePnpm(pnpmBuild.target, path, batch), { binary, receipt });
  assert.equal(readCandidatePnpm("s390x-unknown-linux-gnu", undefined, batch), undefined);
  assert.throws(() => readCandidatePnpm(pnpmBuild.target, undefined, batch), /需要 --pnpm-build/);
  assert.throws(() => readCandidatePnpm("s390x-unknown-linux-gnu", path, batch), /必须使用官方/);
  for (const changes of [
    { batch: { ...batch, runId: "124" } },
    { batch: { ...batch, runAttempt: "2" } },
    { batch: { ...batch, commit: "c".repeat(40) } },
    { kind: "pnpm-rebuild-experiment" },
    { completed: false },
  ]) {
    writeFileSync(path, JSON.stringify({ ...receipt, ...changes }));
    assert.throws(() => readCandidatePnpm(pnpmBuild.target, path, batch));
  }
  writeFileSync(path, JSON.stringify(receipt));
  writeFileSync(join(directory, "pnpm"), Buffer.alloc(64));
  assert.throws(() => readCandidatePnpm(pnpmBuild.target, path, batch));
  const link = join(directory, "linked.json");
  symlinkSync(path, link);
  assert.throws(() => readCandidatePnpm(pnpmBuild.target, link, batch));
  assert.equal(existsSync(join(directory, "experiment.json")), false);
});

test("daily CI builds and consumes its own pinned client without expiring experiment inputs", () => {
  const workflow = readWorkflow("native-candidates");
  const build = workflow.jobs["pnpm-client"]!;
  const runtime = workflow.jobs["gnu-runtime"]!;
  assert.equal(step(build, "pnpm-source").with?.repository, "pnpm/pnpm");
  assert.equal(step(build, "pnpm-source").with?.ref, pnpmBuild.sourceCommit);
  assert.match(script(build), /mise run build:pnpm:ppc64le/);
  assert.equal(build.needs, undefined);
  assert.ok(build.steps.every((item) => !/actions\/cache|download-artifact/.test(item.uses ?? "")));
  assert.deepEqual(runtime.needs, ["gnu-addon", "pnpm-client"]);
  assert.equal(runtime.if, "${{ !cancelled() && needs.gnu-addon.result == 'success' }}");
  assert.equal(
    step(runtime, "pnpm-download").if,
    "matrix.target == 'powerpc64le-unknown-linux-gnu'",
  );
  assert.match(script(runtime), /--pnpm-build target\/pnpm-client\/build.json/);
  assert.equal(
    Object.values(workflow.jobs)
      .flatMap((job) => job.steps)
      .filter(
        (item) => item.with?.name === "candidate-pnpm-${{ github.sha }}-${{ github.run_attempt }}",
      ).length,
    2,
  );
  assert.match(script(workflow.jobs.verify!), /test "\$PNPM_RESULT" = success/);
  for (const job of Object.values(workflow.jobs)) {
    requireSuccess(job);
    assert.doesNotMatch(script(job), /diagnose:pnpm/);
    for (const item of job.steps) {
      assert.equal(item.with?.["run-id"], undefined);
      assert.equal(item.with?.["artifact-ids"], undefined);
    }
  }
});

test("daily CLI rejects absent or disallowed clients before output creation or Docker", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "pnpm-cli-test-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  for (const [target, extra, message] of [
    [pnpmBuild.target, [], /需要 --pnpm-build/],
    ["s390x-unknown-linux-gnu", ["--pnpm-build", "missing.json"], /必须使用官方/],
  ] as const) {
    const output = join(directory, target);
    const result = spawnSync(
      process.execPath,
      [
        "packages/ziwei/tools/candidate-runtime.ts",
        "--target",
        target,
        "--input",
        "missing-cohort",
        "--output",
        output,
        ...extra,
      ],
      {
        encoding: "utf8",
        timeout: 10_000,
        env: {
          ...process.env,
          GITHUB_SHA: batch.commit,
          GITHUB_RUN_ID: batch.runId,
          GITHUB_RUN_ATTEMPT: batch.runAttempt,
        },
      },
    );
    assert.equal(result.status, 1);
    assert.equal(result.signal, null);
    assert.match(result.stderr, message);
    assert.equal(existsSync(output), false);
  }
});
