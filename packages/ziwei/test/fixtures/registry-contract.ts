import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTriple } from "@napi-rs/cli";

import { packDistribution } from "../../tools/pack.ts";
import { verifyRegistry } from "./registry-consumer.ts";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "ziwei-registry-contract-"));
const fixture = join(temporary, "packages/ziwei");
const source = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const brokenNative = process.argv.includes("--broken-native");
const digest = (path: string) => {
  const bytes = readFileSync(path);
  return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
};
try {
  mkdirSync(join(fixture, "native"), { recursive: true });
  for (const file of [
    "src",
    "dist",
    "package.json",
    "README.md",
    "AGENTS.md",
    "native/binding.cjs",
    "native/binding.d.cts",
  ])
    cpSync(join(packageRoot, file), join(fixture, file), { recursive: true });
  cpSync(join(packageRoot, "../../LICENSE"), join(temporary, "LICENSE"));
  const report = process.report.getReport() as { header: { glibcVersionRuntime?: string } };
  const libc = report.header.glibcVersionRuntime ? "gnu" : "musl";
  let realBinaries = 0;
  for (const target of source.napi.targets as string[]) {
    const { platformArchABI: suffix } = parseTriple(target);
    const file = `ziwei-native.${suffix}.node`;
    if (
      suffix.startsWith(`${process.platform}-${process.arch}`) &&
      (process.platform !== "linux" || suffix.endsWith(`-${libc}`))
    ) {
      cpSync(join(packageRoot, "native", file), join(fixture, "native", file));
      if (brokenNative) writeFileSync(join(fixture, "native", file), "not-a-native-binary");
      realBinaries++;
    } else {
      // Metadata selection regression only; remote CI supplies eight real binaries.
      writeFileSync(join(fixture, "native", file), `not-a-native-binary-${suffix}`);
    }
  }
  assert.equal(realBinaries, 1);
  const staged = await packDistribution(fixture, join(temporary, "staged"), source.napi.targets);
  writeFileSync(
    join(staged.directory, "batch.json"),
    JSON.stringify({
      schemaVersion: 1,
      batch: { commit: "a".repeat(40), runId: "1", runAttempt: "1" },
      name: source.name,
      version: source.version,
      main: { tarball: basename(staged.mainTarball), ...digest(staged.mainTarball) },
      platforms: staged.packages.map(({ target, name, binary, tarball, directory }) => ({
        target,
        name,
        tarball: basename(tarball),
        ...digest(tarball),
        binaryDigest: digest(join(directory, binary)),
      })),
    }),
  );
  // Synthetic transport fixtures are not a GitHub artifact cohort.
  for (const variable of ["GITHUB_SHA", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"])
    delete process.env[variable];
  const observations: { manager: string; node: string; arch: string; sharedObjects: string[] }[] =
    [];
  const consume = () => verifyRegistry(staged.directory, (runtime) => observations.push(runtime));
  if (brokenNative) await assert.rejects(consume(), /Cannot find native binding/);
  else await consume();
  assert.deepEqual(
    observations.map(({ manager }) => manager),
    brokenNative ? ["npm"] : ["npm", "pnpm"],
  );
  for (const runtime of observations) {
    assert.equal(runtime.node, process.version);
    assert.equal(runtime.arch, process.arch);
    assert.ok(Array.isArray(runtime.sharedObjects));
    if (!brokenNative) assert.ok(runtime.sharedObjects.some((path) => path.endsWith(".node")));
  }
  console.log(brokenNative ? "registry-runtime-failure-ok" : "registry-runtime-success-ok");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
