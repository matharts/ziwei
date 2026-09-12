import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { test } from "@rstest/core";

import { candidateImage } from "../../packages/ziwei/tools/candidate-runtime.ts";
import {
  classifyPnpmProbe,
  pnpmReproArgs,
  qemuComparisons,
  qemuComparison,
  verifyQemuVersion,
} from "../../packages/ziwei/tools/pnpm-repro.ts";

test("pnpm reproduction mounts only the binary and changes only tracing", () => {
  const plain = pnpmReproArgs("owned-test", "/tmp/pnpm", false);
  const traced = pnpmReproArgs("owned-test", "/tmp/pnpm", true);
  assert.equal(plain.filter((arg) => arg === "--mount").length, 1);
  assert.ok(plain.includes("type=bind,src=/tmp/pnpm,dst=/runtime/pnpm,readonly"));
  assert.deepEqual(plain.slice(-2), [candidateImage, "--version"]);
  assert.ok(!plain.includes("--rm")); // Explicit cleanup retains the stopped container until collected.
  const traceIndex = traced.indexOf("QEMU_STRACE=1");
  traced.splice(traceIndex - 1, 2);
  assert.deepEqual(traced, plain);
  assert.throws(() => pnpmReproArgs("owned-test", "/tmp/a,b", false), /逗号/);
});

test("pnpm reproduction separates correct output, crashes, kills and infrastructure failures", () => {
  const healthy = { code: 0, signal: null, stdout: "12.4.1\n", stderr: "" };
  assert.equal(classifyPnpmProbe(healthy), "passed");
  assert.equal(classifyPnpmProbe({ ...healthy, stdout: "12.4.0" }), "failed");
  assert.equal(classifyPnpmProbe({ ...healthy, code: 125 }), "failed");
  assert.equal(
    classifyPnpmProbe({ ...healthy, code: null, signal: "SIGKILL" }),
    "deadline-or-kill",
  );
  assert.equal(
    classifyPnpmProbe({
      ...healthy,
      code: null,
      signal: "SIGKILL",
      stderr: "qemu: uncaught target signal 11 (Segmentation fault) - core dumped",
    }),
    "qemu-sigsegv",
  );
  assert.equal(classifyPnpmProbe({ ...healthy, code: "ENOENT", stdout: "" }), "failed");
});

test("pnpm diagnostic workflow is manual, bounded and independent of candidate builds", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/pnpm-repro.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /on:\n  workflow_dispatch:/);
  assert.doesNotMatch(
    workflow,
    /push:|pull_request:|continue-on-error|needs:|download-artifact|pnpm install|build:node/,
  );
  assert.match(workflow, /timeout-minutes: 10/);
  assert.match(workflow, /mise run diagnose:pnpm -- --output pnpm-repro-results/);
  assert.match(workflow, /if: \$\{\{ !cancelled\(\) \}\}/);
});

test("QEMU comparisons reject unknown groups and mismatched runtime versions", () => {
  assert.equal(qemuComparison("baseline"), qemuComparisons.baseline);
  assert.equal(qemuComparison("comparison"), qemuComparisons.comparison);
  assert.throws(() => qemuComparison("latest"), /未知/);
  verifyQemuVersion("qemu-ppc64le version 10.2.3 (v10.2.3)\n", "10.2.3");
  assert.throws(() => verifyQemuVersion("qemu-ppc64le version 10.2.1\n", "10.2.3"), /实际版本/);
  assert.throws(() => verifyQemuVersion("binfmt version 10.2.3", "10.2.3"), /实际版本/);
});

test("QEMU comparison uses one runner, exact pins and failure-independent ordered steps", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/pnpm-repro.yml", import.meta.url),
    "utf8",
  );
  assert.equal(workflow.match(/runs-on:/g)?.length, 1);
  for (const [group, config] of Object.entries(qemuComparisons)) {
    assert.match(config.image, /^tonistiigi\/binfmt@sha256:[a-f0-9]{64}$/);
    assert.ok(workflow.includes(`image: ${config.image}`));
    assert.ok(workflow.includes(`--output pnpm-repro-results-${group} --qemu ${group}`));
  }
  assert.notEqual(qemuComparisons.baseline.image, qemuComparisons.comparison.image);
  assert.ok(workflow.indexOf("--qemu baseline") < workflow.indexOf("--uninstall qemu-ppc64le"));
  assert.ok(workflow.indexOf("--uninstall qemu-ppc64le") < workflow.indexOf("id: comparison-qemu"));
  assert.match(workflow, /test ! -e \/proc\/sys\/fs\/binfmt_misc\/qemu-ppc64le/);
  for (const step of ["baseline-qemu", "reset-qemu", "comparison-qemu"]) {
    assert.ok(
      workflow.includes(`if: \u0024{{ !cancelled() && steps.${step}.outcome == 'success' }}`),
    );
  }
});
