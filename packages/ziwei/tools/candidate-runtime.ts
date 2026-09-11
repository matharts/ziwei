import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

import {
  candidateTarget,
  candidateTargets,
  currentBatch,
  digest,
  readCandidate,
  type CandidateTarget,
} from "./candidate.ts";

const execute = promisify(execFile);
export function runCandidateCommand(
  command: string,
  args: string[],
  options: { timeout: number; maxBuffer?: number },
) {
  // Docker proxies SIGTERM to its container, which may ignore it. Kill the CLI at
  // the deadline, then let the owner's finally block forcibly remove the container.
  return execute(command, args, { ...options, killSignal: "SIGKILL" });
}

const root = fileURLToPath(new URL("../../..", import.meta.url));
const save = (path: string, value: unknown) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
// Official Node minimum image supplies one identical Debian userspace for both Node versions.
// Both images/archives and pnpm metadata were resolved on 2026-09-12; no floating tags at runtime.
export const candidateImage =
  "node@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d";
export const candidateRuntimes = {
  "powerpc64le-unknown-linux-gnu": {
    pnpmIntegrity:
      "r/ab/MlIBo75oizUP5ITiziCCrnXz4SJwfErLQ+603AshB+Yq7xTMCoMtzTSCAMu6aaymIKkAFtZvd2J75Wq0w==",
    node: {
      "24.15.0": "6a6560a27bd2817013c28c3d917bfe9eebf26bbd4b1d88475190f216cc411fbb",
      "24.21.0": "1936fd64623a2f98d1fb31b456686d10c30e92639899cfefdefa8835d22adccd",
    },
  },
  "s390x-unknown-linux-gnu": {
    pnpmIntegrity:
      "nxz5zD4yXt94uzbStDk0QTPKW+aE92hH1b5tFXK9ctB1HE9Xcq1vjTiA2LsZMFC6p4gdu5OwQeFqYNAVGa6QlA==",
    node: {
      "24.15.0": "940d4cbfadf736b34519630a05d144c09f8a5aca291a802f2f559ee1562f6f24",
      "24.21.0": "2ef7e2ecbf7a6c2f3d08d106f6b2f279419c6dac89fe91b8cad193af7890082c",
    },
  },
} as const;

export function verifyDownload(bytes: Buffer, expected: string, algorithm: "sha256" | "sha512") {
  assert.equal(
    createHash(algorithm)
      .update(bytes)
      .digest(algorithm === "sha256" ? "hex" : "base64"),
    expected,
    "下载文件与固定摘要不一致",
  );
  return digest(bytes);
}

async function download(url: string, expected: string, algorithm: "sha256" | "sha512") {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  assert.ok(response.ok, `下载失败：${response.status} ${url}`);
  assert.ok(response.body);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    assert.ok(size <= 128 * 1024 * 1024, "下载文件超出大小上限");
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks);
  verifyDownload(bytes, expected, algorithm);
  return bytes;
}

export function candidateDockerArgs(input: {
  name: string;
  target: CandidateTarget;
  nodeVersion: string;
  harness: string;
  cohort: string;
  runtime: string;
  output: string;
  batch: ReturnType<typeof currentBatch>;
  mode?: "consume" | "pnpm-version" | "pnpm-version-trace";
}) {
  const platform = candidateTargets[candidateTarget(input.target)];
  const args = [
    "run",
    "--rm",
    "--name",
    input.name,
    "--platform",
    `linux/${platform.dockerArch}`,
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
  ];
  for (const [source, destination, readonly] of [
    [input.harness, "/workspace", true],
    [input.cohort, "/input", true],
    [input.runtime, "/runtime", true],
    [input.output, "/output", false],
  ] as const) {
    assert.ok(!source.includes(","), "Docker 挂载路径不可包含逗号");
    args.push(
      "--mount",
      `type=bind,src=${resolve(source)},dst=${destination}${readonly ? ",readonly" : ""}`,
    );
  }
  for (const value of [
    "HOME=/tmp",
    "PATH=/runtime/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "ZIWEI_NPM_CLI=/runtime/node/lib/node_modules/npm/bin/npm-cli.js",
    "ZIWEI_PNPM_BIN=/runtime/pnpm",
    `GITHUB_SHA=${input.batch.commit}`,
    `GITHUB_RUN_ID=${input.batch.runId}`,
    `GITHUB_RUN_ATTEMPT=${input.batch.runAttempt}`,
  ])
    args.push("--env", value);
  if (input.mode && input.mode !== "consume") {
    if (input.mode === "pnpm-version-trace") args.push("--env", "QEMU_STRACE=1");
    return [
      ...args,
      "--workdir",
      "/tmp",
      "--entrypoint",
      "/runtime/pnpm",
      candidateImage,
      "--version",
    ];
  }
  return [
    ...args,
    "--workdir",
    "/workspace",
    "--entrypoint",
    "/runtime/node/bin/node",
    candidateImage,
    "packages/ziwei/tools/candidate.ts",
    "--mode",
    "consume",
    "--target",
    input.target,
    "--input",
    "/input",
    "--output",
    "/output/consumer.json",
    "--node",
    input.nodeVersion,
  ];
}

export async function runCandidateExperiment(
  target: CandidateTarget,
  cohort: string,
  output: string,
) {
  candidateTarget(target);
  const batch = currentBatch();
  readCandidate(cohort, target, batch); // Fail before network or Docker on mixed/corrupt input.
  mkdirSync(dirname(output), { recursive: true });
  mkdirSync(output);
  const runs: Record<string, unknown>[] = [];
  const report: Record<string, unknown> = {
    verification: "emulated",
    passed: false,
    target,
    batch,
    image: candidateImage,
    receipt: digest(readFileSync(join(cohort, "candidate.json"))),
    runs,
  };
  const reportPath = join(output, "experiment.json");
  save(reportPath, report);
  const temporary = mkdtempSync(join(tmpdir(), "ziwei-candidate-runtime-"));
  const failures: unknown[] = [];
  try {
    const info = await runCandidateCommand(
      "docker",
      ["info", "--format", "{{json .OSType}} {{json .Architecture}}"],
      { timeout: 10_000 },
    );
    assert.match(
      info.stdout.trim(),
      /^"linux" "(x86_64|amd64)"$/,
      "本实验需要 Linux x64 Docker 构建机与 QEMU",
    );
    report.docker = info.stdout.trim();
    const platform = candidateTargets[target];
    await runCandidateCommand(
      "docker",
      ["pull", "--platform", `linux/${platform.dockerArch}`, candidateImage],
      { timeout: 300_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const image = JSON.parse(
      (
        await runCandidateCommand(
          "docker",
          [
            "image",
            "inspect",
            candidateImage,
            "--format",
            '{"id":{{json .Id}},"os":{{json .Os}},"architecture":{{json .Architecture}},"digests":{{json .RepoDigests}}}',
          ],
          { timeout: 10_000 },
        )
      ).stdout,
    );
    assert.equal(image.os, "linux");
    assert.equal(image.architecture, platform.dockerArch);
    assert.ok(image.digests.some((value: string) => value.endsWith(candidateImage.split("@")[1]!)));
    report.resolvedImage = image;
    const harness = join(temporary, "harness");
    const files = [
      "package.json",
      "packages/ziwei/package.json",
      "packages/ziwei/tools/candidate.ts",
      "packages/ziwei/tools/compatibility.ts",
      "packages/ziwei/test/fixtures/registry-consumer.ts",
    ];
    report.harness = Object.fromEntries(
      files.map((file) => {
        const destination = join(harness, file);
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(join(root, file), destination);
        return [file, digest(readFileSync(destination))];
      }),
    );
    const pnpmVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).devEngines
      .packageManager.version;
    assert.equal(pnpmVersion, "12.4.1", "升级 pnpm 后必须重新固定候选客户端摘要");
    const runtime = join(temporary, "runtime");
    mkdirSync(runtime);
    const pnpmUrl = `https://registry.npmjs.org/@pnpm/exe.linux-${platform.arch}/-/exe.linux-${platform.arch}-${pnpmVersion}.tgz`;
    const pnpm = await download(pnpmUrl, candidateRuntimes[target].pnpmIntegrity, "sha512");
    writeFileSync(
      join(runtime, "pnpm"),
      execFileSync("tar", ["-xOzf", "-", "package/pnpm"], {
        input: pnpm,
        timeout: 30_000,
        maxBuffer: 96 * 1024 * 1024,
      }),
    );
    chmodSync(join(runtime, "pnpm"), 0o755);
    report.pnpm = {
      version: pnpmVersion,
      url: pnpmUrl,
      archive: digest(pnpm),
      binary: digest(readFileSync(join(runtime, "pnpm"))),
    };
    for (const [nodeVersion, sha256] of Object.entries(candidateRuntimes[target].node)) {
      const nodeOutput = join(output, nodeVersion);
      mkdirSync(nodeOutput);
      const item: Record<string, unknown> = { nodeVersion, passed: false };
      runs.push(item);
      save(reportPath, report);
      const name = `ziwei-candidate-${randomUUID()}`;
      try {
        const nodeRoot = join(temporary, `node-${nodeVersion}`);
        mkdirSync(nodeRoot);
        const filename = `node-v${nodeVersion}-linux-${platform.dockerArch}.tar.xz`;
        const archive = await download(
          `https://nodejs.org/dist/v${nodeVersion}/${filename}`,
          sha256,
          "sha256",
        );
        item.archive = digest(archive);
        // Fixed official archive digest is verified before extraction into an owned directory.
        execFileSync("tar", ["-xJf", "-", "--strip-components=1", "-C", nodeRoot], {
          input: archive,
          timeout: 30_000,
        });
        const versionRuntime = join(temporary, `runtime-${nodeVersion}`);
        mkdirSync(versionRuntime);
        // Copy only the selected official Node runtime and the verified target pnpm executable.
        cpSync(nodeRoot, join(versionRuntime, "node"), { recursive: true });
        copyFileSync(join(runtime, "pnpm"), join(versionRuntime, "pnpm"));
        const container = {
          name,
          target,
          nodeVersion,
          harness,
          cohort,
          runtime: versionRuntime,
          output: nodeOutput,
          batch,
        };
        const args = candidateDockerArgs(container);
        try {
          console.log(`candidate consumer: ${target}, Node ${nodeVersion}`);
          const result = await runCandidateCommand("docker", args, {
            timeout: 900_000,
            maxBuffer: 4 * 1024 * 1024,
          });
          writeFileSync(join(nodeOutput, "stdout.log"), result.stdout);
          writeFileSync(join(nodeOutput, "stderr.log"), result.stderr);
        } catch (error) {
          const failure = error as { stdout?: string; stderr?: string };
          writeFileSync(join(nodeOutput, "stdout.log"), failure.stdout ?? "");
          writeFileSync(join(nodeOutput, "stderr.log"), failure.stderr ?? "");
          // Compare the same executable outside Node's child-process path. Diagnostic only:
          // neither success nor failure here may replace the original consumer result.
          for (const mode of ["pnpm-version", "pnpm-version-trace"] as const) {
            const probeName = `ziwei-candidate-probe-${randomUUID()}`;
            const probe: Record<string, unknown> = { mode };
            item[mode] = probe;
            save(reportPath, report);
            console.log(`candidate diagnostic: ${target}, Node ${nodeVersion}, ${mode}`);
            try {
              const result = await runCandidateCommand(
                "docker",
                candidateDockerArgs({ ...container, name: probeName, mode }),
                { timeout: 30_000, maxBuffer: 1024 * 1024 },
              );
              Object.assign(probe, { code: 0, stdout: result.stdout, stderr: result.stderr });
            } catch (probeError) {
              const details = probeError as {
                code?: number | string;
                signal?: string;
                killed?: boolean;
                stdout?: string;
                stderr?: string;
              };
              Object.assign(probe, {
                error: probeError instanceof Error ? probeError.message : String(probeError),
                code: details.code,
                signal: details.signal,
                killed: details.killed,
                stdout: details.stdout ?? "",
                stderr: details.stderr ?? "",
              });
            } finally {
              try {
                await runCandidateCommand("docker", ["rm", "--force", probeName], {
                  timeout: 15_000,
                });
                probe.cleanup = "removed";
              } catch (cleanupError) {
                const stderr = (cleanupError as { stderr?: string }).stderr ?? "";
                if (stderr.includes(`No such container: ${probeName}`))
                  probe.cleanup = "already-absent";
                else
                  probe.cleanupError =
                    cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
              }
              save(reportPath, report);
            }
          }
          throw error;
        }
        const consumer = JSON.parse(readFileSync(join(nodeOutput, "consumer.json"), "utf8"));
        assert.equal(consumer.passed, true);
        assert.equal(consumer.verification, "emulated");
        assert.equal(consumer.target, target);
        assert.equal(consumer.nodeVersion, nodeVersion);
        assert.deepEqual(consumer.batch, batch);
        assert.deepEqual(consumer.receipt, report.receipt);
        item.passed = true;
      } catch (error) {
        item.error = error instanceof Error ? error.message : String(error);
        failures.push(error);
      } finally {
        // Removes only this invocation's uniquely named container; never touches unrelated ones.
        try {
          await runCandidateCommand("docker", ["rm", "--force", name], { timeout: 15_000 });
          item.cleanup = "removed";
        } catch (error) {
          const stderr = (error as { stderr?: string }).stderr ?? "";
          if (stderr.includes(`No such container: ${name}`)) item.cleanup = "already-absent";
          else {
            item.cleanupError = error instanceof Error ? error.message : String(error);
            item.passed = false;
            failures.push(error);
          }
        }
        save(reportPath, report);
      }
    }
    if (failures.length) throw new AggregateError(failures, "候选运行验收失败");
    report.passed = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    save(reportPath, report);
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { target: { type: "string" }, input: { type: "string" }, output: { type: "string" } },
  });
  assert.ok(values.target && values.input && values.output);
  await runCandidateExperiment(
    candidateTarget(values.target),
    resolve(values.input),
    resolve(values.output),
  );
}
