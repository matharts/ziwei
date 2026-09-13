import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import { test } from "@rstest/core";

import { imageEnvironmentScript } from "../../../packages/ziwei/tools/diagnostics/pnpm-repro.ts";
import { pnpmBuildScript } from "../../../packages/ziwei/tools/pnpm-rebuild.ts";

test("Linux diagnostic environment script is valid for its actual shell", () => {
  assert.equal(process.platform, "linux", "该测试组要求 Linux；通用合同由 node-tools 覆盖");
  execFileSync("bash", ["-n"], { input: imageEnvironmentScript, timeout: 5_000 });
  execFileSync("bash", ["-n"], { input: pnpmBuildScript, timeout: 5_000 });
});
