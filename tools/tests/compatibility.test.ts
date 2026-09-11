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
  inspectMacosBinary,
  inspectWindowsImports,
  recordWindowsCrt,
  verifyGlibcVersions,
  verifyGnuArtifacts,
  verifyMacosArtifacts,
  verifyMuslRuntime,
  verifyWindowsArm64Artifact,
} from "../../packages/ziwei/tools/compatibility.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));

function muslRuntime(arch: "x64" | "arm64" = "x64") {
  const loaderArch = arch === "x64" ? "x86_64" : "aarch64";
  return {
    platform: "linux",
    arch,
    node: "v24.15.0",
    alpine: "3.23.3",
    sharedObjects: [`/lib/ld-musl-${loaderArch}.so.1`, "/usr/lib/libstdc++.so.6"],
    loaderStatus: 1,
    loaderOutput: `musl libc (${loaderArch})\nVersion 1.2.5\nDynamic Program Loader\nUsage: loader pathname\n`,
  };
}

for (const arch of ["x64", "arm64"] as const) {
  test(`musl runtime gate records the actual ${arch} loader version and accepts its usage exit`, () => {
    const runtime = muslRuntime(arch);
    assert.deepEqual(verifyMuslRuntime(runtime, arch), {
      platform: "linux",
      arch,
      node: "v24.15.0",
      alpine: "3.23.3",
      musl: "1.2.5",
      loader: runtime.sharedObjects[0],
    });
    // Version is observed, not a promised minimum or an artificial equality gate.
    assert.equal(
      verifyMuslRuntime(
        {
          ...runtime,
          loaderOutput: runtime.loaderOutput.replace("1.2.5", "1.2.6"),
          alpine: "3.23.4",
        },
        arch,
      ).musl,
      "1.2.6",
    );
  });

  test(`musl runtime gate rejects wrong ${arch} environment or missing live loader evidence`, () => {
    const runtime = muslRuntime(arch);
    for (const fields of [
      { platform: "darwin" },
      { arch: arch === "x64" ? "arm64" : "x64" },
      { node: "v24.21.0" },
      { node: "v24.14.0" },
      { alpine: "3.22.3" },
      { alpine: "3.23" },
      { glibc: "2.28" },
      { sharedObjects: [] },
      { sharedObjects: ["/lib/ld-linux-x86-64.so.2"] },
      { loaderStatus: null },
      { loaderStatus: 0 },
      { loaderStatus: 127 },
      { loaderOutput: "" },
      { loaderOutput: "ldd (GNU libc) 2.28" },
      { loaderOutput: runtime.loaderOutput.replace("1.2.5", "invalid") },
      {
        loaderOutput: runtime.loaderOutput.replace(
          arch === "x64" ? "x86_64" : "aarch64",
          arch === "x64" ? "aarch64" : "x86_64",
        ),
      },
    ])
      assert.throws(() => verifyMuslRuntime({ ...runtime, ...fields }, arch));
    assert.throws(() => verifyMuslRuntime(runtime, "riscv64"), /未知 musl 验收架构/);
  });
}

test("musl runtime CLI rejects missing, extra and unknown architecture arguments", () => {
  const cli = join(root, "packages/ziwei/tools/compatibility.ts");
  for (const args of [[], ["x64", "extra"], ["riscv64"]])
    assert.throws(() =>
      execFileSync(process.execPath, [cli, "--musl-runtime", ...args], { stdio: "pipe" }),
    );
});

test("musl minimum Node CI preserves current coverage and consumes a pinned same-CPU image and cohort", () => {
  const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const registry = workflow
    .split("  registry-consumers:")[1]!
    .split("  windows-clean-consumer:")[0]!;
  const minimum = registry
    .split("- name: Minimum Node Alpine registry consumers on the target CPU")[1]!
    .split("- name:")[0]!;
  const evidence = registry.split("- name: Preserve musl minimum Node evidence")[1]!;
  assert.match(registry, /node:24\.21\.0-alpine3\.23 sh -eu -c/);
  assert.match(minimum, /if: matrix.docker-platform/);
  assert.match(minimum, /shell: bash/);
  assert.match(minimum, /MUSL_IMAGE: node:24\.15\.0-alpine3\.23@sha256:[a-f0-9]{64}\n/);
  assert.match(minimum, /linux\/amd64\) expected_arch=x64; test "\$\(uname -m\)" = x86_64/);
  assert.match(minimum, /linux\/arm64\) expected_arch=arm64; test "\$\(uname -m\)" = aarch64/);
  assert.match(minimum, /docker pull --platform "\$DOCKER_PLATFORM" "\$MUSL_IMAGE"/);
  assert.match(minimum, /docker image inspect "\$MUSL_IMAGE"/);
  assert.match(minimum, /docker run --rm --platform "\$DOCKER_PLATFORM"/);
  assert.match(minimum, /dst=\/work,readonly/);
  assert.match(minimum, /-e GITHUB_SHA -e GITHUB_RUN_ID -e GITHUB_RUN_ATTEMPT/);
  assert.match(minimum, /"\$MUSL_IMAGE" sh -eu -c/);
  assert.match(
    minimum,
    /compatibility\.ts --musl-runtime "\$EXPECTED_NODE_ARCH" > \/evidence\/runtime.json/,
  );
  assert.match(minimum, /cp "\$1\/batch.json" \/evidence\/batch.json/);
  assert.match(minimum, /registry-consumer\.ts "\$1"/);
  assert.match(minimum, /2>&1 \| tee target\/musl-compatibility\/consumer.log/);
  assert.match(minimum, /npm install --prefix \/tmp\/pnpm-tool --ignore-scripts/);
  assert.match(evidence, /!cancelled\(\) && matrix.docker-platform/);
  assert.match(
    evidence,
    /name: musl-compatibility-\$\{\{ github.run_attempt \}\}-\$\{\{ matrix.target \}\}/,
  );
  assert.match(evidence, /path: target\/musl-compatibility\//);
  assert.match(evidence, /if-no-files-found: error/);
  assert.doesNotMatch(
    registry,
    /continue-on-error|qemu|mise run (?:build:|pack:|check:node:minimum)/,
  );
  assert.match(workflow.split("  verify:")[1]!, /test "\$REGISTRY_RESULT" = success/);
  const mise = readFileSync(join(root, "mise.toml"), "utf8");
  assert.match(
    mise,
    /\[tasks\."check:node:musl-runtime"\][\s\S]*?compatibility\.ts --musl-runtime/,
  );
});

// Minimal load commands exercise the gate; these bytes are not runnable addons.
function macosBinary(arm64 = false, commands?: Buffer[]) {
  const version = Buffer.alloc(arm64 ? 24 : 16);
  version.writeUInt32LE(arm64 ? 0x32 : 0x24);
  version.writeUInt32LE(version.length, 4);
  if (arm64) version.writeUInt32LE(1, 8);
  version.writeUInt32LE(arm64 ? 0x0b0000 : 0x0a0d00, arm64 ? 12 : 8);
  version.writeUInt32LE(0x0f0500, arm64 ? 16 : 12);
  const body = Buffer.concat(commands ?? [version, macosPath(0xc, "/usr/lib/libSystem.B.dylib")]);
  const header = Buffer.alloc(32);
  header.writeUInt32LE(0xfeedfacf);
  header.writeUInt32LE(arm64 ? 0x100000c : 0x1000007, 4);
  header.writeUInt32LE(arm64 ? 0 : 3, 8);
  header.writeUInt32LE(6, 12);
  header.writeUInt32LE(commands?.length ?? 2, 16);
  header.writeUInt32LE(body.length, 20);
  return Buffer.concat([header, body]);
}

function macosPath(command: number, path: string) {
  const start = command === 0x8000001c ? 12 : 24;
  const bytes = Buffer.alloc(Math.ceil((start + Buffer.byteLength(path) + 1) / 8) * 8);
  bytes.writeUInt32LE(command);
  bytes.writeUInt32LE(bytes.length, 4);
  bytes.writeUInt32LE(start, 8);
  bytes.write(path, start);
  return bytes;
}

test("macOS gate reads both version commands without treating SDK or install ID as requirements", () => {
  for (const arm64 of [false, true]) {
    const binary = macosBinary(arm64);
    const version = binary.subarray(32, arm64 ? 56 : 48);
    const result = inspectMacosBinary(
      macosBinary(arm64, [
        version,
        macosPath(0xd, "/build/target/libziwei_node.dylib"),
        macosPath(0xc, "/usr/lib/libSystem.B.dylib"),
      ]),
      arm64 ? "aarch64-apple-darwin" : "x86_64-apple-darwin",
    );
    assert.equal(result.minimumOs, arm64 ? "11.0.0" : "10.13.0");
    assert.equal(result.sdk, "15.5.0");
    assert.deepEqual(result.dependencies, ["/usr/lib/libSystem.B.dylib"]);
    assert.deepEqual(result.rpaths, []);
  }
  const ceiling = macosBinary();
  ceiling.writeUInt32LE(0x0d0500, 40);
  assert.equal(inspectMacosBinary(ceiling, "x86_64-apple-darwin").minimumOs, "13.5.0");
});

test("macOS gate rejects non-system dependencies in all dylib loading forms and any rpath", () => {
  const version = macosBinary().subarray(32, 48);
  for (const command of [0xc, 0x80000018, 0x8000001f, 0x20, 0x80000023]) {
    for (const path of [
      "/opt/homebrew/lib/libextra.dylib",
      "/usr/local/lib/libextra.dylib",
      "@rpath/libextra.dylib",
      "@loader_path/libextra.dylib",
      "relative.dylib",
      "/usr/lib/../../tmp/libextra.dylib",
      "/usr/lib//libextra.dylib",
    ])
      assert.throws(() =>
        inspectMacosBinary(
          macosBinary(false, [version, macosPath(command, path)]),
          "x86_64-apple-darwin",
        ),
      );
  }
  for (const path of ["/usr/lib", "@loader_path", "/opt/homebrew/lib"])
    assert.throws(
      () =>
        inspectMacosBinary(
          macosBinary(false, [version, macosPath(0x8000001c, path)]),
          "x86_64-apple-darwin",
        ),
      /RPATH/,
    );
});

test("macOS gate fails closed on malformed headers, commands and deployment versions", () => {
  for (const mutate of [
    (b: Buffer) => b.writeUInt32LE(0xcafebabe),
    (b: Buffer) => b.writeUInt32LE(0xcffaedfe),
    (b: Buffer) => b.writeUInt32LE(0x100000c, 4),
    (b: Buffer) => b.writeUInt32LE(8, 8),
    (b: Buffer) => b.writeUInt32LE(2, 12),
    (b: Buffer) => b.writeUInt32LE(0, 16),
    (b: Buffer) => b.writeUInt32LE(0xffffffff, 16),
    (b: Buffer) => b.writeUInt32LE(0xffffffff, 20),
    (b: Buffer) => b.writeUInt32LE(1, 36),
    (b: Buffer) => b.writeUInt32LE(0x0d0501, 40),
    (b: Buffer) => b.writeUInt32LE(0, 40),
    (b: Buffer) => b.writeUInt32LE(1, 40),
    (b: Buffer) => b.writeUInt32LE(0x25, 32),
    (b: Buffer) => b.writeUInt32LE(0, 56),
    (b: Buffer) => b.fill(65, 72),
    (b: Buffer) => b.writeUInt32LE(1, 16),
  ]) {
    const binary = macosBinary();
    mutate(binary);
    assert.throws(() => inspectMacosBinary(binary, "x86_64-apple-darwin"), {
      name: "AssertionError",
    });
  }
  const version = macosBinary().subarray(32, 48);
  assert.throws(() =>
    inspectMacosBinary(macosBinary(false, [version, version]), "x86_64-apple-darwin"),
  );
  for (const [offset, value] of [
    [40, 2],
    [52, 1],
    [12, 8],
  ]) {
    const binary = macosBinary(true);
    binary.writeUInt32LE(value!, offset!);
    assert.throws(() => inspectMacosBinary(binary, "aarch64-apple-darwin"));
  }
  assert.throws(() => inspectMacosBinary(Buffer.alloc(16), "x86_64-apple-darwin"));
});

test("Windows CRT acceptance reuses inspected bytes and dynamic comparison is opt-in", () => {
  const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const integration = workflow
    .split("- name: Windows x64 static CRT integration and type contracts")[1]
    ?.split("- name: Node adapter integration and type contracts")[0];
  assert.ok(integration);
  assert.match(integration, /if: matrix.target == 'x86_64-pc-windows-msvc'/);
  assert.doesNotMatch(integration, /CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS/);
  assert.match(workflow, /workflow_dispatch:[\s\S]*compare_windows_crt:[\s\S]*default: false/);
  const dynamic = workflow
    .split("- name: Record Windows x64 dynamic CRT baseline")[1]!
    .split("- name:")[0]!;
  assert.match(dynamic, /inputs.compare_windows_crt == true/);
  assert.match(dynamic, /target-feature=-crt-static/);
  const tasks = [...integration.matchAll(/mise run ([\w:]+)/g)].map((match) => match[1]);
  assert.deepEqual(tasks, ["build:node:ts", "test:node", "check:node:types"]);
  assert.equal(integration.match(/if \(\$LASTEXITCODE -ne 0\)/g)?.length, 2);
});

// Synthetic PE descriptors test inspection only; CI must still load the real addon.
function windowsBinary(imports: string[], delayImports: string[] = [], machine = 0x8664) {
  const binary = Buffer.alloc(0xc00);
  binary.write("MZ");
  binary.writeUInt32LE(0x80, 0x3c);
  binary.write("PE\0\0", 0x80);
  binary.writeUInt16LE(machine, 0x84);
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
  for (const [target, machine] of [
    ["x86_64-pc-windows-msvc", 0x8664],
    ["aarch64-pc-windows-msvc", 0xaa64],
  ] as const) {
    const binary = windowsBinary(["KERNEL32.dll", "VCRUNTIME140.dll"], ["USER32.dll"], machine);
    binary.write("msvcp140.dll", 0xb00);
    assert.deepEqual(inspectWindowsImports(binary, target), {
      imports: ["KERNEL32.dll", "VCRUNTIME140.dll"],
      delayImports: ["USER32.dll"],
    });
    assert.deepEqual(inspectWindowsImports(windowsBinary([], [], machine), target), {
      imports: [],
      delayImports: [],
    });
  }
});

test("Windows inspection fails closed for malformed or unsupported PE structures", () => {
  const mutations: ((binary: Buffer) => void)[] = [
    (b) => b.write("NO"),
    (b) => b.writeUInt32LE(0xfffffff0, 0x3c),
    (b) => b.write("NE", 0x80),
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
  for (const [target, machine] of [
    ["x86_64-pc-windows-msvc", 0x8664],
    ["aarch64-pc-windows-msvc", 0xaa64],
  ] as const) {
    for (const mutate of mutations) {
      const binary = windowsBinary(["KERNEL32.dll"], ["VCRUNTIME140.dll"], machine);
      mutate(binary);
      assert.throws(() => inspectWindowsImports(binary, target), { name: "AssertionError" });
    }
    // Neither cross-labelled CPUs nor ARM64EC/ARM64X are our native ARM64 target.
    for (const wrong of [machine === 0xaa64 ? 0x8664 : 0xaa64, 0xa641, 0xa64e, 0x14c])
      assert.throws(() => inspectWindowsImports(windowsBinary([], [], wrong), target), /CPU/);
    assert.throws(() => inspectWindowsImports(Buffer.alloc(10), target), {
      name: "AssertionError",
    });
  }
});

test("Windows CRT records exact binary evidence and rejects normal or delayed VC dependencies", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ziwei-crt-contract-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "addon.node");
  writeFileSync(path, windowsBinary(["VCRUNTIME140.dll"], [], 0xaa64));
  assert.throws(() => recordWindowsCrt("dynamic", path, directory), /CPU 不匹配/);
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

function fixture(
  t: TestContext,
  alterBinary: (binary: Buffer) => Buffer = (binary) => binary,
  kind: "gnu" | "macos" | "windows" = "gnu",
) {
  const directory = mkdtempSync(join(tmpdir(), "ziwei-compatibility-contract-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const source = JSON.parse(readFileSync(join(root, "packages/ziwei/package.json"), "utf8"));
  const digest = (bytes: Buffer) => ({
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  const platforms = source.napi.targets.map((target: string) => ({ target }));
  const binaries: Buffer[] = [];
  const targets =
    kind === "macos"
      ? ([
          ["x86_64-apple-darwin", "darwin-x64", 0x1000007],
          ["aarch64-apple-darwin", "darwin-arm64", 0x100000c],
        ] as const)
      : kind === "windows"
        ? ([
            ["x86_64-pc-windows-msvc", "win32-x64-msvc", 0x8664],
            ["aarch64-pc-windows-msvc", "win32-arm64-msvc", 0xaa64],
          ] as const)
        : ([
            ["x86_64-unknown-linux-gnu", "linux-x64-gnu", 62],
            ["aarch64-unknown-linux-gnu", "linux-arm64-gnu", 183],
          ] as const);
  for (const [target, suffix, machine] of targets) {
    const packageDirectory = join(directory, target, "package");
    mkdirSync(packageDirectory, { recursive: true });
    // Header-only bytes test the archive boundary, never real compatibility or loading.
    const binary =
      kind === "macos"
        ? macosBinary(machine === 0x100000c)
        : kind === "windows"
          ? windowsBinary(["KERNEL32.dll", "VCRUNTIME140.dll"], ["MSVCP140.dll"], machine)
          : Buffer.alloc(64);
    if (kind === "gnu") {
      binary.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
      binary.writeUInt16LE(3, 16);
      binary.writeUInt16LE(machine, 18);
    }
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

test("Windows arm64 audit and CLI report the exact sealed bytes and both import tables", (t) => {
  const { directory, batch, binaries } = fixture(t, undefined, "windows");
  const result = verifyWindowsArm64Artifact(directory);
  assert.deepEqual(result, {
    target: "aarch64-pc-windows-msvc",
    batch: batch.batch,
    bytes: binaries[1]!.length,
    sha256: createHash("sha256").update(binaries[1]!).digest("hex"),
    imports: ["KERNEL32.dll", "VCRUNTIME140.dll"],
    delayImports: ["MSVCP140.dll"],
    crtImports: ["VCRUNTIME140.dll", "MSVCP140.dll"],
  });
  const cli = join(root, "packages/ziwei/tools/compatibility.ts");
  assert.deepEqual(
    JSON.parse(
      execFileSync(process.execPath, [cli, "--windows-arm64", directory], { encoding: "utf8" }),
    ),
    result,
  );
  for (const args of [["--windows-arm64"], ["--windows-arm64", directory, "extra"]])
    assert.throws(() => execFileSync(process.execPath, [cli, ...args], { stdio: "pipe" }));
});

test("Windows arm64 audit records CRT requirements without imposing the x64 static policy", (t) => {
  const { directory } = fixture(
    t,
    () => windowsBinary(["KERNEL32.dll", "api-ms-win-crt-runtime-l1-1-0.dll"], [], 0xaa64),
    "windows",
  );
  assert.deepEqual(verifyWindowsArm64Artifact(directory).crtImports, []);
});

test("Windows arm64 audit rejects incomplete, cross-labelled or tampered artifacts", (t) => {
  const { directory, batch, save } = fixture(t, undefined, "windows");
  const original = structuredClone(batch.platforms);
  const arm64 = () =>
    batch.platforms.find((p: { target: string }) => p.target === "aarch64-pc-windows-msvc");
  for (const mutate of [
    () => {
      batch.platforms = batch.platforms.filter(
        (p: { target: string }) => p.target !== "aarch64-pc-windows-msvc",
      );
    },
    () => batch.platforms.push(arm64()),
    () => {
      arm64().tarball = "../outside.tgz";
    },
    () => {
      arm64().sha256 = "0".repeat(64);
    },
    () => {
      arm64().binaryDigest.sha256 = "0".repeat(64);
    },
  ]) {
    batch.platforms = structuredClone(original);
    mutate();
    save();
    assert.throws(() => verifyWindowsArm64Artifact(directory));
  }
  for (const machine of [0x8664, 0xa641, 0xa64e]) {
    const wrongCpu = fixture(t, () => windowsBinary(["KERNEL32.dll"], [], machine), "windows");
    assert.throws(() => verifyWindowsArm64Artifact(wrongCpu.directory), /CPU 不匹配/);
  }
  const truncated = fixture(t, (binary) => binary.subarray(0, 32), "windows");
  assert.throws(() => verifyWindowsArm64Artifact(truncated.directory), /PE 文件范围越界/);
});

test("Windows arm64 audit rejects invalid batch identity and all mismatched CI identity fields", (t) => {
  const { directory, batch, save } = fixture(t, undefined, "windows");
  const original = structuredClone(batch.batch);
  for (const field of ["commit", "runId", "runAttempt"] as const) {
    batch.batch = { ...original, [field]: "" };
    save();
    assert.throws(() => verifyWindowsArm64Artifact(directory));
  }
  batch.batch = original;
  save();
  for (const [variable, value] of [
    ["GITHUB_SHA", original.commit === "b".repeat(40) ? "c".repeat(40) : "b".repeat(40)],
    ["GITHUB_RUN_ID", `${original.runId}1`],
    ["GITHUB_RUN_ATTEMPT", `${original.runAttempt}1`],
  ])
    assert.throws(() =>
      execFileSync(
        process.execPath,
        [join(root, "packages/ziwei/tools/compatibility.ts"), "--windows-arm64", directory],
        { env: { ...process.env, [variable!]: value }, stdio: "pipe" },
      ),
    );
});

test("Windows arm64 CI gates the same cohort with minimum native Node and preserves evidence", () => {
  const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const registry = workflow
    .split("  registry-consumers:")[1]!
    .split("  windows-clean-consumer:")[0]!;
  const audit = registry
    .split("- name: Audit Windows arm64 binary from the complete cohort")[1]!
    .split("- name:")[0]!;
  const minimum = registry
    .split("- name: Windows arm64 minimum Node consumers of the same complete cohort")[1]!
    .split("- name:")[0]!;
  const evidence = registry
    .split("- name: Preserve Windows arm64 compatibility evidence")[1]!
    .split("- name:")[0]!;
  for (const step of [audit, minimum]) {
    assert.match(step, /if: matrix.target == 'aarch64-pc-windows-msvc'/);
    assert.match(step, /shell: bash/);
  }
  assert.match(registry, /os: windows-11-arm\s+target: aarch64-pc-windows-msvc/);
  assert.match(registry, /needs: node-distribution/);
  assert.match(audit, /test "\$\{#cohorts\[@\]\}" -eq 1/);
  assert.match(audit, /mise run check:node:windows-arm64 -- "\$\{cohorts\[0\]\}"/);
  assert.match(minimum, /mise install node@24\.15\.0/);
  assert.match(minimum, /mise exec node@24\.15\.0 -- node/);
  assert.match(minimum, /a.equal\(process.platform,"win32"\)/);
  assert.match(minimum, /a.equal\(process.version,"v24.15.0"\)/);
  assert.match(minimum, /a.equal\(process.arch,"arm64"\)/);
  assert.match(
    minimum,
    /mise run --tool node@24\.15\.0 check:node:registry -- "\$artifacts" 2>&1 \| tee -a/,
  );
  assert.match(evidence, /!cancelled\(\) && matrix.target == 'aarch64-pc-windows-msvc'/);
  assert.match(evidence, /name: windows-arm64-compatibility-\$\{\{ github.run_attempt \}\}/);
  assert.match(evidence, /path: target\/windows-arm64-compatibility\//);
  assert.match(evidence, /if-no-files-found: error/);
  assert.doesNotMatch(
    registry,
    /mise run (?:build:|pack:|check:node:minimum)|continue-on-error|crt-static/,
  );
  assert.match(workflow.split("  verify:")[1]!, /REGISTRY_RESULT.*needs.registry-consumers.result/);
  assert.match(workflow.split("  verify:")[1]!, /test "\$REGISTRY_RESULT" = success/);
  const mise = readFileSync(join(root, "mise.toml"), "utf8");
  assert.match(
    mise,
    /\[tasks\."check:node:windows-arm64"\][\s\S]*?compatibility\.ts --windows-arm64/,
  );
  assert.doesNotMatch(mise, /CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_RUSTFLAGS/);
});

test("macOS inspection and CLI bind both architectures to the original cohort and binary digests", (t) => {
  const { directory, batch, binaries } = fixture(t, undefined, "macos");
  const result = verifyMacosArtifacts(directory);
  assert.deepEqual(
    result.map((r) => r.target),
    ["x86_64-apple-darwin", "aarch64-apple-darwin"],
  );
  result.forEach((r, index) => {
    assert.deepEqual(r.batch, batch.batch);
    assert.equal(r.sha256, createHash("sha256").update(binaries[index]!).digest("hex"));
    assert.equal(r.bytes, binaries[index]!.length);
  });
  assert.deepEqual(
    JSON.parse(
      execFileSync(
        process.execPath,
        [join(root, "packages/ziwei/tools/compatibility.ts"), "--macos", directory],
        { encoding: "utf8" },
      ),
    ),
    result,
  );
});

test("macOS gate rejects tampered or cross-labelled artifacts even with otherwise valid metadata", (t) => {
  const { directory, batch, save } = fixture(t, undefined, "macos");
  const original = structuredClone(batch.platforms);
  for (const mutate of [
    () => batch.platforms.pop(),
    () => batch.platforms.push(batch.platforms[0]),
    () => {
      batch.platforms.find((p: { target: string }) => p.target === "x86_64-apple-darwin").tarball =
        "../outside.tgz";
    },
    () => {
      batch.platforms.find((p: { target: string }) => p.target === "x86_64-apple-darwin").sha256 =
        "0".repeat(64);
    },
    () => {
      batch.platforms.find(
        (p: { target: string }) => p.target === "x86_64-apple-darwin",
      ).binaryDigest.sha256 = "0".repeat(64);
    },
  ]) {
    batch.platforms = structuredClone(original);
    mutate();
    save();
    assert.throws(() => verifyMacosArtifacts(directory));
  }
  const wrongCpu = fixture(t, () => macosBinary(true), "macos");
  assert.throws(() => verifyMacosArtifacts(wrongCpu.directory), /CPU 不匹配/);
});

test("macOS artifact evidence requires a valid batch identity and respects the current CI commit", (t) => {
  const { directory, batch, save } = fixture(t, undefined, "macos");
  const original = structuredClone(batch.batch);
  for (const field of ["commit", "runId", "runAttempt"] as const) {
    batch.batch = { ...original, [field]: "" };
    save();
    assert.throws(() => verifyMacosArtifacts(directory));
  }
  batch.batch = original;
  save();
  assert.throws(() =>
    execFileSync(
      process.execPath,
      [join(root, "packages/ziwei/tools/compatibility.ts"), "--macos", directory],
      {
        env: {
          ...process.env,
          GITHUB_SHA: original.commit === "b".repeat(40) ? "c".repeat(40) : "b".repeat(40),
        },
        stdio: "pipe",
      },
    ),
  );
});

test("macOS CI audits and tests the downloaded cohort under the minimum Node without rebuilding", () => {
  const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const registry = workflow
    .split("  registry-consumers:")[1]!
    .split("  windows-clean-consumer:")[0]!;
  const audit = registry
    .split("- name: Audit macOS binaries from the complete cohort")[1]!
    .split("- name:")[0]!;
  const minimum = registry
    .split("- name: macOS minimum Node consumers of the same complete cohort")[1]!
    .split("- name:")[0]!;
  assert.match(audit, /if: endsWith\(matrix.target, '-apple-darwin'\)/);
  assert.match(audit, /mise run check:node:macos -- "\$\{cohorts\[0\]\}"/);
  assert.match(minimum, /if: endsWith\(matrix.target, '-apple-darwin'\)/);
  assert.match(minimum, /mise run --tool node@24\.15\.0 check:node:registry -- "\$artifacts"/);
  assert.match(minimum, /a.equal\(process.version,"v24.15.0"\)/);
  assert.match(minimum, /a.equal\(process.arch,/);
  assert.match(
    registry,
    /macos-compatibility-\$\{\{ github.run_attempt \}\}-\$\{\{ matrix.target \}\}/,
  );
  assert.doesNotMatch(registry, /mise run (?:build:|pack:|check:node:minimum)|continue-on-error/);
  const mise = readFileSync(join(root, "mise.toml"), "utf8");
  assert.match(mise, /\[tasks\."check:node:macos"\][\s\S]*?compatibility\.ts --macos/);
});

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
