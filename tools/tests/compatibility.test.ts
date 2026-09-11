import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "@rstest/core";
import type { TestContext } from "@rstest/core";

import {
  inspectWindowsX64Imports,
  recordWindowsCrt,
  verifyGlibcVersions,
  verifyGnuArtifacts,
} from "../../packages/ziwei/tools/compatibility.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));

// Synthetic PE descriptors test inspection only; CI must still load the real addon.
function windowsBinary(imports: string[], delayImports: string[] = []) {
  const binary = Buffer.alloc(0xc00);
  binary.write("MZ");
  binary.writeUInt32LE(0x80, 0x3c);
  binary.write("PE\0\0", 0x80);
  binary.writeUInt16LE(0x8664, 0x84);
  binary.writeUInt16LE(1, 0x86);
  binary.writeUInt16LE(240, 0x94);
  binary.writeUInt16LE(0x2000, 0x96);
  binary.writeUInt16LE(0x20b, 0x98);
  binary.writeUInt32LE(16, 0x98 + 108);
  binary.writeUInt32LE(0xa00, 0x188 + 8);
  binary.writeUInt32LE(0x1000, 0x188 + 12);
  binary.writeUInt32LE(0xa00, 0x188 + 16);
  binary.writeUInt32LE(0x200, 0x188 + 20);
  let nameOffset = 0x500;
  for (const [names, directory, offset, size, nameField] of [
    [imports, 1, 0x200, 20, 12],
    [delayImports, 13, 0x300, 32, 4],
  ] as const) {
    if (names.length === 0) continue;
    binary.writeUInt32LE(offset + 0xe00, 0x98 + 112 + directory * 8);
    binary.writeUInt32LE((names.length + 1) * size, 0x98 + 116 + directory * 8);
    names.forEach((name, index) => {
      if (directory === 13) binary.writeUInt32LE(1, offset + index * size);
      binary.writeUInt32LE(nameOffset + 0xe00, offset + index * size + nameField);
      binary.write(name + "\0", nameOffset);
      nameOffset += Buffer.byteLength(name) + 1;
    });
  }
  return binary;
}

test("Windows inspection reads normal and delay imports without incidental string matches", () => {
  const binary = windowsBinary(["KERNEL32.dll", "VCRUNTIME140.dll"], ["USER32.dll"]);
  binary.write("msvcp140.dll", 0xb00);
  assert.deepEqual(inspectWindowsX64Imports(binary), {
    imports: ["KERNEL32.dll", "VCRUNTIME140.dll"],
    delayImports: ["USER32.dll"],
  });
  assert.deepEqual(inspectWindowsX64Imports(windowsBinary([])), {
    imports: [],
    delayImports: [],
  });
});

test("Windows inspection fails closed for malformed or unsupported PE structures", () => {
  const mutations: ((binary: Buffer) => void)[] = [
    (b) => b.write("NO"),
    (b) => b.writeUInt32LE(0xfffffff0, 0x3c),
    (b) => b.write("NE", 0x80),
    (b) => b.writeUInt16LE(0xaa64, 0x84),
    (b) => b.writeUInt16LE(0, 0x96),
    (b) => b.writeUInt16LE(0x10b, 0x98),
    (b) => b.writeUInt16LE(120, 0x94),
    (b) => b.writeUInt32LE(1, 0x98 + 108),
    (b) => b.writeUInt32LE(0xffff, 0x188 + 16),
    (b) => b.writeUInt32LE(0, 0x98 + 120),
    (b) => b.writeUInt32LE(20, 0x98 + 124),
    (b) => b.writeUInt32LE(0x1a00, 0x20c),
    (b) => b.fill(65, 0x500),
    (b) => {
      b[0x500] = 0xff;
    },
    (b) => b.writeUInt32LE(0, 0x300),
    (b) => b.writeUInt32LE(3, 0x300),
    (b) => b.writeUInt32LE(32, 0x98 + 116 + 13 * 8),
  ];
  for (const mutate of mutations) {
    const binary = windowsBinary(["KERNEL32.dll"], ["VCRUNTIME140.dll"]);
    mutate(binary);
    assert.throws(() => inspectWindowsX64Imports(binary), { name: "AssertionError" });
  }
  assert.throws(() => inspectWindowsX64Imports(Buffer.alloc(10)), { name: "AssertionError" });
});

test("Windows CRT records exact binary evidence and rejects normal or delayed VC dependencies", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ziwei-crt-contract-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "addon.node");
  const dynamic = windowsBinary(["KERNEL32.dll", "VCRUNTIME140.dll"]);
  writeFileSync(path, dynamic);
  const baseline = recordWindowsCrt("dynamic", path, directory);
  assert.equal(baseline.bytes, dynamic.length);
  assert.equal(baseline.sha256, createHash("sha256").update(dynamic).digest("hex"));
  assert.deepEqual(readFileSync(join(directory, "dynamic.node")), dynamic);
  assert.deepEqual(JSON.parse(readFileSync(join(directory, "dynamic.json"), "utf8")), baseline);
  assert.throws(() => recordWindowsCrt("dynamic", path, directory), /EEXIST/);

  writeFileSync(path, windowsBinary(["KERNEL32.dll", "api-ms-win-crt-runtime-l1-1-0.dll"]));
  assert.deepEqual(recordWindowsCrt("static", path, directory).crtImports, []);
  assert.throws(() => recordWindowsCrt("dynamic", path, join(directory, "no-crt")), /缺少动态 CRT/);
  for (const [index, binary] of [
    windowsBinary(["vCrUnTiMe140_1.DLL"]),
    windowsBinary(["KERNEL32.dll"], ["MSVCP140.dll"]),
  ].entries()) {
    writeFileSync(path, binary);
    const output = join(directory, `rejected-${index}`);
    assert.throws(() => recordWindowsCrt("static", path, output), /仍依赖 VC Runtime/);
    assert.deepEqual(readFileSync(join(output, "static.node")), binary);
    assert.equal(
      JSON.parse(readFileSync(join(output, "static.json"), "utf8")).crtImports.length,
      1,
    );
  }
});
const versionInfo = (versions: string[]) =>
  `Version symbols section '.gnu.version' contains 100 entries:\n` +
  `Version needs section '.gnu.version_r' contains 1 entry:\n` +
  `  0x000000: Version: 1 File: libc.so.6 Cnt: ${versions.length}\n` +
  versions.map((version) => `  0x000010: Name: ${version} Flags: none Version: 2`).join("\n");
const accepted = versionInfo(["GLIBC_2.2.5", "GLIBC_2.17", "GLIBC_2.28", "GCC_4.2.0"]);

test("glibc gate compares numeric requirements and ignores unrelated symbol definitions", () => {
  assert.deepEqual(verifyGlibcVersions(accepted), ["GLIBC_2.2.5", "GLIBC_2.17", "GLIBC_2.28"]);
  assert.deepEqual(verifyGlibcVersions(versionInfo(["GLIBC_2.9", "GLIBC_2.9"])), ["GLIBC_2.9"]);
  assert.deepEqual(
    verifyGlibcVersions(
      `Version definition section '.gnu.version_d':\nName: GLIBC_9.0\n${accepted}`,
    ),
    ["GLIBC_2.2.5", "GLIBC_2.17", "GLIBC_2.28"],
  );
});

for (const version of ["GLIBC_2.28.1", "GLIBC_2.29", "GLIBC_2.34", "GLIBC_3.0", "GLIBC_2.100"]) {
  test(`glibc gate rejects ${version}, including a later weak requirement`, () => {
    assert.throws(
      () =>
        verifyGlibcVersions(
          versionInfo(["GLIBC_2.17", version]).replaceAll("Flags: none", "Flags: WEAK"),
        ),
      /超过 glibc 2.28/,
    );
  });
}

test("glibc gate fails closed for absent, private, unknown or malformed requirements", () => {
  for (const output of [
    "",
    "No version information found in this file.",
    accepted + "\n" + accepted,
    versionInfo(["GCC_4.2.0"]),
    versionInfo(["GLIBC_PRIVATE"]),
    versionInfo(["GLIBC_ABI_DT_RELR"]),
    versionInfo(["GLIBC_2.invalid"]),
  ])
    assert.throws(() => verifyGlibcVersions(output));
});

function fixture(t: TestContext, alterBinary: (binary: Buffer) => Buffer = (binary) => binary) {
  const directory = mkdtempSync(join(tmpdir(), "ziwei-gnu-contract-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const source = JSON.parse(readFileSync(join(root, "packages/ziwei/package.json"), "utf8"));
  const digest = (bytes: Buffer) => ({
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  const platforms = source.napi.targets.map((target: string) => ({ target }));
  const binaries: Buffer[] = [];
  for (const [target, suffix, machine] of [
    ["x86_64-unknown-linux-gnu", "linux-x64-gnu", 62],
    ["aarch64-unknown-linux-gnu", "linux-arm64-gnu", 183],
  ] as const) {
    const packageDirectory = join(directory, target, "package");
    mkdirSync(packageDirectory, { recursive: true });
    // Header-only bytes test the archive boundary, never real compatibility or loading.
    const binary = Buffer.alloc(64);
    binary.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
    binary.writeUInt16LE(3, 16);
    binary.writeUInt16LE(machine, 18);
    const stored = alterBinary(binary);
    binaries.push(stored);
    writeFileSync(join(packageDirectory, `${source.napi.binaryName}.${suffix}.node`), stored);
    const tarball = `${target}.tgz`;
    execFileSync("tar", ["-czf", tarball, "-C", target, "package"], { cwd: directory });
    Object.assign(
      platforms.find((item: { target: string }) => item.target === target),
      {
        tarball,
        ...digest(readFileSync(join(directory, tarball))),
        binaryDigest: digest(stored),
      },
    );
  }
  const batch = {
    schemaVersion: 1,
    name: source.name,
    version: source.version,
    batch: {
      commit: process.env.GITHUB_SHA ?? "a".repeat(40),
      runId: process.env.GITHUB_RUN_ID ?? "1",
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "1",
    },
    platforms,
  };
  const save = () => writeFileSync(join(directory, "batch.json"), JSON.stringify(batch));
  save();
  return { directory, batch, binaries, save };
}

test("GNU inspection receives exactly the hashed archive bytes for both architectures", (t) => {
  const { directory, binaries } = fixture(t);
  const inspected: Buffer[] = [];
  const result = verifyGnuArtifacts(directory, (binary) => {
    inspected.push(binary);
    return accepted;
  });
  assert.deepEqual(inspected, binaries);
  assert.equal(result.length, 2);
  assert.throws(
    () =>
      verifyGnuArtifacts(directory, () => {
        throw new Error("readelf failed");
      }),
    /readelf failed/,
  );
  assert.throws(
    () => verifyGnuArtifacts(directory, () => versionInfo(["GLIBC_2.34"])),
    /超过 glibc 2.28/,
  );
});

for (const [name, alter] of [
  ["truncated header", (binary: Buffer) => binary.subarray(0, 20)],
  [
    "ELF32",
    (binary: Buffer) => {
      binary[4] = 1;
      return binary;
    },
  ],
  [
    "big endian",
    (binary: Buffer) => {
      binary[5] = 2;
      return binary;
    },
  ],
  [
    "executable",
    (binary: Buffer) => {
      binary.writeUInt16LE(2, 16);
      return binary;
    },
  ],
  [
    "wrong CPU",
    (binary: Buffer) => {
      binary.writeUInt16LE(183, 18);
      return binary;
    },
  ],
] as const) {
  test(`GNU inspection rejects a correctly hashed ${name} before running readelf`, (t) => {
    const { directory } = fixture(t, alter);
    assert.throws(
      () =>
        verifyGnuArtifacts(directory, () => {
          throw new Error("must not inspect");
        }),
      { name: "AssertionError" },
    );
  });
}

test("GNU inspection rejects missing targets, archive traversal and changed digests before inspection", (t) => {
  const { directory, batch, save } = fixture(t);
  const original = structuredClone(batch.platforms);
  const unexpected = () => {
    throw new Error("must not inspect unverified bytes");
  };
  for (const mutate of [
    () => batch.platforms.pop(),
    () => {
      batch.platforms = [...batch.platforms, batch.platforms[0]];
    },
    () => {
      batch.platforms.find(
        (item: { target: string }) => item.target === "x86_64-unknown-linux-gnu",
      ).tarball = "../outside.tgz";
    },
    () => {
      batch.platforms.find(
        (item: { target: string }) => item.target === "x86_64-unknown-linux-gnu",
      ).sha256 = "0".repeat(64);
    },
    () => {
      batch.platforms.find(
        (item: { target: string }) => item.target === "x86_64-unknown-linux-gnu",
      ).binaryDigest.sha256 = "0".repeat(64);
    },
  ]) {
    batch.platforms = structuredClone(original);
    mutate();
    save();
    assert.throws(() => verifyGnuArtifacts(directory, unexpected), { name: "AssertionError" });
  }
});
