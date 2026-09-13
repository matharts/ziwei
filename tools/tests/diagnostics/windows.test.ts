import assert from "node:assert/strict";

import { test } from "@rstest/core";

import {
  dockerDiagnosticsScript,
  observeCommand,
  redactObservation,
} from "../../../packages/ziwei/tools/windows-docker.ts";

test("Windows Docker diagnostic script returns service, process and event evidence", () => {
  assert.equal(process.platform, "win32", "Windows host diagnostics require a Windows runner");
  // Validate the script output independently of the production 10-second collection budget.
  // Cold PowerShell startup and event-log queries can take longer on shared Windows runners.
  const startedAt = Date.now();
  const result = observeCommand(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(dockerDiagnosticsScript, "utf16le").toString("base64"),
    ],
    30_000,
  );
  // Retain the partial stage stream on timeout; never expose unredacted host evidence.
  const diagnostic = JSON.stringify({
    startedAt,
    result: redactObservation(result),
  });
  assert.equal(result.error, undefined, diagnostic);
  assert.equal(result.status, 0, diagnostic);
  const evidence = JSON.parse(result.stdout);
  assert.deepEqual(
    evidence.services.map((service: { name: string }) => service.name),
    ["docker", "hns", "vmcompute"],
  );
  assert.ok(Array.isArray(evidence.processes));
  assert.ok(Array.isArray(evidence.events));
  const prefix = "[windows-diagnostics] ";
  const stages = result.stderr
    .split("\n")
    .filter((line) => line.startsWith(prefix))
    .map((line) => JSON.parse(line.slice(prefix.length)));
  assert.equal(stages[0]?.stage, "script-start");
  assert.equal(stages.at(-1)?.stage, "script-end");
  for (const [index, stage] of stages.entries()) {
    assert.ok(Number.isSafeInteger(stage.unixMs) && stage.unixMs > 0);
    assert.ok(Number.isSafeInteger(stage.elapsedMs) && stage.elapsedMs >= 0);
    if (index) assert.ok(stage.elapsedMs >= stages[index - 1].elapsedMs);
  }
});
