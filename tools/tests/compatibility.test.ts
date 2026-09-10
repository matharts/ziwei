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
  verifyGlibcVersions,
  verifyGnuArtifacts,
} from "../../packages/ziwei/tools/compatibility.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
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
