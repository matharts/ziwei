import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { observeCommand, redactObservation } from "./windows-docker.ts";

export const windowsBaseline = {
  // Microsoft Server Core LTSC 2025 manifest list, inspected 2026-09-10 (amd64 only).
  image:
    "mcr.microsoft.com/windows/servercore@sha256:e18a49cbc074dfaa8e106296d51cebd62bbf6effb999f134a5c48eed1c2334e1",
  nodeVersion: "24.15.0",
  nodeSha256: "cc5149eabd53779ce1e7bdc5401643622d0c7e6800ade18928a767e940bb0e62",
  // OS components from both untouched containers in CI 34567870581, not added redistributables.
  systemRuntimeDlls: [
    {
      path: "C:\\Windows\\System32\\msvcp110_win.dll",
      sha256: "782e62872c751682bc220489b07db6b80820e3799416028630ad899fba113ae6",
    },
    {
      path: "C:\\Windows\\System32\\msvcp60.dll",
      sha256: "4b7d8e819274e42f4fd61a8f06ed6c8b5aaf9154a1881e2012da5a3200118b96",
    },
  ],
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

export function installVcRuntime(onProgress: (evidence: Record<string, unknown>) => void) {
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

type RuntimeInventory = { dlls: { path: string; sha256?: string }[]; developmentTools: string[] };

export function runtimeInventory(): RuntimeInventory {
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

/** Preserve the pinned OS components while rejecting added VC redistributables. */
export function verifyCleanWindowsRuntime(inventory: RuntimeInventory) {
  assert.deepEqual(inventory.developmentTools, [], "干净容器中不应存在开发工具链");
  for (const { path, sha256 } of inventory.dlls) {
    const name = path.split(/[\\/]/).at(-1)!;
    const systemDll = windowsBaseline.systemRuntimeDlls.find(
      (dll) => dll.path.split("\\").at(-1) === name.toLowerCase(),
    );
    if (systemDll) {
      assert.equal(path.toLowerCase(), systemDll.path.toLowerCase(), "系统组件路径与固定基线不符");
      assert.equal(sha256?.toLowerCase(), systemDll.sha256, "系统组件摘要与固定基线不符");
      continue;
    }
    assert.ok(
      /_clr0400\.dll$/i.test(name) ||
        !/^(?:vcruntime|msvcp|msvcr|concrt|vcomp|vcamp)\d.*\.dll$/i.test(name),
      `干净容器发现额外 VC Runtime：${path}`,
    );
  }
}
