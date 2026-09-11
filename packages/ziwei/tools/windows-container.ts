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
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { verifyRegistry, type RuntimeObservation } from "../test/fixtures/registry-consumer.ts";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const save = (path: string, value: unknown) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");

// Normal acceptance separates product requirements from package-manager prerequisites.
// The original two-manager comparison remains available as an explicit diagnostic.
export const windowsScenarios = {
  "npm-clean": { withVcRuntime: false, managers: ["npm"] },
  "pnpm-runtime": { withVcRuntime: true, managers: ["pnpm"] },
  baseline: { withVcRuntime: false, managers: ["npm", "pnpm"] },
  "vc-runtime": { withVcRuntime: true, managers: ["npm", "pnpm"] },
} as const;
type WindowsScenario = keyof typeof windowsScenarios;

export const windowsBaseline = {
  // Microsoft Server Core LTSC 2025 manifest list, inspected 2026-09-10 (amd64 only).
  image:
    "mcr.microsoft.com/windows/servercore@sha256:e18a49cbc074dfaa8e106296d51cebd62bbf6effb999f134a5c48eed1c2334e1",
  nodeVersion: "24.15.0",
  nodeSha256: "cc5149eabd53779ce1e7bdc5401643622d0c7e6800ade18928a767e940bb0e62",
} as const;

export const vcRuntime = {
  // Resolved from Microsoft's documented vc14 x64 permalink on 2026-09-11.
  url: "https://download.visualstudio.microsoft.com/download/pr/ebdab8e5-1d7b-4d9f-a11b-cbb1720c3b12/843068991DAAA1F73AD9F6239BCE4D0F6A07A51F18C37EA2A867E9BECA71295C/VC_redist.x64.exe",
  version: "14.51.36247.0",
  sha256: "843068991daaa1f73ad9f6239bce4d0f6a07a51f18c37ea2a867e9beca71295c",
} as const;

export const vcRuntimeInstallArgs = [
  "/install",
  "/quiet",
  "/norestart",
  "/log",
  "C:\\output\\vc-runtime-install.log",
] as const;

export function verifyVcRuntime(bytes: Buffer, expectedSha256: string = vcRuntime.sha256) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha256, expectedSha256, "VC Runtime 安装器与固定摘要不符");
  return { bytes: bytes.length, sha256 };
}

export function verifyVcRuntimeSignature(signature: {
  status: string;
  subject: string;
  version: string;
}) {
  assert.equal(signature.status, "Valid", "VC Runtime 安装器签名无效");
  assert.match(
    signature.subject,
    /(?:^|,\s*)CN=Microsoft Corporation(?:,|$)/,
    "安装器必须由 Microsoft Corporation 签名",
  );
  assert.equal(signature.version, vcRuntime.version, "VC Runtime 安装器版本不符");
}

function installVcRuntime(onProgress: (evidence: Record<string, unknown>) => void) {
  const installer = "C:\\input\\vc_redist.x64.exe";
  const evidence: Record<string, unknown> = {
    ...vcRuntime,
    ...verifyVcRuntime(readFileSync(installer)),
  };
  onProgress(evidence);
  const script = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$path = 'C:\input\vc_redist.x64.exe'
$signature = Get-AuthenticodeSignature -LiteralPath $path
[ordered]@{
  status = [string]$signature.Status
  subject = $signature.SignerCertificate.Subject
  thumbprint = $signature.SignerCertificate.Thumbprint
  version = (Get-Item -LiteralPath $path).VersionInfo.FileVersion
} | ConvertTo-Json -Compress
`;
  const result = observeCommand(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    30_000,
  );
  evidence.verification = redactObservation(result);
  onProgress(evidence);
  assert.ok(!result.error && result.status === 0, "无法验证 VC Runtime 安装器签名");
  const signature = JSON.parse(result.stdout);
  evidence.signature = signature;
  onProgress(evidence);
  verifyVcRuntimeSignature(signature);
  const installation = observeCommand(installer, vcRuntimeInstallArgs, 180_000);
  evidence.installation = redactObservation(installation);
  evidence.rebootRequired = installation.status === 3010;
  onProgress(evidence);
  assert.ok(
    !installation.error && (installation.status === 0 || installation.status === 3010),
    "VC Runtime 安装失败",
  );
}

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
& "$nodeRoot\node.exe" C:\input\source\packages\ziwei\tools\windows-container.ts --inside-container npm-clean
exit $LASTEXITCODE
`;

function containerName(input: string) {
  return `ziwei-windows-${createHash("sha256").update(input).digest("hex").slice(0, 16)}`;
}

export function windowsContainerArgs(
  input: string,
  output: string,
  scenario: WindowsScenario = "npm-clean",
) {
  // Docker's --mount parser reserves commas even when argv preserves spaces.
  assert.ok(!input.includes(",") && !output.includes(","), "挂载路径不能包含逗号");
  return [
    "run",
    "--rm",
    "--name",
    containerName(output),
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
    Buffer.from(
      windowsBootstrap.replace("--inside-container npm-clean", `--inside-container ${scenario}`),
      "utf16le",
    ).toString("base64"),
  ];
}

function runtimeInventory() {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$dlls = @(Get-ChildItem "$env:SystemRoot\System32" -File | Where-Object {
  $_.Name -match '^(vcruntime\d.*|msvcp\d.*|msvcr\d.*|concrt\d.*|vcomp\d.*|vcamp\d.*|ucrtbase)\.dll$'
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

/** The pinned OS may contain CLR-specific variants, but no ordinary VC runtime. */
export function verifyCleanWindowsRuntime(inventory: {
  dlls: { path: string }[];
  developmentTools: string[];
}) {
  assert.deepEqual(inventory.developmentTools, [], "干净容器中不应存在开发工具链");
  for (const { path } of inventory.dlls) {
    const name = path.split(/[\\/]/).at(-1)!;
    assert.ok(
      /_clr0400\.dll$/i.test(name) ||
        !/^(?:vcruntime|msvcp|msvcr|concrt|vcomp|vcamp)\d.*\.dll$/i.test(name),
      `干净容器发现额外 VC Runtime：${path}`,
    );
  }
}

type ManagerCheck = {
  manager: RuntimeObservation["manager"];
  stage: "bootstrap" | "registry-consumers" | "complete";
  passed: boolean;
  runtimes: RuntimeObservation[];
  error?: { message: string; code?: unknown; status?: unknown; signal?: unknown };
};

/** Finish all selected checks before propagating any failures to the CI gate. */
export async function verifyWindowsConsumers(
  directory: string,
  preparePnpm: () => void,
  onProgress: (checks: readonly ManagerCheck[]) => void,
  managers: readonly RuntimeObservation["manager"][] = ["npm", "pnpm"],
) {
  assert.ok(
    managers.length > 0 && new Set(managers).size === managers.length,
    "需要非空且不重复的包管理器列表",
  );
  assert.ok(
    managers.every((manager) => manager === "npm" || manager === "pnpm"),
    "未知包管理器",
  );
  const checks: ManagerCheck[] = [];
  const failures: unknown[] = [];
  for (const manager of managers) {
    const check: ManagerCheck = {
      manager,
      stage: manager === "pnpm" ? "bootstrap" : "registry-consumers",
      passed: false,
      runtimes: [],
    };
    checks.push(check);
    onProgress(checks);
    try {
      if (manager === "pnpm") preparePnpm();
      check.stage = "registry-consumers";
      onProgress(checks);
      await verifyRegistry(directory, {
        managers: [manager],
        onRuntime: (runtime) => {
          check.runtimes.push(runtime);
          onProgress(checks);
        },
      });
      check.passed = true;
      check.stage = "complete";
    } catch (error) {
      check.error = {
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && {
          code: "code" in error ? error.code : undefined,
          status: "status" in error ? error.status : undefined,
          signal: "signal" in error ? error.signal : undefined,
        }),
      };
      failures.push(error);
    } finally {
      onProgress(checks);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "Windows 包管理器验收失败，详见各分支报告");
}

async function consumeInsideContainer(scenario: WindowsScenario) {
  const { withVcRuntime, managers } = windowsScenarios[scenario];
  const report: Record<string, unknown> = {
    passed: false,
    stage: "runtime-preflight",
    baseline: windowsBaseline,
    scenario,
    managers,
  };
  const path = "C:\\output\\consumer.json";
  try {
    assert.equal(process.platform, "win32");
    assert.equal(process.arch, "x64");
    assert.equal(process.version, `v${windowsBaseline.nodeVersion}`);
    const inventory = runtimeInventory();
    report.runtimeBefore = inventory;
    save(path, report);
    if (scenario === "npm-clean") verifyCleanWindowsRuntime(inventory);
    if (withVcRuntime) {
      report.stage = "vc-runtime-install";
      installVcRuntime((evidence) => {
        report.vcRuntime = evidence;
        save(path, report);
      });
      report.runtimeAfterInstall = runtimeInventory();
      save(path, report);
    }
    const preparePnpm = () => {
      const pnpmVersion = readJson(join(root, "package.json")).devEngines.packageManager.version;
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
    };
    report.stage = "registry-consumers";
    let runtimes: RuntimeObservation[] = [];
    await verifyWindowsConsumers(
      "C:\\input\\cohort",
      preparePnpm,
      (checks) => {
        report.checks = checks;
        runtimes = checks.flatMap((check) => check.runtimes);
        report.consumers = runtimes;
        save(path, report);
      },
      managers,
    );
    if (scenario === "npm-clean") {
      verifyCleanWindowsRuntime({
        dlls: runtimes.flatMap((runtime) => runtime.sharedObjects.map((path) => ({ path }))),
        developmentTools: [],
      });
    }
    report.passed = true;
    report.stage = "complete";
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    save(path, report);
  }
}

type CommandObservation = {
  status: number | null;
  signal: string | null;
  error?: { code?: string; message: string };
  stdout: string;
  stderr: string;
  elapsedMs: number;
};

type DockerAttempt = CommandObservation & { attempt: number; timeoutMs: number };

export function redactDiagnostic(text: string): string {
  for (const [key, value] of Object.entries(process.env)) {
    if (/TOKEN|PASSWORD|SECRET|AUTHORIZATION|PRIVATE_KEY/i.test(key) && value && value.length >= 8)
      text = text.replaceAll(value, "<REDACTED>");
  }
  return text
    .replace(/\b(?:https?|tcp|ssh):\/\/[^\s"'<>]+/gi, (value) => {
      try {
        const url = new URL(value);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch {
        return "<REDACTED-URL>";
      }
    })
    .replace(/\b(Bearer|Basic)\s+[a-z0-9+/_=.-]+/gi, "$1 <REDACTED>")
    .replace(
      /((?:password|passwd|token|secret|authorization|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi,
      "$1<REDACTED>",
    );
}

export function observeCommand(
  program: string,
  args: readonly string[],
  timeoutMs: number,
): CommandObservation {
  const start = performance.now();
  const result = spawnSync(program, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: 256 * 1024,
  });
  return {
    status: result.status,
    signal: result.signal,
    ...(result.error && {
      error: {
        code:
          "code" in result.error && typeof result.error.code === "string"
            ? result.error.code
            : undefined,
        message: result.error.message,
      },
    }),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    elapsedMs: Math.round(performance.now() - start),
  };
}

function redactObservation(result: CommandObservation): CommandObservation {
  return {
    ...result,
    ...(result.error && {
      error: { ...result.error, message: redactDiagnostic(result.error.message) },
    }),
    stdout: redactDiagnostic(result.stdout),
    stderr: redactDiagnostic(result.stderr),
  };
}

function observeDiagnosticCommand(program: string, args: readonly string[], timeoutMs: number) {
  return redactObservation(observeCommand(program, args, timeoutMs));
}

export async function waitForWindowsDocker(
  onAttempt: (attempt: DockerAttempt) => void,
  {
    probe = (timeoutMs: number) =>
      observeCommand("docker", ["info", "--format", "{{json .}}"], timeoutMs),
    now = () => performance.now(),
    pause = (ms: number) => delay(ms),
  } = {},
) {
  const deadline = now() + 120_000;
  let attempt = 0;
  while (now() < deadline) {
    const timeoutMs = Math.max(1, Math.floor(Math.min(10_000, deadline - now())));
    const result = probe(timeoutMs);
    // Reports contain redacted copies; parser/control flow always uses original command data.
    onAttempt({ ...redactObservation(result), attempt: ++attempt, timeoutMs });
    if (now() > deadline) break;
    if (!result.error && result.status === 0) {
      const info = JSON.parse(result.stdout);
      assert.equal(info.OSType, "windows", "要求 Windows Docker daemon");
      assert.equal(info.Architecture, "x86_64", "要求 x64 Docker daemon");
      return info;
    }
    assert.notEqual(result.error?.code, "ENOENT", "找不到 docker 可执行文件");
    assert.notEqual(result.error?.code, "ENOBUFS", "Docker 诊断输出超出限制");
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await pause(Math.min(2_000, remaining));
  }
  throw new Error("Docker 在 120 秒内未就绪，详见 dockerAttempts 与 dockerDiagnostics");
}

// Read-only host evidence. Never start/restart services or include process command lines.
export const dockerDiagnosticsScript = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$services = @('docker', 'hns', 'vmcompute' | ForEach-Object {
  $name = $_
  try {
    $service = Get-Service -Name $name -ErrorAction Stop
    [ordered]@{ name = $name; status = [string]$service.Status; startType = [string]$service.StartType }
  } catch { [ordered]@{ name = $name; error = $_.Exception.Message } }
})
$processes = @(Get-Process -Name dockerd -ErrorAction SilentlyContinue | ForEach-Object {
  $process = $_
  try { [ordered]@{ id = $process.Id; path = $process.Path; startedAt = $process.StartTime.ToUniversalTime().ToString('o') } }
  catch { [ordered]@{ id = $process.Id; error = $_.Exception.Message } }
})
$since = (Get-Date).AddMinutes(-15)
$events = @(foreach ($source in @(
  @{ LogName = 'Application'; ProviderName = 'docker'; StartTime = $since },
  @{ LogName = 'System'; ProviderName = 'Service Control Manager'; StartTime = $since }
)) {
  try {
    Get-WinEvent -FilterHashtable $source -MaxEvents 30 -ErrorAction Stop |
      Where-Object { $source.LogName -eq 'Application' -or $_.Message -match '(?i)docker|hns|vmcompute' } |
      ForEach-Object { [ordered]@{ time = $_.TimeCreated.ToUniversalTime().ToString('o'); id = $_.Id; level = $_.Level; message = $_.Message } }
  } catch { [ordered]@{ log = $source.LogName; error = $_.Exception.Message } }
})
[ordered]@{ services = $services; processes = $processes; events = $events } | ConvertTo-Json -Depth 6 -Compress
`;

function dockerDiagnostics() {
  return {
    observedAt: new Date().toISOString(),
    runnerImage: { name: process.env.ImageOS, version: process.env.ImageVersion },
    // Only connection-related settings; never dump the environment or Docker config.json.
    connection: Object.fromEntries(
      ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_API_VERSION"].map((key) => [
        key,
        process.env[key] === undefined ? null : redactDiagnostic(process.env[key]),
      ]),
    ),
    client: observeDiagnosticCommand("docker", ["--version"], 5_000),
    context: observeDiagnosticCommand("docker", ["context", "show"], 5_000),
    endpoint: observeDiagnosticCommand(
      "docker",
      ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"],
      5_000,
    ),
    host: observeDiagnosticCommand(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(dockerDiagnosticsScript, "utf16le").toString("base64"),
      ],
      10_000,
    ),
  };
}

type ScenarioCheck = { name: WindowsScenario; passed: boolean; error?: string };

/** Every selected scenario is required; a failure must not hide later evidence. */
export async function verifyWindowsScenarios(
  compareVcRuntime: boolean,
  run: (scenario: WindowsScenario) => Promise<boolean>,
  onProgress: (checks: readonly ScenarioCheck[]) => void,
) {
  const checks: ScenarioCheck[] = [];
  const scenarios: readonly WindowsScenario[] = compareVcRuntime
    ? ["baseline", "vc-runtime"]
    : ["npm-clean", "pnpm-runtime"];
  for (const scenario of scenarios) {
    const check: ScenarioCheck = { name: scenario, passed: false };
    checks.push(check);
    onProgress(checks);
    try {
      check.passed = await run(scenario);
    } catch (error) {
      check.error = error instanceof Error ? error.message : String(error);
    } finally {
      onProgress(checks);
    }
  }
  assert.ok(
    checks.every((check) => check.passed),
    "Windows 容器验收失败，请查看各组保留的报告",
  );
}

function runOneContainer(input: string, output: string, scenario: WindowsScenario) {
  const report: Record<string, unknown> = { scenario };
  const stdout = openSync(join(output, "container.stdout.log"), "wx");
  const stderr = openSync(join(output, "container.stderr.log"), "wx");
  try {
    const result = spawnSync("docker", windowsContainerArgs(input, output, scenario), {
      stdio: ["ignore", stdout, stderr],
      timeout: 600_000,
    });
    report.exit = { status: result.status, signal: result.signal, error: result.error?.message };
    assert.ok(!result.error && result.status === 0, "Windows 容器验收失败，请查看保留的日志");
    assert.equal(readJson(join(output, "consumer.json")).passed, true, "缺少成功的消费端报告");
    return true;
  } finally {
    closeSync(stdout);
    closeSync(stderr);
    // A timed-out Docker client can leave its container alive. Target only this scenario.
    const cleanup = spawnSync("docker", ["rm", "--force", containerName(output)], {
      stdio: "ignore",
      timeout: 30_000,
    });
    // A nonzero status can also mean --rm already removed a finished container.
    report.cleanup = {
      status: cleanup.status,
      signal: cleanup.signal,
      error: cleanup.error?.message,
    };
    save(join(output, "container.json"), report);
  }
}

async function runContainer(directory: string, output: string, compareVcRuntime: boolean) {
  assert.equal(process.platform, "win32", "此实验要求 Windows Docker 宿主");
  assert.equal(process.arch, "x64", "此实验仅覆盖原生 Windows x64");
  // Keep every run's evidence; never overwrite a prior result.
  mkdirSync(output);
  const temporary = mkdtempSync(join(tmpdir(), "ziwei-windows-container-"));
  const report: Record<string, unknown> = {
    passed: false,
    baseline: windowsBaseline,
    mode: compareVcRuntime ? "comparison" : "acceptance",
  };
  try {
    report.stage = "docker-preflight";
    const diagnostics: {
      before: ReturnType<typeof dockerDiagnostics>;
      after?: ReturnType<typeof dockerDiagnostics>;
    } = { before: dockerDiagnostics() };
    report.dockerDiagnostics = diagnostics;
    save(join(output, "experiment.json"), report);
    const attempts: DockerAttempt[] = [];
    report.dockerAttempts = attempts;
    const info = await waitForWindowsDocker((attempt) => {
      attempts.push(attempt);
      save(join(output, "experiment.json"), report);
    }).finally(() => {
      diagnostics.after = dockerDiagnostics();
      save(join(output, "experiment.json"), report);
    });
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
    await verifyWindowsScenarios(
      compareVcRuntime,
      async (scenario) => {
        const scenarioOutput = join(output, scenario);
        mkdirSync(scenarioOutput);
        // Download only after baseline evidence has been saved. Never execute on the host.
        if (windowsScenarios[scenario].withVcRuntime) {
          report.stage = "vc-runtime-material";
          save(join(output, "experiment.json"), report);
          const bytes = Buffer.from(await (await download(vcRuntime.url)).arrayBuffer());
          report.vcRuntime = { ...vcRuntime, ...verifyVcRuntime(bytes) };
          writeFileSync(join(temporary, "vc_redist.x64.exe"), bytes);
        }
        report.stage = "container";
        save(join(output, "experiment.json"), report);
        return runOneContainer(temporary, scenarioOutput, scenario);
      },
      (checks) => {
        report.scenarios = checks;
        save(join(output, "experiment.json"), report);
      },
    );
    report.passed = true;
    report.stage = "complete";
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    save(join(output, "experiment.json"), report);
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  if (process.argv[2] === "--inside-container") {
    const scenario = process.argv[3];
    assert.ok(
      process.argv.length === 4 && scenario && Object.hasOwn(windowsScenarios, scenario),
      "未知容器参数",
    );
    await consumeInsideContainer(scenario as WindowsScenario);
  } else {
    const [directory, output, option] = process.argv.slice(2);
    assert.ok(directory && output, "需要完整批次目录和新的结果目录");
    assert.ok(
      process.argv.length <= 5 && (!option || option === "--compare-vc-runtime"),
      "未知 Windows 实验参数",
    );
    await runContainer(resolve(directory), resolve(output), option === "--compare-vc-runtime");
  }
}
