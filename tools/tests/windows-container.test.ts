import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { test } from "@rstest/core";

import {
  dockerDiagnosticsScript,
  observeCommand,
  redactDiagnostic,
  verifyCleanWindowsRuntime,
  verifyWindowsConsumers,
  verifyNodeZip,
  verifyVcRuntime,
  verifyVcRuntimeSignature,
  verifyWindowsScenarios,
  vcRuntime,
  vcRuntimeInstallArgs,
  waitForWindowsDocker,
  windowsBaseline,
  windowsBootstrap,
  windowsContainerArgs,
  windowsScenarios,
} from "../../packages/ziwei/tools/windows-container.ts";

test("Clean npm rejects ordinary VC runtime DLLs and development tools", () => {
  const clean = {
    developmentTools: [],
    dlls: [
      { path: "C:\\Windows\\System32\\ucrtbase.dll" },
      { path: "C:\\Windows\\System32\\vcruntime140_clr0400.dll" },
    ],
  };
  verifyCleanWindowsRuntime(clean);
  assert.throws(
    () => verifyCleanWindowsRuntime({ ...clean, developmentTools: ["cl.exe"] }),
    /开发工具链/,
  );
  for (const name of ["VCRUNTIME140.dll", "vcruntime140_1.dll", "MSVCP140.dll", "concrt140.dll"]) {
    assert.throws(
      () => verifyCleanWindowsRuntime({ ...clean, dlls: [{ path: `C:\\runtime\\${name}` }] }),
      /额外 VC Runtime/,
    );
  }
});

test("Windows consumer selection cannot pass with an empty or duplicated manager list", async () => {
  for (const managers of [[], ["npm", "npm"]] as const) {
    await assert.rejects(
      verifyWindowsConsumers(
        "unused",
        () => assert.fail(),
        () => assert.fail(),
        managers,
      ),
      /非空且不重复/,
    );
  }
});

test("Pinned Server Core system libraries are accepted only at their recorded path and hash", () => {
  // Both fresh containers in CI 34567870581 contained these OS-shipped files before installation.
  const dlls = [
    {
      path: "C:\\Windows\\System32\\msvcp110_win.dll",
      sha256: "782E62872C751682BC220489B07DB6B80820E3799416028630AD899FBA113AE6",
    },
    {
      path: "C:\\Windows\\System32\\msvcp60.dll",
      sha256: "4B7D8E819274E42F4FD61A8F06ED6C8B5AAF9154A1881E2012DA5A3200118B96",
    },
  ];
  verifyCleanWindowsRuntime({ developmentTools: [], dlls });
  for (const dll of dlls) {
    for (const changed of [
      { ...dll, sha256: "0".repeat(64) },
      { ...dll, sha256: undefined },
      { ...dll, path: dll.path.replace("System32", "Temp") },
    ])
      assert.throws(() => verifyCleanWindowsRuntime({ developmentTools: [], dlls: [changed] }));
  }
});

test("VC Runtime material is pinned and its signature must belong to Microsoft", () => {
  assert.equal(new URL(vcRuntime.url).hostname, "download.visualstudio.microsoft.com");
  assert.match(vcRuntime.sha256, /^[a-f0-9]{64}$/);
  const bytes = Buffer.from("installer checksum fixture");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(verifyVcRuntime(bytes, sha256).sha256, sha256);
  assert.throws(() => verifyVcRuntime(Buffer.from("changed"), sha256), /固定摘要/);
  assert.throws(() => verifyVcRuntime(bytes), /固定摘要/);
  const signature = {
    status: "Valid",
    subject: "CN=Microsoft Corporation, O=Microsoft Corporation, C=US",
    version: vcRuntime.version,
  };
  verifyVcRuntimeSignature(signature);
  for (const invalid of [
    { ...signature, status: "NotSigned" },
    { ...signature, status: "HashMismatch" },
    { ...signature, subject: "CN=Example, O=Microsoft Corporation" },
    { ...signature, version: "0.0.0.0" },
  ])
    assert.throws(() => verifyVcRuntimeSignature(invalid));
  assert.deepEqual(vcRuntimeInstallArgs, [
    "/install",
    "/quiet",
    "/norestart",
    "/log",
    "C:\\output\\vc-runtime-install.log",
  ]);
});

test("Runtime comparison finishes treatment after a failed baseline without passing the gate", async () => {
  const calls: string[] = [];
  const records: string[] = [];
  await assert.rejects(
    verifyWindowsScenarios(
      true,
      async (scenario) => {
        calls.push(scenario);
        return scenario === "vc-runtime";
      },
      (checks) => records.push(JSON.stringify(checks)),
    ),
    /Windows 容器验收失败/,
  );
  assert.deepEqual(calls, ["baseline", "vc-runtime"]);
  assert.deepEqual(JSON.parse(records.at(-1)!), [
    { name: "baseline", passed: false },
    { name: "vc-runtime", passed: true },
  ]);
});

test("Runtime comparison retains startup failures and never skips the other scenario", async () => {
  const calls: string[] = [];
  const records: string[] = [];
  await assert.rejects(
    verifyWindowsScenarios(
      true,
      async (scenario) => {
        calls.push(scenario);
        if (scenario === "baseline") throw new Error("container fixture failure");
        return false;
      },
      (checks) => records.push(JSON.stringify(checks)),
    ),
    /Windows 容器验收失败/,
  );
  assert.deepEqual(calls, ["baseline", "vc-runtime"]);
  assert.match(records.at(-1)!, /container fixture failure/);
  assert.equal(JSON.parse(records.at(-1)!)[1].passed, false);
});

test("Acceptance requires clean npm and runtime-equipped pnpm, with neither path optional", async () => {
  assert.deepEqual(windowsScenarios, {
    "npm-clean": { withVcRuntime: false, managers: ["npm"] },
    "pnpm-runtime": { withVcRuntime: true, managers: ["pnpm"] },
    baseline: { withVcRuntime: false, managers: ["npm", "pnpm"] },
    "vc-runtime": { withVcRuntime: true, managers: ["npm", "pnpm"] },
  });
  const calls: string[] = [];
  await verifyWindowsScenarios(
    false,
    async (scenario) => {
      calls.push(scenario);
      return true;
    },
    () => {},
  );
  assert.deepEqual(calls, ["npm-clean", "pnpm-runtime"]);
  for (const failure of calls) {
    const visited: string[] = [];
    await assert.rejects(
      verifyWindowsScenarios(
        false,
        async (scenario) => {
          visited.push(scenario);
          if (scenario === failure) throw new Error("consumer failed");
          return true;
        },
        () => {},
      ),
      /Windows 容器验收失败/,
    );
    assert.deepEqual(visited, calls);
  }
  await assert.rejects(
    verifyWindowsScenarios(
      true,
      async (scenario) => scenario === "baseline",
      () => {},
    ),
  );
  await verifyWindowsScenarios(
    true,
    async () => true,
    () => {},
  );
});

test("Comparison containers share the baseline image but have distinct state and output", () => {
  const baseline = windowsContainerArgs("C:\\input", "C:\\results\\baseline", "baseline");
  const treatment = windowsContainerArgs("C:\\input", "C:\\results\\vc-runtime", "vc-runtime");
  assert.ok(baseline.includes(windowsBaseline.image));
  assert.ok(treatment.includes(windowsBaseline.image));
  assert.notEqual(
    baseline[baseline.indexOf("--name") + 1],
    treatment[treatment.indexOf("--name") + 1],
  );
  assert.match(
    Buffer.from(baseline.at(-1)!, "base64").toString("utf16le"),
    /--inside-container baseline/,
  );
  assert.match(
    Buffer.from(treatment.at(-1)!, "base64").toString("utf16le"),
    /--inside-container vc-runtime/,
  );
});

const ready = {
  status: 0,
  signal: null,
  stdout: JSON.stringify({ OSType: "windows", Architecture: "x86_64", ServerVersion: "fixture" }),
  stderr: "",
  elapsedMs: 1,
};
const timedOut = {
  status: null,
  signal: "SIGTERM",
  stdout: "",
  stderr: "",
  elapsedMs: 10_000,
  error: { code: "ETIMEDOUT", message: "spawnSync docker ETIMEDOUT" },
};

test("Docker readiness preserves an initial timeout and accepts later readiness", async () => {
  let calls = 0;
  let clock = 0;
  const attempts: unknown[] = [];
  const host = await waitForWindowsDocker((attempt) => attempts.push(attempt), {
    probe: () => (++calls === 1 ? timedOut : ready),
    now: () => clock,
    pause: async (ms) => {
      clock += ms;
    },
  });
  assert.equal(host.OSType, "windows");
  assert.equal(calls, 2);
  assert.equal(attempts.length, 2);
});

test("Docker readiness parses real command data before redacting report text", async () => {
  const info = {
    OSType: "windows",
    Architecture: "x86_64",
    Plugins: { Authorization: null },
    diagnostic: "token=fixture-secret",
  };
  const records: string[] = [];
  const host = await waitForWindowsDocker((attempt) => records.push(JSON.stringify(attempt)), {
    probe: () =>
      observeCommand(
        process.execPath,
        ["--eval", `process.stdout.write(${JSON.stringify(JSON.stringify(info))})`],
        5_000,
      ),
  });
  assert.equal(host.OSType, "windows");
  assert.equal(host.Plugins.Authorization, null);
  assert.equal(records.length, 1);
  assert.doesNotMatch(records[0]!, /fixture-secret/);
});

test("Docker readiness bounds the whole wait and clips the final probe to the remaining time", async () => {
  let clock = 0;
  const limits: number[] = [];
  const attempts: unknown[] = [];
  await assert.rejects(
    waitForWindowsDocker((attempt) => attempts.push(attempt), {
      probe: (timeoutMs) => {
        limits.push(timeoutMs);
        clock += timeoutMs;
        return { ...timedOut, elapsedMs: timeoutMs };
      },
      now: () => clock,
      pause: async (ms) => {
        clock += ms;
      },
    }),
    /120 秒内未就绪/,
  );
  assert.equal(clock, 120_000);
  assert.equal(attempts.length, 10);
  assert.ok(limits.every((limit) => limit > 0 && limit <= 10_000));

  clock = 0;
  limits.length = 0;
  await assert.rejects(
    waitForWindowsDocker(() => {}, {
      probe: (timeoutMs) => {
        limits.push(timeoutMs);
        clock += Math.min(timeoutMs, 8_500);
        return timedOut;
      },
      now: () => clock,
      pause: async (ms) => {
        clock += ms;
      },
    }),
    /120 秒内未就绪/,
  );
  assert.equal(clock, 120_000);
  assert.equal(limits.at(-1), 4_500);
});

test.each([
  {
    name: "missing executable",
    response: { ...timedOut, error: { code: "ENOENT", message: "missing docker" } },
    expected: /找不到 docker/,
  },
  {
    name: "oversized output",
    response: { ...timedOut, error: { code: "ENOBUFS", message: "buffer full" } },
    expected: /输出超出限制/,
  },
  {
    name: "wrong OS",
    response: { ...ready, stdout: JSON.stringify({ OSType: "linux", Architecture: "x86_64" }) },
    expected: /Windows Docker/,
  },
  {
    name: "wrong architecture",
    response: { ...ready, stdout: JSON.stringify({ OSType: "windows", Architecture: "aarch64" }) },
    expected: /x64 Docker/,
  },
  { name: "invalid JSON", response: { ...ready, stdout: "not JSON" }, expected: /JSON/ },
])("Docker readiness fails immediately for $name", async ({ response, expected }) => {
  let calls = 0;
  let observations = 0;
  await assert.rejects(
    waitForWindowsDocker(() => observations++, {
      probe: () => {
        calls++;
        return response;
      },
      pause: async () => {
        assert.fail("permanent failures must not retry");
      },
    }),
    expected,
  );
  assert.equal(calls, 1);
  assert.equal(observations, 1);
});

test("Command capture preserves failures and timeouts separately from diagnostic redaction", () => {
  const failure = observeCommand(
    process.execPath,
    ["--eval", 'process.stderr.write("token=fixture-secret"); process.exit(7)'],
    5_000,
  );
  assert.equal(failure.status, 7);
  assert.equal(failure.stderr, "token=fixture-secret");
  assert.equal(redactDiagnostic(failure.stderr), "token=<REDACTED>");
  const timeout = observeCommand(process.execPath, ["--eval", "setInterval(() => {}, 1000)"], 150);
  assert.equal(timeout.error?.code, "ETIMEDOUT");
  assert.notEqual(timeout.status, 0);
  assert.ok(timeout.elapsedMs >= 100 && timeout.elapsedMs < 5_000);
  assert.equal(
    redactDiagnostic("https://user:pass@example.com:2376/path?token=secret#fragment"),
    "https://example.com:2376/path",
  );
  assert.doesNotMatch(
    redactDiagnostic('Authorization: Bearer abc123 password="private"'),
    /abc123|private/,
  );
});

test("Docker host diagnosis is read-only and queries only targeted service and event sources", () => {
  assert.match(dockerDiagnosticsScript, /'docker', 'hns', 'vmcompute'/);
  assert.match(dockerDiagnosticsScript, /Get-Process -Name dockerd/);
  assert.match(dockerDiagnosticsScript, /ProviderName = 'docker'/);
  assert.match(dockerDiagnosticsScript, /-MaxEvents 30/);
  assert.doesNotMatch(
    dockerDiagnosticsScript,
    /(?:Start|Restart|Stop|Set)-Service|CommandLine|Get-ChildItem Env:/,
  );
});

if (process.platform === "win32") {
  test("Windows Docker diagnostic script returns service, process and event evidence", () => {
    // Validate the script output independently of the production 10-second collection budget.
    // Cold PowerShell startup and event-log queries can take longer on shared Windows runners.
    const result = observeCommand(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(dockerDiagnosticsScript, "utf16le").toString("base64"),
      ],
      30_000,
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const evidence = JSON.parse(result.stdout);
    assert.deepEqual(
      evidence.services.map((service: { name: string }) => service.name),
      ["docker", "hns", "vmcompute"],
    );
    assert.ok(Array.isArray(evidence.processes));
    assert.ok(Array.isArray(evidence.events));
  });
}

test("Windows experiment pins its image and keeps Node aligned with the consumer minimum", () => {
  const source = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../packages/ziwei/package.json", import.meta.url)),
      "utf8",
    ),
  );
  assert.equal(source.engines.node, `>=${windowsBaseline.nodeVersion}`);
  assert.match(
    windowsBaseline.image,
    /^mcr\.microsoft\.com\/windows\/servercore@sha256:[a-f0-9]{64}$/,
  );
  assert.match(windowsBaseline.nodeSha256, /^[a-f0-9]{64}$/);
});

test("Node material must match both the fixed digest and the exact official filename", () => {
  // Synthetic bytes exercise the checker, not Windows binary compatibility.
  const bytes = Buffer.from("checksum fixture");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const expected = { nodeVersion: "24.15.0", nodeSha256: sha256 };
  const filename = "node-v24.15.0-win-x64.zip";
  assert.deepEqual(verifyNodeZip(bytes, `${sha256}  ${filename}\r\n`, expected), {
    filename,
    bytes: bytes.length,
    sha256,
  });
  assert.throws(() => verifyNodeZip(bytes, "", expected), /官方 SHASUMS/);
  assert.throws(
    () => verifyNodeZip(bytes, `${sha256}  node-v24.15.0-win-arm64.zip`, expected),
    /官方 SHASUMS/,
  );
  assert.throws(
    () => verifyNodeZip(Buffer.from("changed"), `${sha256}  ${filename}`, expected),
    /固定摘要/,
  );
  assert.throws(() => verifyNodeZip(bytes, `${sha256}  ${filename}`), /固定摘要/);
});

test("Docker receives isolated input, separate output and only the cohort environment", () => {
  const input = "C:\\temp\\input with spaces";
  const output = "C:\\temp\\results with spaces";
  const args = windowsContainerArgs(input, output);
  assert.equal(args[0], "run");
  assert.ok(args.includes("--isolation=process"));
  assert.ok(args.includes(`type=bind,src=${input},dst=C:\\input,readonly`));
  assert.ok(args.includes(`type=bind,src=${output},dst=C:\\output`));
  assert.equal(args.filter((arg) => arg.startsWith("type=bind,")).length, 2);
  assert.deepEqual(
    args.flatMap((arg, index) => (arg === "--env" ? [args[index + 1]] : [])),
    ["GITHUB_SHA", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"],
  );
  assert.ok(args.includes(windowsBaseline.image));
  assert.equal(Buffer.from(args.at(-1)!, "base64").toString("utf16le"), windowsBootstrap);
  assert.match(windowsBootstrap, /exit \$LASTEXITCODE/);
  assert.throws(() => windowsContainerArgs("C:\\a,b", output), /逗号/);
  assert.throws(() => windowsContainerArgs(input, "C:\\a,b"), /逗号/);
});

test("Windows acceptance failures are retained and cannot bypass the final CI check", () => {
  const workflow = readFileSync(
    fileURLToPath(new URL("../../.github/workflows/ci.yml", import.meta.url)),
    "utf8",
  );
  const job = workflow.split("  windows-clean-consumer:\n")[1]!.split("\n  quality:")[0]!;
  assert.match(job, /needs: node-distribution/);
  assert.match(job, /runs-on: windows-2025/);
  assert.match(job, /mise run check:node:windows -- /);
  assert.doesNotMatch(job, /--compare-vc-runtime/);
  assert.match(job, /name: node-distribution-\$\{\{ github\.run_attempt \}\}/);
  assert.match(job, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.doesNotMatch(job, /continue-on-error/);
  assert.match(workflow, /needs: \[.*windows-clean-consumer\]/);
  assert.match(workflow, /test "\$WINDOWS_CLEAN_RESULT" = success/);
});
