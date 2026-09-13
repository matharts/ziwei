import assert from "node:assert/strict";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { runCandidateExperiment, verifyDownload } from "../candidate-runtime.ts";
import { pnpmBuild, readPnpmRebuild, rebuildPnpm } from "../pnpm-rebuild.ts";

// Historical experiment only. Daily CI builds its own same-run client and never
// downloads this short-lived artifact or substitutes its batch for the Ziwei batch.
export const verifiedPnpmBuild = {
  batch: {
    commit: "22c3c328b846a37a4c6499d2a942e874670efef1",
    runId: "34774152796",
    runAttempt: "1",
  },
  sha256: "33f02b192985516eb79662fca568325f676455b01b0a46feb3fb6205f565c431",
} as const;

export function readVerifiedPnpmBuild(path: string) {
  const rebuilt = readPnpmRebuild(path, verifiedPnpmBuild.batch, "pnpm-rebuild-experiment");
  verifyDownload(rebuilt.binary, verifiedPnpmBuild.sha256, "sha256");
  return rebuilt;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      output: { type: "string" },
      mode: { type: "string", default: "build" },
      input: { type: "string" },
      receipt: { type: "string" },
    },
  });
  assert.ok(values.output, "需要 --output 新结果目录");
  if (values.mode === "consume") {
    assert.ok(
      values.input && values.receipt && !values.source,
      "消费对照需要 --input 和 --receipt，不接受 --source",
    );
    await runCandidateExperiment(
      pnpmBuild.target,
      resolve(values.input),
      resolve(values.output),
      readVerifiedPnpmBuild(resolve(values.receipt)),
    );
  } else {
    assert.equal(values.mode, "build", "未知重建实验模式");
    assert.ok(
      values.source && !values.input && !values.receipt,
      "重建需要 --source，不接受消费产物",
    );
    await rebuildPnpm(values.source, values.output);
  }
}
