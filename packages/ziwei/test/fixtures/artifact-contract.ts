import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { assembleArtifacts, captureArtifacts } from "../../tools/artifacts.ts";
import { stageDistribution } from "../../tools/pack.ts";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const directory = mkdtempSync(join(tmpdir(), "ziwei-artifact-contract-"));
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value));
const digest = (bytes: Buffer) => ({
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
});
const batch = { commit: "a".repeat(40), runId: "1234", runAttempt: "2" };
const input = join(directory, "inputs");
const output = join(directory, "output");
const fixture = join(directory, "packages/ziwei");
const captured: string[] = [];

try {
  mkdirSync(join(fixture, "native"), { recursive: true });
  for (const file of [
    "src",
    "dist",
    "README.md",
    "AGENTS.md",
    "package.json",
    "native/binding.cjs",
    "native/binding.d.cts",
  ])
    cpSync(join(packageRoot, file), join(fixture, file), { recursive: true });
  cpSync(join(packageRoot, "../../LICENSE"), join(directory, "LICENSE"));
  const source = readJson(join(fixture, "package.json"));
  // Independent target/binary contract; fake bytes exercise transport, never native loading.
  const targets = [
    ["aarch64-apple-darwin", "darwin-arm64"],
    ["x86_64-apple-darwin", "darwin-x64"],
    ["aarch64-pc-windows-msvc", "win32-arm64-msvc"],
    ["x86_64-pc-windows-msvc", "win32-x64-msvc"],
    ["x86_64-unknown-linux-gnu", "linux-x64-gnu"],
    ["aarch64-unknown-linux-gnu", "linux-arm64-gnu"],
    ["x86_64-unknown-linux-musl", "linux-x64-musl"],
    ["aarch64-unknown-linux-musl", "linux-arm64-musl"],
  ];
  for (const [, suffix] of targets)
    writeFileSync(join(fixture, "native", `ziwei-native.${suffix}.node`), `fixture-${suffix}`);
  const staged = await stageDistribution(
    fixture,
    join(directory, "staging"),
    targets.map(([target]) => target!),
  );
  const originalMain = readJson(join(staged.mainDirectory, "package.json"));
  const tar = (archive: string, parent: string) =>
    execFileSync("tar", ["-czf", archive, "-C", parent, "package"], { timeout: 30_000 });
  for (const platform of staged.packages) {
    const single = join(directory, "single", platform.target);
    const mainParent = join(single, "main");
    const nativeParent = join(single, "native");
    cpSync(staged.mainDirectory, join(mainParent, "package"), { recursive: true });
    cpSync(platform.directory, join(nativeParent, "package"), { recursive: true });
    writeJson(join(mainParent, "package/package.json"), {
      ...originalMain,
      optionalDependencies: { [platform.name]: source.version },
    });
    tar(join(single, "ziwei.tgz"), mainParent);
    tar(join(single, `${platform.target}.tgz`), nativeParent);
    writeJson(join(single, "artifacts.json"), {
      main: "ziwei.tgz",
      platforms: [
        { target: platform.target, name: platform.name, tarball: `${platform.target}.tgz` },
      ],
    });
    captured.push(captureArtifacts(fixture, single, input, platform.target, batch));
  }
  const first = captured[0]!;
  const firstTarget = staged.packages[0]!.target;
  const manifestPath = join(first, "manifest.json");
  const originalManifest = readJson(manifestPath);
  const fail = (expected: RegExp | { code: string; actual: unknown; expected: unknown }) => {
    assert.throws(() => assembleArtifacts(fixture, input, output, batch), expected);
    assert.equal(existsSync(output), false, "失败的预检不能产生部分交付物");
  };
  // Missing and extra targets, including duplicate content under another name.
  renameSync(first, `${first}.extra`);
  fail(/全部目标/);
  renameSync(`${first}.extra`, first);
  cpSync(first, `${first}.extra`, { recursive: true });
  fail(/全部目标/);
  rmSync(`${first}.extra`, { recursive: true });
  renameSync(first, join(directory, "missing"));
  fail(/全部目标/);
  renameSync(join(directory, "missing"), first);
  for (const mutation of [
    { batch: { ...batch, commit: "b".repeat(40) } },
    { batch: { ...batch, runId: "999" } },
    { batch: { ...batch, runAttempt: "1" } },
    { version: "1.0.0-wrong" },
    { target: "unknown-target" },
    { files: { ...originalManifest.files, "../escape": originalManifest.files["ziwei.tgz"] } },
  ]) {
    writeJson(manifestPath, { ...originalManifest, ...mutation });
    fail(/SHA-256/);
  }
  writeJson(manifestPath, originalManifest);
  const nativeArchive = join(first, `${firstTarget}.tgz`);
  const originalNative = readFileSync(nativeArchive);
  writeFileSync(nativeArchive, Buffer.concat([originalNative, Buffer.from("corrupted")]));
  fail(/SHA-256/);
  writeFileSync(nativeArchive, originalNative);
  const nativeParent = join(directory, "single", firstTarget, "native");
  const nativeManifestPath = join(nativeParent, "package/package.json");
  const originalNativeManifest = readJson(nativeManifestPath);
  writeJson(nativeManifestPath, { ...originalNativeManifest, version: "1.0.0-wrong" });
  tar(nativeArchive, nativeParent);
  writeJson(manifestPath, {
    ...originalManifest,
    files: {
      ...originalManifest.files,
      [`${firstTarget}.tgz`]: digest(readFileSync(nativeArchive)),
    },
  });
  fail({ code: "ERR_ASSERTION", actual: "1.0.0-wrong", expected: source.version });
  writeJson(nativeManifestPath, originalNativeManifest);
  writeFileSync(nativeArchive, originalNative);
  writeJson(manifestPath, originalManifest);
  writeFileSync(join(first, "unexpected.node"), "unexpected");
  fail(/deep-equal/);
  rmSync(join(first, "unexpected.node"));
  // Even internally consistent hashes cannot legitimize mismatching archive contents.
  const mainArchive = join(first, "ziwei.tgz");
  const originalArchive = readFileSync(mainArchive);
  const mainParent = join(directory, "single", firstTarget, "main");
  const mainPackage = join(mainParent, "package");
  const refresh = () => {
    tar(mainArchive, mainParent);
    writeJson(manifestPath, {
      ...originalManifest,
      files: { ...originalManifest.files, "ziwei.tgz": digest(readFileSync(mainArchive)) },
    });
  };
  const mainManifestPath = join(mainPackage, "package.json");
  const originalMainManifest = readJson(mainManifestPath);
  writeJson(mainManifestPath, { ...originalMainManifest, version: "1.0.0-wrong" });
  refresh();
  fail(/主包字段不匹配/);
  writeJson(mainManifestPath, originalMainManifest);
  const commonFile = join(mainPackage, "dist/index.js");
  const originalCommon = readFileSync(commonFile);
  writeFileSync(commonFile, Buffer.concat([originalCommon, Buffer.from("\n// different build\n")]));
  refresh();
  fail(/公共构建文件不一致/);
  writeFileSync(commonFile, originalCommon);
  renameSync(commonFile, `${commonFile}.missing`);
  refresh();
  fail(/归档文件集合/);
  renameSync(`${commonFile}.missing`, commonFile);
  writeFileSync(mainArchive, originalArchive);
  writeJson(manifestPath, originalManifest);
  assert.throws(
    () =>
      captureArtifacts(fixture, join(directory, "single", firstTarget), input, firstTarget, batch),
    /EEXIST/,
  );
  assert.throws(
    () => assembleArtifacts(fixture, input, output, { ...batch, commit: "short" }),
    /提交 SHA/,
  );
  const cliArgs = ["run", "assemble:node", "--", "--input", input, "--output", output];
  const cliOptions = {
    cwd: join(packageRoot, "../.."),
    encoding: "utf8" as const,
    timeout: 30_000,
    env: {
      ...process.env,
      GITHUB_SHA: batch.commit,
      GITHUB_RUN_ID: batch.runId,
      GITHUB_RUN_ATTEMPT: batch.runAttempt,
    },
  };
  assert.throws(
    () => execFileSync("mise", [...cliArgs, "--target", firstTarget], cliOptions),
    /不允许缩减目标集/,
  );
  assert.throws(
    () =>
      execFileSync("mise", cliArgs, {
        ...cliOptions,
        env: { ...cliOptions.env, GITHUB_RUN_ID: "" },
      }),
    /CI run ID/,
  );
  assert.equal(existsSync(output), false);
  // Exercise the actual mise/CLI entry, not only the imported assembly function.
  const result = execFileSync("mise", cliArgs, cliOptions).trim().split(/\r?\n/).at(-1)!;
  const complete = readJson(join(result, "batch.json"));
  const artifacts = readJson(join(result, "artifacts.json"));
  const main = readJson(join(result, "main/package.json"));
  assert.deepEqual(complete.batch, batch);
  assert.equal(complete.platforms.length, 8);
  assert.equal(artifacts.platforms.length, 8);
  assert.deepEqual(
    main.optionalDependencies,
    Object.fromEntries(staged.packages.map(({ name }) => [name, source.version])),
  );
  assert.equal(main.private, true);
  assert.ok(Object.keys(complete.common).every((file) => !file.endsWith(".node")));
  assert.deepEqual(complete.main, {
    tarball: "ziwei.tgz",
    ...digest(readFileSync(join(result, "ziwei.tgz"))),
  });
  for (const platform of complete.platforms) {
    const expected = readFileSync(join(input, platform.sourceArtifact, platform.tarball));
    assert.deepEqual(readFileSync(join(result, platform.tarball)), expected);
    assert.deepEqual({ bytes: platform.bytes, sha256: platform.sha256 }, digest(expected));
    const nativeManifest = JSON.parse(
      execFileSync("tar", ["-xOzf", join(result, platform.tarball), "package/package.json"], {
        encoding: "utf8",
      }),
    );
    assert.equal(nativeManifest.version, source.version);
    assert.equal(nativeManifest.private, true);
  }
  assert.equal(readdirSync(output).length, 1);
  assert.equal(readJson(join(packageRoot, "package.json")).optionalDependencies, undefined);
  // A failure after preflight must not leave either final completion marker.
  for (const platform of staged.packages) {
    const producer = join(directory, "single", platform.target, "main");
    const producerManifestPath = join(producer, "package/package.json");
    writeJson(producerManifestPath, { ...readJson(producerManifestPath), files: ["README.md"] });
    const artifact = join(input, `node-distribution-${batch.runAttempt}-${platform.target}`);
    const tarball = join(artifact, "ziwei.tgz");
    tar(tarball, producer);
    const manifest = readJson(join(artifact, "manifest.json"));
    writeJson(join(artifact, "manifest.json"), {
      ...manifest,
      files: { ...manifest.files, "ziwei.tgz": digest(readFileSync(tarball)) },
    });
  }
  const failedOutput = join(directory, "failed-pack");
  assert.throws(() => assembleArtifacts(fixture, input, failedOutput, batch), /归档文件集合/);
  const incomplete = join(failedOutput, readdirSync(failedOutput)[0]!);
  assert.equal(existsSync(join(incomplete, "batch.json")), false);
  assert.equal(existsSync(join(incomplete, "artifacts.json")), false);
  console.log("artifact-contract-ok");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
