import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

type CommandObservation = {
  status: number | null;
  signal: string | null;
  error?: { code?: string; message: string };
  stdout: string;
  stderr: string;
  elapsedMs: number;
};

export type DockerAttempt = CommandObservation & { attempt: number; timeoutMs: number };

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

export function redactObservation(result: CommandObservation): CommandObservation {
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

export function dockerDiagnostics() {
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
