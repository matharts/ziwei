import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { test } from "@rstest/core";

import {
  verifyNodeZip,
  windowsBaseline,
  windowsBootstrap,
  windowsContainerArgs,
} from "../../packages/ziwei/tools/windows-container.ts";

test("Windows experiment pins its image and keeps Node aligned with the consumer minimum", () => {
  const source = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../packages/ziwei/package.json", import.meta.url)),
      "utf8",
    ),
  );
  assert.equal(source.engines.node, `>=${windowsBaseline.nodeVersion}`);
  assert.match(
    windowsBaseline.image,
    /^mcr\.microsoft\.com\/windows\/servercore@sha256:[a-f0-9]{64}$/,
  );
  assert.match(windowsBaseline.nodeSha256, /^[a-f0-9]{64}$/);
});

test("Node material must match both the fixed digest and the exact official filename", () => {
  // Synthetic bytes exercise the checker, not Windows binary compatibility.
  const bytes = Buffer.from("checksum fixture");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const expected = { nodeVersion: "24.15.0", nodeSha256: sha256 };
  const filename = "node-v24.15.0-win-x64.zip";
  assert.deepEqual(verifyNodeZip(bytes, `${sha256}  ${filename}\r\n`, expected), {
    filename,
    bytes: bytes.length,
    sha256,
  });
  assert.throws(() => verifyNodeZip(bytes, "", expected), /官方 SHASUMS/);
  assert.throws(
    () => verifyNodeZip(bytes, `${sha256}  node-v24.15.0-win-arm64.zip`, expected),
    /官方 SHASUMS/,
  );
  assert.throws(
    () => verifyNodeZip(Buffer.from("changed"), `${sha256}  ${filename}`, expected),
    /固定摘要/,
  );
  assert.throws(() => verifyNodeZip(bytes, `${sha256}  ${filename}`), /固定摘要/);
});

test("Docker receives isolated input, separate output and only the cohort environment", () => {
  const input = "C:\\temp\\input with spaces";
  const output = "C:\\temp\\results with spaces";
  const args = windowsContainerArgs(input, output);
  assert.equal(args[0], "run");
  assert.ok(args.includes("--isolation=process"));
  assert.ok(args.includes(`type=bind,src=${input},dst=C:\\input,readonly`));
  assert.ok(args.includes(`type=bind,src=${output},dst=C:\\output`));
  assert.equal(args.filter((arg) => arg.startsWith("type=bind,")).length, 2);
  assert.deepEqual(
    args.flatMap((arg, index) => (arg === "--env" ? [args[index + 1]] : [])),
    ["GITHUB_SHA", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"],
  );
  assert.ok(args.includes(windowsBaseline.image));
  assert.equal(Buffer.from(args.at(-1)!, "base64").toString("utf16le"), windowsBootstrap);
  assert.match(windowsBootstrap, /exit \$LASTEXITCODE/);
  assert.throws(() => windowsContainerArgs("C:\\a,b", output), /逗号/);
  assert.throws(() => windowsContainerArgs(input, "C:\\a,b"), /逗号/);
});

test("Windows experiment failures are retained and cannot bypass the final CI check", () => {
  const workflow = readFileSync(
    fileURLToPath(new URL("../../.github/workflows/ci.yml", import.meta.url)),
    "utf8",
  );
  const job = workflow.split("  windows-clean-consumer:\n")[1]!.split("\n  quality:")[0]!;
  assert.match(job, /needs: node-distribution/);
  assert.match(job, /runs-on: windows-2025/);
  assert.match(job, /name: node-distribution-\$\{\{ github\.run_attempt \}\}/);
  assert.match(job, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.doesNotMatch(job, /continue-on-error/);
  assert.match(workflow, /needs: \[.*windows-clean-consumer\]/);
  assert.match(workflow, /test "\$WINDOWS_CLEAN_RESULT" = success/);
});
