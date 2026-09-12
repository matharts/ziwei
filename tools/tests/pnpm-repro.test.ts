import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { test } from "@rstest/core";

import { candidateImage } from "../../packages/ziwei/tools/candidate-runtime.ts";
import { pnpmGdbArgs } from "../../packages/ziwei/tools/pnpm-gdb.ts";
import {
  classifyPnpmProbe,
  imageComparison,
  imageComparisons,
  imageEnvironmentScript,
  pnpmReproArgs,
  pnpmComparison,
  pnpmComparisons,
  runPnpmRepro,
  qemuComparisons,
  qemuComparison,
  verifyQemuVersion,
} from "../../packages/ziwei/tools/pnpm-repro.ts";

test("GDB stops the first SIGSEGV without startup scripts or public ports", async () => {
  const args = pnpmGdbArgs("/tmp/pnpm", "/tmp/debug/gdb.sock");
  assert.ok(args.includes("--nx"));
  assert.ok(args.includes("set auto-load off"));
  assert.ok(args.includes("target remote /tmp/debug/gdb.sock"));
  assert.ok(args.includes("handle SIGSEGV stop print nopass"));
  assert.equal(args.filter((arg) => arg === "continue").length, 1);
  for (const command of [
    "info registers",
    "x/24i $pc-32",
    "bt 32",
    "info files",
    "info sharedlibrary",
    "info proc mappings",
  ])
    assert.ok(args.includes(command));
  assert.throws(() => pnpmGdbArgs("/tmp/pnpm", "/tmp/socket\ncontinue"));
  await assert.rejects(
    runPnpmRepro("unused", "comparison", "baseline", "baseline", true),
    /固定全部基线/,
  );
  const workflow = readFileSync(".github/workflows/pnpm-repro.yml", "utf8");
  assert.match(workflow, /inputs.comparison == 'debug'/);
  assert.match(workflow, /--qemu baseline --debug/);
  assert.match(workflow, /pnpm-repro-results-debug\//);
});

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

test("image comparison changes only the pinned guest image and rejects mixed variables", async () => {
  assert.equal(imageComparison("baseline"), candidateImage);
  assert.equal(imageComparison("comparison"), imageComparisons.comparison);
  assert.throws(() => imageComparison("latest"), /未知基础镜像/);
  const baseline = pnpmReproArgs("owned", "/tmp/pnpm", false);
  const alternate = pnpmReproArgs("owned", "/tmp/pnpm", false, "comparison");
  assert.equal(alternate.at(-2), imageComparisons.comparison);
  alternate[alternate.length - 2] = candidateImage;
  assert.deepEqual(alternate, baseline);
  await assert.rejects(
    runPnpmRepro("unused", "comparison", "baseline", "comparison"),
    /镜像对照必须固定/,
  );
  await assert.rejects(
    runPnpmRepro("unused", "baseline", "comparison", "comparison"),
    /镜像对照必须固定/,
  );
  await assert.rejects(
    runPnpmRepro("unused", undefined, "baseline", "comparison"),
    /镜像对照必须固定/,
  );
  execFileSync("bash", ["-n"], { input: imageEnvironmentScript });
  assert.match(imageEnvironmentScript, /getconf GNU_LIBC_VERSION/);
  assert.match(imageEnvironmentScript, /readlink -f \/lib64\/ld64.so.2/);
});

test("image workflow mode holds QEMU and pnpm at baseline", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/pnpm-repro.yml", import.meta.url),
    "utf8",
  );
  assert.ok(
    workflow.includes("inputs.comparison == 'image' && steps.baseline-qemu.outcome == 'success'"),
  );
  assert.ok(
    workflow.includes("--output pnpm-repro-results-image --qemu baseline --image comparison"),
  );
  assert.ok(workflow.includes("pnpm-repro-results-image/"));
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
  assert.ok(
    workflow.includes("inputs.comparison == 'qemu' && steps.baseline-qemu.outcome == 'success'"),
  );
  for (const step of ["reset-qemu", "comparison-qemu"]) {
    assert.ok(
      workflow.includes(`if: \u0024{{ !cancelled() && steps.${step}.outcome == 'success' }}`),
    );
  }
});

test("pnpm comparison validates the selected version and rejects mixed variables before Docker", async () => {
  assert.equal(pnpmComparison("baseline"), pnpmComparisons.baseline);
  assert.equal(pnpmComparison("comparison"), pnpmComparisons.comparison);
  assert.throws(() => pnpmComparison("latest"), /未知 pnpm/);
  const old = { code: 0, signal: null, stdout: "12.4.0\n", stderr: "" };
  assert.equal(classifyPnpmProbe(old, pnpmComparisons.comparison.version), "passed");
  assert.equal(classifyPnpmProbe(old), "failed");
  assert.equal(classifyPnpmProbe({ ...old, code: 1 }, "12.4.0"), "failed");
  await assert.rejects(runPnpmRepro("unused", "comparison", "comparison"), /必须固定/);
  await assert.rejects(runPnpmRepro("unused", undefined, "comparison"), /必须固定/);
  assert.notEqual(pnpmComparisons.baseline.binarySha256, pnpmComparisons.comparison.binarySha256);
  for (const config of Object.values(pnpmComparisons)) {
    assert.match(config.binarySha256, /^[a-f0-9]{64}$/);
    assert.equal(Buffer.from(config.integrity, "base64").length, 64);
  }
});

test("pnpm workflow mode keeps QEMU fixed and still executes after a failed baseline", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/pnpm-repro.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /default: pnpm/);
  assert.ok(
    workflow.includes(
      "!cancelled() && inputs.comparison == 'pnpm' && steps.baseline-qemu.outcome == 'success'",
    ),
  );
  assert.ok(
    workflow.includes("--output pnpm-repro-results-pnpm --qemu baseline --pnpm comparison"),
  );
  assert.ok(
    workflow.indexOf("--qemu baseline --pnpm comparison") <
      workflow.indexOf("--uninstall qemu-ppc64le"),
  );
});
