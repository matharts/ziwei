import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const machines = {
  "x86_64-unknown-linux-gnu": { machine: 62, suffix: "linux-x64-gnu" },
  "aarch64-unknown-linux-gnu": { machine: 183, suffix: "linux-arm64-gnu" },
} as const;
type GnuTarget = keyof typeof machines;
type Digest = { bytes: number; sha256: string };
const digest = (bytes: Buffer): Digest => ({
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
});

/** Check requirements, not version definitions or incidental strings in the binary. */
export function verifyGlibcVersions(output: string) {
  const needs = output.split(/^Version needs section .*$/m);
  assert.equal(needs.length, 2, "需要唯一的 ELF version needs section");
  const requirements = needs[1]!.split(/^Version (?:symbols|definition) section /m)[0]!;
  const names = [...requirements.matchAll(/\bName:\s+(\S+)/g)].map((match) => match[1]!);
  const versions = [...new Set(names.filter((name) => name.startsWith("GLIBC_")))];
  assert.ok(versions.length > 0, "GNU 产物缺少可验证的 GLIBC 版本需求");
  for (const version of versions) {
    const match = /^GLIBC_(\d+)\.(\d+)(?:\.(\d+))?$/.exec(version);
    assert.ok(match, `不支持的 GLIBC 版本需求：${version}`);
    const [, major, minor, patch = "0"] = match;
    assert.ok(
      Number(major) < 2 ||
        (Number(major) === 2 &&
          (Number(minor) < 28 || (Number(minor) === 28 && Number(patch) === 0))),
      `GNU 产物要求 ${version}，超过 glibc 2.28 验收上限`,
    );
  }
  return versions;
}

function readVersionInfo(binary: Buffer) {
  const directory = mkdtempSync(join(tmpdir(), "ziwei-glibc-"));
  try {
    // Only our fixed filename is written; archive paths are never extracted to disk.
    const path = join(directory, "addon.node");
    writeFileSync(path, binary, { flag: "wx" });
    return execFileSync("readelf", ["--version-info", "--wide", path], {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C" },
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Inspect the actual GNU tarballs of an assembled cohort, without rebuilding them. */
export function verifyGnuArtifacts(directory: string, inspect = readVersionInfo) {
  const source = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  );
  const batch = JSON.parse(readFileSync(join(directory, "batch.json"), "utf8"));
  assert.equal(batch.schemaVersion, 1);
  assert.equal(batch.name, source.name);
  assert.equal(batch.version, source.version);
  for (const [field, variable] of [
    ["commit", "GITHUB_SHA"],
    ["runId", "GITHUB_RUN_ID"],
    ["runAttempt", "GITHUB_RUN_ATTEMPT"],
  ] as const) {
    if (process.env[variable]) assert.equal(batch.batch[field], process.env[variable]);
  }
  const platforms: {
    target: string;
    tarball: string;
    binaryDigest: Digest;
    bytes: number;
    sha256: string;
  }[] = batch.platforms;
  assert.deepEqual(platforms.map(({ target }) => target).sort(), [...source.napi.targets].sort());
  return (Object.keys(machines) as GnuTarget[]).map((target) => {
    const platform = platforms.find((item) => item.target === target);
    assert.ok(platform, `完整批次缺少 ${target}`);
    assert.equal(platform.tarball, `${target}.tgz`);
    const path = join(directory, platform.tarball);
    assert.ok(lstatSync(path).isFile(), "GNU 归档必须为普通文件");
    const tarball = readFileSync(path);
    assert.deepEqual(digest(tarball), { bytes: platform.bytes, sha256: platform.sha256 });
    const binary = execFileSync(
      "tar",
      ["-xOzf", "-", `package/${source.napi.binaryName}.${machines[target].suffix}.node`],
      { input: tarball, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
    );
    assert.deepEqual(digest(binary), platform.binaryDigest);
    assert.ok(binary.length >= 64, "GNU 二进制的 ELF header 不完整");
    assert.deepEqual(
      binary.subarray(0, 6),
      Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]),
      "需要 ELF64 little-endian 产物",
    );
    assert.equal(binary.readUInt16LE(16), 3, "需要 ELF shared object");
    assert.equal(binary.readUInt16LE(18), machines[target].machine, "GNU 产物 CPU 不匹配");
    return { target, versions: verifyGlibcVersions(inspect(binary)) };
  });
}

if (import.meta.main) {
  assert.equal(process.argv.length, 3, "用法：mise run check:node:glibc -- <完整交付目录>");
  console.log(JSON.stringify(verifyGnuArtifacts(resolve(process.argv[2]!)), null, 2));
}
