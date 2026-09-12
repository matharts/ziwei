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

import { verifyRegistry, type RuntimeObservation } from "../test/fixtures/registry-consumer.ts";
import { dockerDiagnostics, waitForWindowsDocker, type DockerAttempt } from "./windows-docker.ts";
import {
  installVcRuntime,
  runtimeInventory,
  verifyCleanWindowsRuntime,
  verifyNodeZip,
  verifyVcRuntime,
  vcRuntime,
  windowsBaseline,
} from "./windows-runtime.ts";

const root = fileURLToPath(new URL("../../..", import.meta.url));

/** Complete source closure for the clean container; no workspace or generated dependencies. */
export const windowsContainerSources = [
  "package.json",
  "packages/ziwei/package.json",
  "packages/ziwei/tools/windows-container.ts",
  "packages/ziwei/tools/windows-runtime.ts",
  "packages/ziwei/tools/windows-docker.ts",
  "packages/ziwei/test/fixtures/registry-consumer.ts",
] as const;
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
        dlls: runtimes.flatMap((runtime) =>
          runtime.sharedObjects.map((path) => ({
            path,
            sha256: inventory.dlls.find((dll) => dll.path.toLowerCase() === path.toLowerCase())
              ?.sha256,
          })),
        ),
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
    for (const file of windowsContainerSources) {
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
