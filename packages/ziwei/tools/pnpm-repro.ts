import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { release, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  candidateImage,
  candidateRuntimes,
  runCandidateCommand,
  verifyDownload,
} from "./candidate-runtime.ts";

export const pnpmReproVersion = "12.4.1";
export const pnpmComparisons = {
  baseline: {
    version: pnpmReproVersion,
    integrity: candidateRuntimes["powerpc64le-unknown-linux-gnu"].pnpmIntegrity,
    binarySha256: "5e75d665ebf2d22a42ef136adcfc4822c939b060cad7cd0da9c6ccef77931b8f",
  },
  comparison: {
    version: "12.4.0",
    integrity:
      "7shJ4WytyvBEdjrbIDqx2gDAH7sr0HBDooTmnNQ7DlzcLeeGi7Yqir7gJjOTm6s9S1cVnT56IwmqnnwQMP1HTQ==",
    binarySha256: "c388a29f3bc6a25dd0806dcbdd47c489efda6f306e3d0724ede1be5066de0d1a",
  },
} as const;

export function pnpmComparison(value: string) {
  assert.ok(value === "baseline" || value === "comparison", "未知 pnpm 对照组");
  return pnpmComparisons[value];
}

// Official deploy images, resolved on 2026-09-12. These are diagnostic pins only.
export const qemuComparisons = {
  baseline: {
    version: "10.2.3",
    image:
      "tonistiigi/binfmt@sha256:400a4873b838d1b89194d982c45e5fb3cda4593fbfd7e08a02e76b03b21166f0",
  },
  comparison: {
    version: "10.2.1",
    image:
      "tonistiigi/binfmt@sha256:d3b963f787999e6c0219a48dba02978769286ff61a5f4d26245cb6a6e5567ea3",
  },
} as const;

export function qemuComparison(value: string) {
  assert.ok(value === "baseline" || value === "comparison", "未知 QEMU 对照组");
  return qemuComparisons[value];
}

export function verifyQemuVersion(stdout: string, expected: string) {
  assert.equal(
    /^qemu-ppc64le version (\d+\.\d+\.\d+)(?:\s|$)/m.exec(stdout)?.[1],
    expected,
    "QEMU 实际版本与对照组不一致",
  );
}

export function pnpmReproArgs(name: string, binary: string, trace: boolean) {
  assert.ok(!binary.includes(","), "Docker 挂载路径不可包含逗号");
  return [
    "run",
    "--name",
    name,
    "--platform",
    "linux/ppc64le",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--memory",
    "4g",
    "--pids-limit",
    "256",
    "--tmpfs",
    "/tmp:rw,exec,size=1g",
    "--user",
    `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    "--mount",
    `type=bind,src=${resolve(binary)},dst=/runtime/pnpm,readonly`,
    "--env",
    "HOME=/tmp",
    ...(trace ? ["--env", "QEMU_STRACE=1"] : []),
    "--workdir",
    "/tmp",
    "--entrypoint",
    "/runtime/pnpm",
    candidateImage,
    "--version",
  ];
}

export function classifyPnpmProbe(
  result: {
    code: number | string | null;
    signal: string | null;
    stdout: string;
    stderr: string;
  },
  expectedVersion: string = pnpmReproVersion,
) {
  if (result.code === 0 && result.signal === null && result.stdout.trim() === expectedVersion)
    return "passed";
  if (/qemu: uncaught target signal 11 \(Segmentation fault\)/.test(result.stderr))
    return "qemu-sigsegv";
  if (result.signal === "SIGKILL") return "deadline-or-kill";
  return "failed";
}

export async function runPnpmRepro(output: string, qemu?: string, pnpm = "baseline") {
  const selectedQemu = qemu === undefined ? undefined : qemuComparison(qemu);
  const selectedPnpm = pnpmComparison(pnpm);
  assert.ok(pnpm === "baseline" || qemu === "baseline", "pnpm 对照必须固定基线 QEMU");
  const archiveUrl = `https://registry.npmjs.org/@pnpm/exe.linux-ppc64/-/exe.linux-ppc64-${selectedPnpm.version}.tgz`;
  assert.equal(process.platform, "linux", "复现要求 Linux x64 Docker/QEMU 宿主");
  assert.equal(process.arch, "x64", "复现要求 Linux x64 Docker/QEMU 宿主");
  mkdirSync(output); // Never overwrite previous evidence.
  const temporary = mkdtempSync(join(tmpdir(), "pnpm-repro-"));
  const report: Record<string, unknown> = {
    kind: "pnpm-startup-diagnostic",
    passed: false,
    image: candidateImage,
    archiveUrl,
    sha: process.env.GITHUB_SHA ?? null,
    run: process.env.GITHUB_RUN_ID ?? null,
    attempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    hostKernel: release(),
    qemuGroup: qemu ?? null,
    pnpmGroup: pnpm,
    pnpmVersion: selectedPnpm.version,
    probes: [],
  };
  const save = () =>
    writeFileSync(join(output, "experiment.json"), JSON.stringify(report, null, 2) + "\n");
  save();
  try {
    const info = await runCandidateCommand(
      "docker",
      ["info", "--format", "{{.OSType}}/{{.Architecture}}"],
      { timeout: 10_000 },
    );
    assert.match(info.stdout.trim(), /^linux\/(x86_64|amd64)$/);
    report.docker = info.stdout.trim();
    if (selectedQemu) {
      const version = await runCandidateCommand(
        "docker",
        [
          "run",
          "--rm",
          "--platform",
          "linux/amd64",
          "--network",
          "none",
          "--read-only",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges",
          "--entrypoint",
          "/usr/bin/qemu-ppc64le",
          selectedQemu.image,
          "--version",
        ],
        { timeout: 15_000 },
      );
      report.qemu = {
        ...selectedQemu,
        stdout: version.stdout,
        stderr: version.stderr,
        registration: readFileSync("/proc/sys/fs/binfmt_misc/qemu-ppc64le", "utf8"),
      };
      save();
      verifyQemuVersion(version.stdout, selectedQemu.version);
    }
    const response = await fetch(archiveUrl, { signal: AbortSignal.timeout(120_000) });
    assert.ok(response.ok && response.body, "pnpm 下载失败");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      assert.ok(size <= 128 * 1024 * 1024, "pnpm 下载超出大小上限");
      chunks.push(Buffer.from(chunk));
    }
    const archive = Buffer.concat(chunks);
    report.archiveSha256 = verifyDownload(archive, selectedPnpm.integrity, "sha512");
    const binary = execFileSync("tar", ["-xzOf", "-", "package/pnpm"], {
      input: archive,
      timeout: 30_000,
      maxBuffer: 128 * 1024 * 1024,
    });
    report.binarySha256 = verifyDownload(binary, selectedPnpm.binarySha256, "sha256");
    const binaryPath = join(temporary, "pnpm");
    writeFileSync(binaryPath, binary);
    chmodSync(binaryPath, 0o755);
    await runCandidateCommand("docker", ["pull", "--platform", "linux/ppc64le", candidateImage], {
      timeout: 180_000,
    });
    report.imageInspect = JSON.parse(
      (
        await runCandidateCommand("docker", ["image", "inspect", candidateImage], {
          timeout: 10_000,
        })
      ).stdout,
    );
    const probes: Array<{ outcome: string; cleanup: string }> = [];
    report.probes = probes;
    for (const trace of [false, true]) {
      const name = `pnpm-repro-${randomUUID()}`;
      const args = pnpmReproArgs(name, binaryPath, trace);
      const probe = {
        trace,
        args,
        code: null as number | string | null,
        signal: null as string | null,
        stdout: "",
        stderr: "",
        outcome: "pending",
        cleanup: "pending",
      };
      probes.push(probe);
      save();
      console.log(`pnpm repro: ${trace ? "traced" : "plain"}`);
      try {
        Object.assign(
          probe,
          await runCandidateCommand("docker", args, { timeout: 30_000, maxBuffer: 1024 * 1024 }),
          { code: 0 },
        );
      } catch (error) {
        const failure = error as Error & {
          code?: number | string;
          signal?: string;
          stdout?: string;
          stderr?: string;
        };
        Object.assign(probe, {
          code: failure.code ?? null,
          signal: failure.signal ?? null,
          stdout: failure.stdout ?? "",
          stderr: failure.stderr ?? failure.message,
        });
      } finally {
        probe.outcome = classifyPnpmProbe(probe, selectedPnpm.version);
        save();
        try {
          await runCandidateCommand("docker", ["rm", "--force", name], { timeout: 15_000 });
          probe.cleanup = "removed";
        } catch (error) {
          probe.cleanup = `failed: ${String(error)}`;
        }
        save();
      }
    }
    assert.ok(
      probes.every((probe) => probe.outcome === "passed" && probe.cleanup === "removed"),
      "pnpm 启动复现失败；详见 experiment.json",
    );
    report.passed = true;
  } catch (error) {
    report.error = String(error);
    throw error;
  } finally {
    save();
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { output: { type: "string" }, qemu: { type: "string" }, pnpm: { type: "string" } },
  });
  assert.ok(values.output, "需要 --output 新结果目录");
  await runPnpmRepro(resolve(values.output), values.qemu, values.pnpm);
}
