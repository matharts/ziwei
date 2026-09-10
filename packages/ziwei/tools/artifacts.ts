import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { parseTriple } from "@napi-rs/cli";

import { distributionFiles } from "./pack.ts";

export type ArtifactBatch = { commit: string; runId: string; runAttempt: string };
type Digest = { bytes: number; sha256: string };

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path: string, value: unknown) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
const digest = (bytes: Buffer): Digest => ({
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
});
const artifactName = (batch: ArtifactBatch, target: string) =>
  `node-distribution-${batch.runAttempt}-${target}`;

function validateBatch(batch: ArtifactBatch) {
  assert.match(batch.commit, /^[a-f0-9]{40}$/, "需要完整的 Git 提交 SHA");
  assert.match(batch.runId, /^[1-9]\d*$/, "需要 CI run ID");
  assert.match(batch.runAttempt, /^[1-9]\d*$/, "需要 CI run attempt");
}

function contract(packageRoot: string) {
  const source = readJson(join(packageRoot, "package.json"));
  const targets: string[] = source.napi.targets;
  assert.ok(targets.length > 0 && new Set(targets).size === targets.length, "目标配置不可空或重复");
  const commonFiles = distributionFiles(packageRoot).sort();
  const platforms = targets.map((target) => {
    const { platformArchABI: suffix } = parseTriple(target);
    return {
      target,
      name: `${source.name}-${suffix}`,
      binary: `${source.napi.binaryName}.${suffix}.node`,
      tarball: `${target}.tgz`,
    };
  });
  return { source, commonFiles, platforms };
}

function regularFile(path: string) {
  const stat = lstatSync(path);
  assert.ok(stat.isFile() && stat.size > 0, `需要非空普通文件：${path}`);
  return readFileSync(path);
}

// Read named entries to stdout only. Never extract downloaded archive paths to disk.
function archiveEntry(tarball: string, file: string) {
  const bytes = execFileSync("tar", ["-xOzf", tarball, `package/${file}`], {
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.ok(bytes.length > 0, `归档文件不可为空：${file}`);
  return bytes;
}

function archiveFiles(tarball: string, files: string[]) {
  const entries = execFileSync("tar", ["-tzf", tarball], {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  })
    .trim()
    .split(/\r?\n/);
  const directories = new Set(["package/", "package/dist/", "package/native/"]);
  assert.deepEqual(
    entries.filter((entry) => !directories.has(entry)).sort(),
    files.map((file) => `package/${file}`).sort(),
    "归档文件集合必须完整且无重复、越界或额外文件",
  );
}

function inspectDistribution(packageRoot: string, directory: string, target: string) {
  const { source, commonFiles, platforms } = contract(packageRoot);
  const platform = platforms.find((item) => item.target === target);
  assert.ok(platform, `未配置的分发目标：${target}`);
  const mainTarball = join(directory, "ziwei.tgz");
  const nativeTarball = join(directory, platform.tarball);
  archiveFiles(mainTarball, [...commonFiles, "package.json"]);
  archiveFiles(nativeTarball, [platform.binary, "package.json", "README.md", "LICENSE"]);
  const main = JSON.parse(archiveEntry(mainTarball, "package.json").toString("utf8"));
  const native = JSON.parse(archiveEntry(nativeTarball, "package.json").toString("utf8"));
  for (const field of [
    "name",
    "version",
    "description",
    "license",
    "type",
    "main",
    "types",
    "exports",
    "engines",
  ])
    assert.deepEqual(main[field], source[field], `主包字段不匹配：${field}`);
  assert.deepEqual(main.optionalDependencies, { [platform.name]: source.version });
  assert.equal(main.private, true);
  assert.equal(main.scripts, undefined);
  assert.equal(native.name, platform.name);
  assert.equal(native.version, source.version);
  assert.equal(native.main, platform.binary);
  assert.equal(native.private, true);
  assert.equal(native.scripts, undefined);
  const common = Object.fromEntries(
    commonFiles.map((file) => [file, archiveEntry(mainTarball, file)]),
  );
  for (const file of ["README.md", "AGENTS.md", "LICENSE"]) {
    const sourcePath =
      file === "LICENSE" ? join(packageRoot, "../../LICENSE") : join(packageRoot, file);
    assert.deepEqual(common[file], regularFile(sourcePath), `说明文件不属于当前源码：${file}`);
  }
  assert.deepEqual(archiveEntry(nativeTarball, "LICENSE"), common.LICENSE);
  return { main, common, binary: digest(archiveEntry(nativeTarball, platform.binary)), platform };
}

/** Call only after this exact pair of tarballs passed its target's consumer checks. */
export function captureArtifacts(
  packageRoot: string,
  distribution: string,
  outputParent: string,
  target: string,
  batch: ArtifactBatch,
) {
  validateBatch(batch);
  const { source, platforms } = contract(packageRoot);
  const platform = platforms.find((item) => item.target === target);
  assert.ok(platform, `未配置的分发目标：${target}`);
  assert.deepEqual(readJson(join(distribution, "artifacts.json")), {
    main: "ziwei.tgz",
    platforms: [{ target, name: platform.name, tarball: platform.tarball }],
  });
  inspectDistribution(packageRoot, distribution, target);
  const files = Object.fromEntries(
    ["ziwei.tgz", platform.tarball].map((file) => [file, regularFile(join(distribution, file))]),
  );
  mkdirSync(outputParent, { recursive: true });
  const directory = join(outputParent, artifactName(batch, target));
  mkdirSync(directory); // Immutable within an attempt: never overwrite an earlier capture.
  for (const [file, bytes] of Object.entries(files))
    writeFileSync(join(directory, file), bytes, { flag: "wx" });
  writeJson(join(directory, "manifest.json"), {
    schemaVersion: 1,
    batch,
    name: source.name,
    version: source.version,
    target,
    files: Object.fromEntries(Object.entries(files).map(([file, bytes]) => [file, digest(bytes)])),
  });
  return directory;
}

/** Assemble one complete cohort. No rebuild, publication, or source-tree writes. */
export function assembleArtifacts(
  packageRoot: string,
  input: string,
  outputParent: string,
  batch: ArtifactBatch,
) {
  validateBatch(batch);
  const { source, platforms } = contract(packageRoot);
  assert.deepEqual(
    readdirSync(input).sort(),
    platforms.map(({ target }) => artifactName(batch, target)).sort(),
    "必须收齐当前 attempt 的全部目标，不允许缺失、重复或额外产物",
  );
  const inputs = platforms.map((platform) => {
    const directory = join(input, artifactName(batch, platform.target));
    assert.ok(lstatSync(directory).isDirectory(), "产物目录不可为链接");
    assert.deepEqual(
      readdirSync(directory).sort(),
      ["manifest.json", "ziwei.tgz", platform.tarball].sort(),
    );
    const manifestBytes = regularFile(join(directory, "manifest.json"));
    const files = Object.fromEntries(
      ["ziwei.tgz", platform.tarball].map((file) => [file, regularFile(join(directory, file))]),
    );
    assert.deepEqual(
      JSON.parse(manifestBytes.toString("utf8")),
      {
        schemaVersion: 1,
        batch,
        name: source.name,
        version: source.version,
        target: platform.target,
        files: Object.fromEntries(
          Object.entries(files).map(([file, bytes]) => [file, digest(bytes)]),
        ),
      },
      `产物批次、版本、目标或 SHA-256 校验失败：${platform.target}`,
    );
    return {
      ...inspectDistribution(packageRoot, directory, platform.target),
      tarball: files[platform.tarball]!,
      manifest: digest(manifestBytes),
    };
  });
  const first = inputs[0]!;
  for (const item of inputs) {
    for (const [file, bytes] of Object.entries(first.common))
      assert.ok(
        item.common[file]!.equals(bytes),
        `公共构建文件不一致：${item.platform.target}/${file}`,
      );
    assert.deepEqual(
      { ...item.main, optionalDependencies: {} },
      { ...first.main, optionalDependencies: {} },
      `主包元数据不一致：${item.platform.target}`,
    );
  }
  // Preflight is complete before creating output. Platform tarballs stay byte-identical.
  mkdirSync(outputParent, { recursive: true });
  const directory = mkdtempSync(join(outputParent, "ziwei-"));
  const mainDirectory = join(directory, "main");
  for (const [file, bytes] of Object.entries(first.common)) {
    mkdirSync(dirname(join(mainDirectory, file)), { recursive: true });
    writeFileSync(join(mainDirectory, file), bytes, { flag: "wx" });
  }
  const main = {
    ...first.main,
    optionalDependencies: Object.fromEntries(platforms.map(({ name }) => [name, source.version])),
  };
  writeJson(join(mainDirectory, "package.json"), main);
  const mainTarball = join(directory, "ziwei.tgz");
  execFileSync("pnpm", ["pack", "--out", mainTarball], { cwd: mainDirectory, timeout: 30_000 });
  archiveFiles(mainTarball, [...Object.keys(first.common), "package.json"]);
  assert.deepEqual(JSON.parse(archiveEntry(mainTarball, "package.json").toString("utf8")), main);
  for (const [file, bytes] of Object.entries(first.common))
    assert.deepEqual(archiveEntry(mainTarball, file), bytes, `最终主包改写了构建文件：${file}`);
  const packed = inputs.map(({ platform, tarball, binary, manifest }) => {
    writeFileSync(join(directory, platform.tarball), tarball, { flag: "wx" });
    return {
      ...platform,
      ...digest(tarball),
      binaryDigest: binary,
      sourceArtifact: artifactName(batch, platform.target),
      sourceManifest: manifest,
    };
  });
  writeJson(join(directory, "artifacts.json"), {
    main: "ziwei.tgz",
    platforms: packed.map(({ target, name, tarball }) => ({ target, name, tarball })),
  });
  // The final marker records exact downloadable bytes, not a promise of registry support.
  writeJson(join(directory, "batch.json"), {
    schemaVersion: 1,
    batch,
    name: source.name,
    version: source.version,
    main: { tarball: "ziwei.tgz", ...digest(regularFile(mainTarball)) },
    platforms: packed,
    common: Object.fromEntries(
      Object.entries(first.common).map(([file, bytes]) => [file, digest(bytes)]),
    ),
  });
  return directory;
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: "string" },
      output: { type: "string" },
      target: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "mise run capture:node -- --input <tested distribution> --target <Rust target> [--output <parent>]\nmise run assemble:node -- --input <downloaded artifacts> [--output <parent>]\n需要 GITHUB_SHA、GITHUB_RUN_ID、GITHUB_RUN_ATTEMPT；保留 private，不构建或发布。",
    );
  } else {
    assert.equal(positionals.length, 1, "必须选择 capture 或 assemble");
    assert.ok(values.input, "必须指定 --input");
    const batch = {
      commit: process.env.GITHUB_SHA ?? "",
      runId: process.env.GITHUB_RUN_ID ?? "",
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "",
    };
    const packageRoot = fileURLToPath(new URL("..", import.meta.url));
    if (positionals[0] === "capture") {
      assert.ok(values.target, "封存必须指定 --target");
      console.log(
        captureArtifacts(
          packageRoot,
          resolve(values.input),
          resolve(values.output ?? "target/node-artifacts"),
          values.target,
          batch,
        ),
      );
    } else {
      assert.equal(positionals[0], "assemble", "未知命令");
      assert.equal(values.target, undefined, "完整汇总不允许缩减目标集");
      console.log(
        assembleArtifacts(
          packageRoot,
          resolve(values.input),
          resolve(values.output ?? "target/node-distribution-complete"),
          batch,
        ),
      );
    }
  }
}
