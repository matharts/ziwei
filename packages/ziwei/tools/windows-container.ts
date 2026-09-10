import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyRegistry } from "../test/fixtures/registry-consumer.ts";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const save = (path: string, value: unknown) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");

export const windowsBaseline = {
  // Microsoft Server Core LTSC 2025 manifest list, inspected 2026-09-10 (amd64 only).
  image:
    "mcr.microsoft.com/windows/servercore@sha256:e18a49cbc074dfaa8e106296d51cebd62bbf6effb999f134a5c48eed1c2334e1",
  nodeVersion: "24.15.0",
  nodeSha256: "cc5149eabd53779ce1e7bdc5401643622d0c7e6800ade18928a767e940bb0e62",
} as const;

export function verifyNodeZip(
  bytes: Buffer,
  sums: string,
  expected: { nodeVersion: string; nodeSha256: string } = windowsBaseline,
) {
  const filename = `node-v${expected.nodeVersion}-win-x64.zip`;
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest, expected.nodeSha256, "Node ZIP 与固定摘要不符");
  assert.ok(
    sums.split(/\r?\n/).some((line) => line.trim() === `${digest}  ${filename}`),
    "Node ZIP 与官方 SHASUMS256.txt 不符",
  );
  return { filename, bytes: bytes.length, sha256: digest };
}

// Bootstrap only: the container has PowerShell, but no Node or development toolchain.
export const windowsBootstrap = String.raw`
$ErrorActionPreference = 'Stop'
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Expected native AMD64 Windows' }
Expand-Archive -LiteralPath C:\input\node.zip -DestinationPath C:\runtime
$nodeRoot = 'C:\runtime\node-v${windowsBaseline.nodeVersion}-win-x64'
if (Get-ChildItem -LiteralPath $nodeRoot -Recurse -Filter *.dll) { throw 'Unexpected DLL in Node ZIP' }
$env:PATH = "$nodeRoot;$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
& "$nodeRoot\node.exe" C:\input\source\packages\ziwei\tools\windows-container.ts --inside-container
exit $LASTEXITCODE
`;

function containerName(input: string) {
  return `ziwei-windows-${createHash("sha256").update(input).digest("hex").slice(0, 16)}`;
}

export function windowsContainerArgs(input: string, output: string) {
  // Docker's --mount parser reserves commas even when argv preserves spaces.
  assert.ok(!input.includes(",") && !output.includes(","), "挂载路径不能包含逗号");
  return [
    "run",
    "--rm",
    "--name",
    containerName(input),
    "--isolation=process",
    "--mount",
    `type=bind,src=${input},dst=C:\\input,readonly`,
    "--mount",
    `type=bind,src=${output},dst=C:\\output`,
    "--env",
    "GITHUB_SHA",
    "--env",
    "GITHUB_RUN_ID",
    "--env",
    "GITHUB_RUN_ATTEMPT",
    windowsBaseline.image,
    "powershell.exe",
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    Buffer.from(windowsBootstrap, "utf16le").toString("base64"),
  ];
}

function runtimeInventory() {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$dlls = @(Get-ChildItem "$env:SystemRoot\System32" -File | Where-Object {
  $_.Name -match '^(vcruntime140.*|msvcp140.*|ucrtbase)\.dll$'
} | ForEach-Object {
  [ordered]@{ path = $_.FullName; version = $_.VersionInfo.FileVersion; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
})
$tools = @(Get-Command cl.exe,msbuild.exe,rustc.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
$system = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
[ordered]@{ architecture = $env:PROCESSOR_ARCHITECTURE; build = $system.CurrentBuild; ubr = $system.UBR; dlls = $dlls; developmentTools = $tools } | ConvertTo-Json -Depth 5 -Compress
`;
  return JSON.parse(
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      {
        encoding: "utf8",
        timeout: 30_000,
      },
    ),
  );
}

async function consumeInsideContainer() {
  const report: Record<string, unknown> = {
    passed: false,
    stage: "runtime-preflight",
    baseline: windowsBaseline,
  };
  const path = "C:\\output\\consumer.json";
  try {
    assert.equal(process.platform, "win32");
    assert.equal(process.arch, "x64");
    assert.equal(process.version, `v${windowsBaseline.nodeVersion}`);
    report.runtimeBefore = runtimeInventory();
    save(path, report);
    const pnpmVersion = readJson(join(root, "package.json")).devEngines.packageManager.version;
    report.stage = "pnpm-bootstrap";
    save(path, report);
    const npmCli = join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
    execFileSync(
      process.execPath,
      [
        npmCli,
        "install",
        "--prefix",
        "C:\\pnpm-tool",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--registry=https://registry.npmjs.org/",
        `@pnpm/exe.win32-x64@${pnpmVersion}`,
      ],
      {
        stdio: "inherit",
        timeout: 180_000,
      },
    );
    const pnpm = "C:\\pnpm-tool\\node_modules\\@pnpm\\exe.win32-x64\\pnpm.exe";
    process.env.ZIWEI_PNPM_BIN = pnpm;
    report.pnpm = {
      version: pnpmVersion,
      sha256: createHash("sha256").update(readFileSync(pnpm)).digest("hex"),
    };
    report.runtimeAfterBootstrap = runtimeInventory();
    report.stage = "registry-consumers";
    const consumers: unknown[] = [];
    report.consumers = consumers;
    save(path, report);
    await verifyRegistry("C:\\input\\cohort", (runtime) => {
      consumers.push(runtime);
      save(path, report);
    });
    report.passed = true;
    report.stage = "complete";
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    save(path, report);
  }
}

async function runContainer(directory: string, output: string) {
  assert.equal(process.platform, "win32", "此实验要求 Windows Docker 宿主");
  assert.equal(process.arch, "x64", "此实验仅覆盖原生 Windows x64");
  // Keep every run's evidence; never overwrite a prior result.
  mkdirSync(output);
  const temporary = mkdtempSync(join(tmpdir(), "ziwei-windows-container-"));
  const report: Record<string, unknown> = { passed: false, baseline: windowsBaseline };
  let started = false;
  try {
    report.stage = "docker-preflight";
    const info = JSON.parse(
      execFileSync("docker", ["info", "--format", "{{json .}}"], {
        encoding: "utf8",
        timeout: 30_000,
      }),
    );
    assert.equal(info.OSType, "windows");
    assert.equal(info.Architecture, "x86_64");
    report.host = {
      operatingSystem: info.OperatingSystem,
      kernel: info.KernelVersion,
      architecture: info.Architecture,
      docker: info.ServerVersion,
    };
    report.stage = "stage-inputs";
    for (const file of [
      "package.json",
      "packages/ziwei/package.json",
      "packages/ziwei/tools/windows-container.ts",
      "packages/ziwei/test/fixtures/registry-consumer.ts",
    ]) {
      const target = join(temporary, "source", file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(root, file), target);
    }
    mkdirSync(join(temporary, "cohort"));
    // Flat files only; the consumer verifies the full target set and all tarball hashes.
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      assert.ok(entry.isFile(), "完整批次目录必须只包含普通文件");
      copyFileSync(join(directory, entry.name), join(temporary, "cohort", entry.name));
    }
    report.batch = readJson(join(temporary, "cohort/batch.json")).batch;
    report.stage = "node-zip";
    const base = `https://nodejs.org/dist/v${windowsBaseline.nodeVersion}`;
    const download = async (url: string) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      assert.ok(response.ok, `${url}: HTTP ${response.status}`);
      return response;
    };
    const zip = Buffer.from(
      await (
        await download(`${base}/node-v${windowsBaseline.nodeVersion}-win-x64.zip`)
      ).arrayBuffer(),
    );
    const sums = await (await download(`${base}/SHASUMS256.txt`)).text();
    report.nodeZip = verifyNodeZip(zip, sums);
    writeFileSync(join(temporary, "node.zip"), zip);
    report.stage = "image-pull";
    execFileSync("docker", ["pull", windowsBaseline.image], { stdio: "inherit", timeout: 600_000 });
    const image = JSON.parse(
      execFileSync("docker", ["image", "inspect", windowsBaseline.image], {
        encoding: "utf8",
        timeout: 30_000,
      }),
    )[0];
    assert.equal(image.Os, "windows");
    assert.equal(image.Architecture, "amd64");
    report.image = { id: image.Id, digests: image.RepoDigests, osVersion: image.OsVersion };
    report.stage = "container";
    const stdout = openSync(join(output, "container.stdout.log"), "wx");
    const stderr = openSync(join(output, "container.stderr.log"), "wx");
    try {
      started = true;
      const result = spawnSync("docker", windowsContainerArgs(temporary, output), {
        stdio: ["ignore", stdout, stderr],
        timeout: 600_000,
      });
      report.exit = { status: result.status, signal: result.signal, error: result.error?.message };
      assert.ok(!result.error && result.status === 0, "Windows 容器验收失败，请查看保留的日志");
    } finally {
      closeSync(stdout);
      closeSync(stderr);
    }
    assert.equal(readJson(join(output, "consumer.json")).passed, true, "缺少成功的消费端报告");
    report.passed = true;
    report.stage = "complete";
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    if (started) {
      // A timed-out Docker client can leave its container alive. Target only this run.
      const cleanup = spawnSync("docker", ["rm", "--force", containerName(temporary)], {
        stdio: "ignore",
        timeout: 30_000,
      });
      // A nonzero status can also mean --rm already removed a finished container.
      report.cleanup = {
        status: cleanup.status,
        signal: cleanup.signal,
        error: cleanup.error?.message,
      };
    }
    save(join(output, "experiment.json"), report);
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  if (process.argv[2] === "--inside-container") await consumeInsideContainer();
  else {
    const [directory, output] = process.argv.slice(2);
    assert.ok(directory && output, "需要完整批次目录和新的结果目录");
    await runContainer(resolve(directory), resolve(output));
  }
}
