import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const gnuTargets = {
  "x86_64-unknown-linux-gnu": { machine: 62, bits: 64, endian: "little", suffix: "linux-x64-gnu" },
  "aarch64-unknown-linux-gnu": {
    machine: 183,
    bits: 64,
    endian: "little",
    suffix: "linux-arm64-gnu",
  },
  "armv7-unknown-linux-gnueabihf": {
    machine: 40,
    bits: 32,
    endian: "little",
    suffix: "linux-arm-gnueabihf",
  },
  "powerpc64le-unknown-linux-gnu": {
    machine: 21,
    bits: 64,
    endian: "little",
    suffix: "linux-ppc64-gnu",
  },
  "s390x-unknown-linux-gnu": { machine: 22, bits: 64, endian: "big", suffix: "linux-s390x-gnu" },
} as const;
type GnuTarget = keyof typeof gnuTargets;
// Candidate files are not members of the sealed release cohort.
const machines = {
  "x86_64-unknown-linux-gnu": gnuTargets["x86_64-unknown-linux-gnu"],
  "aarch64-unknown-linux-gnu": gnuTargets["aarch64-unknown-linux-gnu"],
} as const;
const macosTargets = {
  "x86_64-apple-darwin": { machine: 0x1000007, subtype: 3, suffix: "darwin-x64" },
  "aarch64-apple-darwin": { machine: 0x100000c, subtype: 0, suffix: "darwin-arm64" },
} as const;
type MacosTarget = keyof typeof macosTargets;
const windowsTargets = {
  "x86_64-pc-windows-msvc": { machine: 0x8664, suffix: "win32-x64-msvc" },
  "aarch64-pc-windows-msvc": { machine: 0xaa64, suffix: "win32-arm64-msvc" },
} as const;
type WindowsTarget = keyof typeof windowsTargets;
// Node 24.15.0's documented baseline, not a claim of testing that macOS release.
const macosDeploymentCeiling = 0x0d0500;
type Digest = { bytes: number; sha256: string };
const digest = (bytes: Buffer): Digest => ({
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
});

type MuslRuntime = {
  platform: string;
  arch: string;
  node: string;
  alpine: string;
  glibc?: string;
  sharedObjects: string[];
  loaderStatus: number | null;
  loaderOutput: string;
};

/** Validate this test environment, not a minimum Alpine or musl support promise. */
export function verifyMuslRuntime(runtime: MuslRuntime, expectedArch: string) {
  assert.ok(expectedArch === "x64" || expectedArch === "arm64", "未知 musl 验收架构");
  assert.equal(runtime.platform, "linux", "musl 验收需要 Linux");
  assert.equal(runtime.arch, expectedArch, "musl 验收 CPU 不匹配");
  assert.equal(runtime.node, "v24.15.0", "musl 验收需要最低 Node 24.15.0");
  assert.match(runtime.alpine, /^3\.23\.\d+$/, "musl 验收保持 Alpine 3.23 系列");
  assert.equal(runtime.glibc, undefined, "musl 验收不可加载 glibc");
  const loaderArch = expectedArch === "x64" ? "x86_64" : "aarch64";
  const loader = `/lib/ld-musl-${loaderArch}.so.1`;
  assert.ok(runtime.sharedObjects.includes(loader), "Node 未报告实际加载的 musl loader");
  // musl prints its version/usage to stderr and exits 1 when no program is supplied.
  assert.equal(runtime.loaderStatus, 1, "musl loader 版本探针退出状态异常");
  const version =
    /^musl libc \((x86_64|aarch64)\)\r?\nVersion (\d+\.\d+\.\d+)\r?\nDynamic Program Loader\r?\n/.exec(
      runtime.loaderOutput,
    );
  assert.ok(version, "缺少可验证的 musl loader 版本输出");
  assert.equal(version[1], loaderArch, "musl loader CPU 不匹配");
  return {
    platform: runtime.platform,
    arch: runtime.arch,
    node: runtime.node,
    alpine: runtime.alpine,
    musl: version[2]!,
    loader,
  };
}

function inspectMuslRuntime(expectedArch: string) {
  assert.ok(expectedArch === "x64" || expectedArch === "arm64", "未知 musl 验收架构");
  assert.equal(process.platform, "linux", "musl 验收需要 Linux");
  assert.equal(process.arch, expectedArch, "musl 验收 CPU 不匹配");
  const report = process.report.getReport() as {
    header: { glibcVersionRuntime?: string };
    sharedObjects: string[];
  };
  const loader = spawnSync(
    `/lib/ld-musl-${expectedArch === "x64" ? "x86_64" : "aarch64"}.so.1`,
    [],
    {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 16 * 1024,
    },
  );
  assert.equal(loader.error, undefined, "无法执行 musl loader 版本探针");
  return verifyMuslRuntime(
    {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      alpine: readFileSync("/etc/alpine-release", "utf8").trim(),
      glibc: report.header.glibcVersionRuntime,
      sharedObjects: report.sharedObjects,
      loaderStatus: loader.status,
      loaderOutput: loader.stdout + loader.stderr,
    },
    expectedArch,
  );
}

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

/** Read only fixed archive entries, checking both tarball and binary identities first. */
function readArtifactBinaries<T extends string>(
  directory: string,
  targets: Record<T, { suffix: string }>,
) {
  const source = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  );
  const batch = JSON.parse(readFileSync(join(directory, "batch.json"), "utf8"));
  assert.equal(batch.schemaVersion, 1);
  assert.equal(batch.name, source.name);
  assert.equal(batch.version, source.version);
  assert.match(batch.batch?.commit, /^[a-f0-9]{40}$/, "产物批次 commit 无效");
  assert.match(batch.batch?.runId, /^[1-9]\d*$/, "产物批次 runId 无效");
  assert.match(batch.batch?.runAttempt, /^[1-9]\d*$/, "产物批次 runAttempt 无效");
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
  return (Object.keys(targets) as T[]).map((target) => {
    const platform = platforms.find((item) => item.target === target);
    assert.ok(platform, `完整批次缺少 ${target}`);
    assert.equal(platform.tarball, `${target}.tgz`);
    const path = join(directory, platform.tarball);
    assert.ok(lstatSync(path).isFile(), "产物归档必须为普通文件");
    const tarball = readFileSync(path);
    assert.deepEqual(digest(tarball), { bytes: platform.bytes, sha256: platform.sha256 });
    const binary = execFileSync(
      "tar",
      ["-xOzf", "-", `package/${source.napi.binaryName}.${targets[target].suffix}.node`],
      { input: tarball, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
    );
    assert.deepEqual(digest(binary), platform.binaryDigest);
    return {
      target,
      binary,
      batch: batch.batch as { commit: string; runId: string; runAttempt: string },
    };
  });
}

/** Inspect the supported GNU ELF layouts, not executable code or runtime compatibility. */
export function inspectGnuBinary(binary: Buffer, target: GnuTarget) {
  assert.ok(Object.hasOwn(gnuTargets, target), "未知 GNU 目标");
  const expected = gnuTargets[target];
  const wide = expected.bits === 64;
  const headerSize = wide ? 64 : 52;
  assert.ok(binary.length >= headerSize, "GNU 二进制的 ELF header 不完整");
  assert.deepEqual(binary.subarray(0, 4), Buffer.from([0x7f, 0x45, 0x4c, 0x46]), "需要 ELF 产物");
  assert.equal(binary[4], wide ? 2 : 1, "GNU 产物 ELF class 不匹配");
  assert.equal(binary[5], expected.endian === "little" ? 1 : 2, "GNU 产物字节序不匹配");
  assert.equal(binary[6], 1, "不支持的 ELF ident version");
  assert.ok(binary[7] === 0 || binary[7] === 3, "GNU 产物 OS ABI 不匹配");
  const u16 = (offset: number) =>
    expected.endian === "little" ? binary.readUInt16LE(offset) : binary.readUInt16BE(offset);
  const u32 = (offset: number) =>
    expected.endian === "little" ? binary.readUInt32LE(offset) : binary.readUInt32BE(offset);
  const word = (offset: number) =>
    wide
      ? expected.endian === "little"
        ? binary.readBigUInt64LE(offset)
        : binary.readBigUInt64BE(offset)
      : BigInt(u32(offset));
  assert.equal(u16(16), 3, "需要 ELF shared object");
  assert.equal(u16(18), expected.machine, "GNU 产物 CPU 不匹配");
  assert.equal(u32(20), 1, "不支持的 ELF version");
  assert.equal(u16(wide ? 52 : 40), headerSize, "ELF header size 不匹配");
  const flags = u32(wide ? 48 : 36);
  if (target === "armv7-unknown-linux-gnueabihf") {
    // AAELF32: EABI5; ET_DYN records the floating-point calling convention in e_flags.
    assert.equal(flags >>> 24, 5, "ARM 产物需要 EABI5");
    assert.equal(flags & 0x600, 0x400, "ARM 产物需要 hard-float 且不可声明 soft-float");
  } else if (target === "powerpc64le-unknown-linux-gnu") {
    assert.equal(flags & 3, 2, "PPC64LE 产物需要明确的 ELFv2 ABI");
  }

  const table = (offset: bigint, count: number, entrySize: number, size: number, name: string) => {
    // Extended counts require section zero decoding; this narrow addon gate fails closed.
    assert.notEqual(count, 0xffff, `${name} 不支持扩展计数`);
    if (count === 0) {
      assert.equal(offset, 0n, `${name} 零计数必须无偏移，不支持扩展计数`);
    } else {
      assert.equal(entrySize, size, `${name} entry size 不匹配`);
      assert.ok(offset >= BigInt(headerSize), `${name} 与 ELF header 重叠`);
      assert.ok(offset + BigInt(count * size) <= BigInt(binary.length), `${name} 超出文件范围`);
    }
    return { offset: Number(offset), count, size };
  };
  const program = table(
    word(wide ? 32 : 28),
    u16(wide ? 56 : 44),
    u16(wide ? 54 : 42),
    wide ? 56 : 32,
    "ELF program table",
  );
  const section = table(
    word(wide ? 40 : 32),
    u16(wide ? 60 : 48),
    u16(wide ? 58 : 46),
    wide ? 64 : 40,
    "ELF section table",
  );
  assert.ok(section.count < 0xff00, "ELF section table 不支持扩展计数");
  const namesIndex = u16(wide ? 62 : 50);
  assert.ok(namesIndex === 0 || namesIndex < section.count, "ELF section name index 超出范围");
  if (program.count > 0 && section.count > 0) {
    assert.ok(
      program.offset + program.count * program.size <= section.offset ||
        section.offset + section.count * section.size <= program.offset,
      "ELF header tables 重叠",
    );
  }
  const fileRange = (offset: bigint, size: bigint, name: string) =>
    assert.ok(offset + size <= BigInt(binary.length), `${name} 超出文件范围`);
  for (let i = 0; i < program.count; i++) {
    const start = program.offset + i * program.size;
    const fileSize = word(start + (wide ? 32 : 16));
    fileRange(word(start + (wide ? 8 : 4)), fileSize, "ELF segment");
    if (u32(start) === 1)
      assert.ok(
        fileSize <= word(start + (wide ? 40 : 20)),
        "ELF LOAD segment 文件长度超过内存长度",
      );
  }
  for (let i = 0; i < section.count; i++) {
    const start = section.offset + i * section.size;
    // NULL and NOBITS do not occupy bytes in the file; .bss may exceed file length.
    if (u32(start + 4) !== 0 && u32(start + 4) !== 8) {
      fileRange(word(start + (wide ? 24 : 16)), word(start + (wide ? 32 : 20)), "ELF section");
    }
  }
  return { bits: expected.bits, endian: expected.endian, machine: expected.machine, flags };
}

/** Static candidate probe only: no batch receipt, package installation or support claim. */
export function inspectGnuCandidate(target: string, path: string, inspect = readVersionInfo) {
  assert.ok(
    Object.hasOwn(gnuTargets, target) && !Object.hasOwn(machines, target),
    "需要 GNU 候选目标",
  );
  const file = lstatSync(path);
  assert.ok(file.isFile(), "候选二进制必须为普通文件");
  assert.ok(file.size <= 16 * 1024 * 1024, "候选二进制超过 16 MiB 审计上限");
  const binary = readFileSync(path);
  const elf = inspectGnuBinary(binary, target as GnuTarget);
  return {
    target,
    verification: "static" as const,
    ...digest(binary),
    elf,
    versions: verifyGlibcVersions(inspect(binary)),
  };
}

/** Inspect the actual GNU tarballs of an assembled cohort, without rebuilding them. */
export function verifyGnuArtifacts(directory: string, inspect = readVersionInfo) {
  return readArtifactBinaries(directory, machines).map(({ target, binary }) => {
    inspectGnuBinary(binary, target);
    return { target, versions: verifyGlibcVersions(inspect(binary)) };
  });
}

/** Inspect thin little-endian Rust dylibs; not a general Mach-O loader or symbol audit. */
export function inspectMacosBinary(binary: Buffer, target: MacosTarget) {
  const expected = macosTargets[target];
  assert.ok(expected, "未知 macOS 目标");
  assert.ok(binary.length >= 32, "Mach-O header 不完整");
  assert.equal(binary.readUInt32LE(0), 0xfeedfacf, "需要单架构 little-endian Mach-O 64 产物");
  assert.equal(binary.readUInt32LE(4), expected.machine, "macOS 产物 CPU 不匹配");
  assert.equal(binary.readUInt32LE(8), expected.subtype, "macOS 产物 CPU subtype 不匹配");
  assert.equal(binary.readUInt32LE(12), 6, "需要 Mach-O dylib 产物");
  const count = binary.readUInt32LE(16);
  const end = 32 + binary.readUInt32LE(20);
  assert.ok(
    end <= binary.length && count > 0 && count <= (end - 32) / 8,
    "Mach-O load commands 范围无效",
  );
  const dependencies: string[] = [];
  const rpaths: string[] = [];
  const versions: { minimumOs: number; sdk: number }[] = [];
  let cursor = 32;
  for (let index = 0; index < count; index++) {
    assert.ok(cursor + 8 <= end, "Mach-O load command header 越界");
    const command = binary.readUInt32LE(cursor);
    const size = binary.readUInt32LE(cursor + 4);
    assert.ok(size >= 8 && size % 8 === 0 && cursor + size <= end, "Mach-O load command 大小无效");
    // Strings are offsets within this command, not file offsets or arbitrary binary text.
    const path = (headerSize: number) => {
      assert.ok(size >= headerSize, "Mach-O 路径命令不完整");
      const offset = binary.readUInt32LE(cursor + 8);
      assert.ok(offset >= headerSize && offset < size, "Mach-O 路径偏移越界");
      const start = cursor + offset;
      const terminator = binary.indexOf(0, start);
      assert.ok(terminator > start && terminator < cursor + size, "Mach-O 路径缺少终止符");
      const bytes = binary.subarray(start, terminator);
      assert.ok(
        bytes.every((byte) => byte >= 0x20 && byte <= 0x7e),
        "Mach-O 路径必须为 ASCII",
      );
      return bytes.toString("ascii");
    };
    if ([0xc, 0x80000018, 0x8000001f, 0x20, 0x80000023].includes(command)) {
      // Ordinary, weak, re-exported, lazy and upward dylib dependencies all matter.
      dependencies.push(path(24));
    } else if (command === 0x8000001c) {
      rpaths.push(path(12));
    } else if (command === 0x32) {
      assert.ok(size >= 24, "Mach-O build version 不完整");
      assert.equal(binary.readUInt32LE(cursor + 8), 1, "Mach-O 平台必须为 macOS");
      assert.equal(size, 24 + binary.readUInt32LE(cursor + 20) * 8, "Mach-O build tools 数量无效");
      versions.push({
        minimumOs: binary.readUInt32LE(cursor + 12),
        sdk: binary.readUInt32LE(cursor + 16),
      });
    } else if (command === 0x24) {
      assert.equal(size, 16, "Mach-O minimum version 大小无效");
      versions.push({
        minimumOs: binary.readUInt32LE(cursor + 8),
        sdk: binary.readUInt32LE(cursor + 12),
      });
    } else {
      assert.ok(
        ![0x25, 0x2f, 0x30, 0x27, 0xe, 0x6, 0x10].includes(command),
        "不支持的 Mach-O 平台或加载命令",
      );
      // LC_ID_DYLIB names this module, not a library it loads; its build path is not a dependency.
    }
    cursor += size;
  }
  assert.equal(cursor, end, "Mach-O load commands 长度不匹配");
  assert.equal(versions.length, 1, "需要唯一的 macOS 最低系统版本命令");
  const version = versions[0]!;
  assert.ok(
    version.minimumOs >>> 16 >= 10 && version.minimumOs <= macosDeploymentCeiling,
    "Mach-O 最低系统标记无效或超过 13.5.0 检查上限",
  );
  assert.equal(rpaths.length, 0, "macOS 产物不得依赖 RPATH 搜索路径");
  assert.ok(dependencies.length > 0, "macOS 产物缺少系统动态库依赖");
  for (const dependency of dependencies) {
    assert.ok(
      (dependency.startsWith("/usr/lib/") ||
        dependency.startsWith("/System/Library/Frameworks/")) &&
        dependency
          .split("/")
          .slice(1)
          .every((part) => part !== "" && part !== "." && part !== ".."),
      `macOS 产物含非系统动态库路径：${dependency}`,
    );
  }
  const formatVersion = (value: number) =>
    `${value >>> 16}.${(value >>> 8) & 0xff}.${value & 0xff}`;
  return {
    deploymentCeiling: formatVersion(macosDeploymentCeiling),
    minimumOs: formatVersion(version.minimumOs),
    sdk: formatVersion(version.sdk),
    dependencies,
    rpaths,
  };
}

/** Gate both macOS tarballs in the complete cohort, independently of the host CPU. */
export function verifyMacosArtifacts(directory: string) {
  return readArtifactBinaries(directory, macosTargets).map(({ target, binary, batch }) => ({
    target,
    batch,
    ...digest(binary),
    ...inspectMacosBinary(binary, target),
  }));
}

/** Inspect our MSVC PE32+ DLLs, not ARM64EC/ARM64X or runtime-loaded libraries. */
export function inspectWindowsImports(binary: Buffer, target: WindowsTarget) {
  const expected = windowsTargets[target];
  assert.ok(expected, "未知 Windows 目标");
  const range = (offset: number, size: number) => {
    assert.ok(offset >= 0 && size >= 0 && offset + size <= binary.length, "PE 文件范围越界");
  };
  range(0, 64);
  assert.equal(binary.toString("ascii", 0, 2), "MZ", "需要 DOS header");
  const pe = binary.readUInt32LE(0x3c);
  range(pe, 24);
  assert.ok(pe >= 64, "PE header 与 DOS header 重叠");
  assert.equal(binary.toString("ascii", pe, pe + 4), "PE\0\0", "需要 PE signature");
  assert.equal(binary.readUInt16LE(pe + 4), expected.machine, "Windows 产物 CPU 不匹配");
  assert.ok(binary.readUInt16LE(pe + 22) & 0x2000, "需要 PE DLL 产物");
  const count = binary.readUInt16LE(pe + 6);
  const optionalSize = binary.readUInt16LE(pe + 20);
  const optional = pe + 24;
  range(optional, optionalSize);
  assert.ok(optionalSize >= 112 + 14 * 8, "PE optional header 缺少导入目录");
  assert.equal(binary.readUInt16LE(optional), 0x20b, "需要 PE32+ 产物");
  const directories = binary.readUInt32LE(optional + 108);
  assert.ok(directories >= 14 && 112 + directories * 8 <= optionalSize, "PE 目录数量无效");
  assert.ok(count > 0 && count <= 96, "PE section 数量无效");
  const sectionTable = optional + optionalSize;
  range(sectionTable, count * 40);
  const sections = Array.from({ length: count }, (_, index) => {
    const header = sectionTable + index * 40;
    const address = binary.readUInt32LE(header + 12);
    const size = binary.readUInt32LE(header + 16);
    const offset = binary.readUInt32LE(header + 20);
    range(offset, size);
    if (size > 0) assert.ok(offset >= sectionTable + count * 40, "PE section 与 header 重叠");
    return { address, size, offset };
  });
  // Only file-backed section bytes can supply descriptors or DLL names.
  const locate = (rva: number, size: number) => {
    const matches = sections.filter(
      (section) => rva >= section.address && rva + size <= section.address + section.size,
    );
    assert.equal(matches.length, 1, "PE RVA 必须映射到唯一的文件 section");
    const section = matches[0]!;
    return { offset: section.offset + rva - section.address, end: section.offset + section.size };
  };
  const dllName = (rva: number) => {
    const { offset, end } = locate(rva, 1);
    const terminator = binary.indexOf(0, offset);
    assert.ok(terminator > offset && terminator < end, "PE DLL 名称缺少终止符");
    const name = binary.subarray(offset, terminator);
    assert.ok(
      name.every((byte) => byte >= 0x20 && byte <= 0x7e),
      "PE DLL 名称必须为 ASCII",
    );
    return name.toString("ascii");
  };
  const readImports = (directory: number, descriptorSize: number, nameField: number) => {
    const entry = optional + 112 + directory * 8;
    const rva = binary.readUInt32LE(entry);
    const size = binary.readUInt32LE(entry + 4);
    if (rva === 0 && size === 0) return [];
    assert.ok(rva > 0 && size >= descriptorSize, "PE 导入目录无效");
    const { offset } = locate(rva, size);
    const names: string[] = [];
    for (let cursor = offset; cursor + descriptorSize <= offset + size; cursor += descriptorSize) {
      if (binary.subarray(cursor, cursor + descriptorSize).every((byte) => byte === 0)) {
        return [...new Set(names)];
      }
      if (directory === 13) {
        assert.equal(binary.readUInt32LE(cursor), 1, "仅支持 RVA 格式的 PE 延迟导入");
      }
      names.push(dllName(binary.readUInt32LE(cursor + nameField)));
    }
    assert.fail("PE 导入目录缺少空 descriptor 终止符");
  };
  return { imports: readImports(1, 20, 12), delayImports: readImports(13, 32, 4) };
}

function windowsCrtImports(dependencies: { imports: string[]; delayImports: string[] }) {
  return [...new Set([...dependencies.imports, ...dependencies.delayImports])].filter((name) =>
    /^(?:vcruntime|msvcp|msvcr|concrt|vcomp|vcamp)\d.*\.dll$/i.test(name),
  );
}

/** Audit the sealed ARM64 bytes without changing or requiring a CRT linkage mode. */
export function verifyWindowsArm64Artifact(directory: string) {
  const target = "aarch64-pc-windows-msvc";
  const [artifact] = readArtifactBinaries(directory, { [target]: windowsTargets[target] });
  assert.ok(artifact);
  const { binary, batch } = artifact;
  const dependencies = inspectWindowsImports(binary, target);
  return {
    target,
    batch,
    ...digest(binary),
    ...dependencies,
    crtImports: windowsCrtImports(dependencies),
  };
}

/** Keep failed candidates too. System/UCRT imports are not VC Redistributable imports. */
export function recordWindowsCrt(
  mode: "dynamic" | "static",
  binaryPath: string,
  directory: string,
) {
  assert.ok(lstatSync(binaryPath).isFile(), "Windows 二进制必须为普通文件");
  const binary = readFileSync(binaryPath);
  const dependencies = inspectWindowsImports(binary, "x86_64-pc-windows-msvc");
  const crtImports = windowsCrtImports(dependencies);
  const report = {
    target: "x86_64-pc-windows-msvc",
    mode,
    ...digest(binary),
    ...dependencies,
    crtImports,
    rustflags: process.env.CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS ?? null,
    batch: {
      commit: process.env.GITHUB_SHA ?? null,
      runId: process.env.GITHUB_RUN_ID ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    },
  };
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${mode}.node`), binary, { flag: "wx" });
  writeFileSync(join(directory, `${mode}.json`), JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
  if (mode === "static")
    assert.equal(crtImports.length, 0, `静态候选仍依赖 VC Runtime：${crtImports}`);
  else
    assert.ok(
      crtImports.some((name) => /^vcruntime140\.dll$/i.test(name)),
      "基线缺少动态 CRT 依赖",
    );
  return report;
}

if (import.meta.main) {
  if (process.argv[2] === "--gnu-candidate") {
    assert.equal(process.argv.length, 5, "用法：--gnu-candidate <Rust-target> <二进制>");
    console.log(
      JSON.stringify(inspectGnuCandidate(process.argv[3]!, resolve(process.argv[4]!)), null, 2),
    );
  } else if (process.argv[2] === "--musl-runtime") {
    assert.equal(process.argv.length, 4, "用法：--musl-runtime <x64|arm64>");
    console.log(JSON.stringify(inspectMuslRuntime(process.argv[3]!), null, 2));
  } else if (process.argv[2] === "--macos") {
    assert.equal(process.argv.length, 4, "用法：mise run check:node:macos -- <完整交付目录>");
    console.log(JSON.stringify(verifyMacosArtifacts(resolve(process.argv[3]!)), null, 2));
  } else if (process.argv[2] === "--windows-arm64") {
    assert.equal(
      process.argv.length,
      4,
      "用法：mise run check:node:windows-arm64 -- <完整交付目录>",
    );
    console.log(JSON.stringify(verifyWindowsArm64Artifact(resolve(process.argv[3]!)), null, 2));
  } else if (process.argv[2] === "--windows-crt") {
    assert.equal(
      process.argv.length,
      6,
      "用法：--windows-crt <dynamic|static> <二进制> <证据目录>",
    );
    const mode = process.argv[3];
    assert.ok(mode === "dynamic" || mode === "static", "CRT 模式必须为 dynamic 或 static");
    console.log(
      JSON.stringify(
        recordWindowsCrt(mode, resolve(process.argv[4]!), resolve(process.argv[5]!)),
        null,
        2,
      ),
    );
  } else {
    assert.equal(process.argv.length, 3, "用法：mise run check:node:glibc -- <完整交付目录>");
    console.log(JSON.stringify(verifyGnuArtifacts(resolve(process.argv[2]!)), null, 2));
  }
}
