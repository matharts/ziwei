import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

import { currentBatch, digest, type Batch } from "./candidate.ts";

// v12.4.1 tag, upstream rust-toolchain.toml and official rust:1.97.0-bookworm
// resolved on 2026-09-14. This builds a CI test client, not an official pnpm release.
export const pnpmBuild = {
  sourceCommit: "19eb39448649c926bc63b0e9fa16f0e340701460",
  version: "12.4.1",
  rust: "1.97.0",
  target: "powerpc64le-unknown-linux-gnu",
  builderImage: "rust@sha256:8fa55b2f3ddf97471ab6a767bfa3f37e6bad0986ba823e75fea57e2a2a5c3073",
  lockfile: {
    bytes: 229793,
    sha256: "3e87a36bec9322f8173b9c0b471e1f5e436cb723231851512e90acad1d4f447e",
  },
} as const;

const dockerfile = fileURLToPath(new URL("./pnpm-rebuild.Dockerfile", import.meta.url));
// Like the consumer controller, kill a stuck Docker CLI before explicit cleanup.
const execute = promisify(execFile);
const runBuildCommand = (
  command: string,
  args: string[],
  options: { timeout: number; maxBuffer?: number },
) => execute(command, args, { ...options, killSignal: "SIGKILL" });

export function pnpmBuildRecipe() {
  return {
    dockerfile: digest(readFileSync(dockerfile)),
    script: digest(Buffer.from(pnpmBuildScript)),
  };
}

export function verifyPnpmRebuild(
  value: unknown,
  binary: Buffer,
  batch: Batch,
  kind: "pnpm-source-build" | "pnpm-rebuild-experiment" = "pnpm-source-build",
) {
  assert.ok(value && typeof value === "object");
  const receipt = value as Record<string, unknown>;
  assert.equal(receipt.kind, kind);
  assert.equal(receipt.completed, true, "重建尚未完成");
  assert.deepEqual(receipt.batch, batch, "重建产物不可混用 CI 批次");
  for (const [key, expected] of Object.entries(pnpmBuild)) assert.deepEqual(receipt[key], expected);
  if (kind === "pnpm-source-build") {
    assert.deepEqual(receipt.recipe, pnpmBuildRecipe(), "重建配方不匹配");
    assert.equal(receipt.cleanup, "removed-or-not-created", "重建清理尚未完成");
    assert.equal((receipt.builder as { passed?: boolean } | undefined)?.passed, true);
    assert.equal((receipt.compile as { passed?: boolean } | undefined)?.passed, true);
  }
  assert.ok(binary.length >= 64 && binary.length <= 256 * 1024 * 1024);
  assert.deepEqual(binary.subarray(0, 7), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]));
  assert.ok([2, 3].includes(binary.readUInt16LE(16)), "重建文件必须为 ELF 可执行文件");
  assert.equal(binary.readUInt16LE(18), 21, "重建文件必须为 ppc64le");
  assert.deepEqual(receipt.binary, digest(binary), "重建二进制摘要不符");
  return receipt;
}

export function readPnpmRebuild(
  path: string,
  batch: Batch,
  kind: "pnpm-source-build" | "pnpm-rebuild-experiment" = "pnpm-source-build",
) {
  assert.ok(lstatSync(path).isFile() && lstatSync(path).size <= 1024 * 1024);
  const binaryPath = join(dirname(path), "pnpm");
  const stat = lstatSync(binaryPath);
  assert.ok(stat.isFile() && stat.size <= 256 * 1024 * 1024);
  const binary = readFileSync(binaryPath);
  const receipt = verifyPnpmRebuild(JSON.parse(readFileSync(path, "utf8")), binary, batch, kind);
  return { binary, receipt };
}

export const pnpmBuildScript = [
  "rustc +1.97.0 -Vv",
  "cargo +1.97.0 -V",
  "powerpc64le-linux-gnu-gcc-12 --version",
  "powerpc64le-linux-gnu-ld --version",
  "dpkg-query -W g++-12-powerpc64le-linux-gnu binutils-powerpc64le-linux-gnu libc6-dev-ppc64el-cross",
  "cargo +1.97.0 build --locked --release -p pnpm-cli --bin pnpm --target powerpc64le-unknown-linux-gnu",
].join("\n");

export async function rebuildPnpm(source: string, output: string) {
  assert.equal(process.platform, "linux", "重建要求一次性 Linux x64 Docker 宿主");
  assert.equal(process.arch, "x64");
  source = resolve(source);
  output = resolve(output);
  assert.ok(!source.includes(",") && !output.includes(","), "Docker 挂载路径不可包含逗号");
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", source, ...args], { encoding: "utf8", timeout: 10_000 }).trim();
  assert.equal(git("rev-parse", "HEAD"), pnpmBuild.sourceCommit);
  assert.equal(git("status", "--porcelain"), "", "上游源码必须未修改");
  assert.ok(
    readFileSync(join(source, "pnpm/crates/config/src/defaults.rs"), "utf8").includes(
      `PNPM_VERSION: &str = "${pnpmBuild.version}"`,
    ),
  );
  const lockfile = digest(readFileSync(join(source, "Cargo.lock")));
  assert.deepEqual(lockfile, pnpmBuild.lockfile);
  const name = `pnpm-build-${randomUUID()}`;
  const image = `ziwei-pnpm-rebuild:${randomUUID()}`;
  mkdirSync(output); // Never overwrite previous evidence.
  const report: Record<string, unknown> = {
    kind: "pnpm-source-build",
    completed: false,
    runtimeVerified: false,
    batch: currentBatch(),
    ...pnpmBuild,
    lockfile,
    recipe: pnpmBuildRecipe(),
    retainedSymbols: true,
    cleanup: "pending",
  };
  const save = () =>
    writeFileSync(join(output, "build.json"), JSON.stringify(report, null, 2) + "\n");
  const command = async (label: string, args: string[], timeout: number) => {
    console.log(`[pnpm-rebuild] ${label}`);
    report[label] = { args, passed: false };
    save();
    try {
      const result = await runBuildCommand("docker", args, {
        timeout,
        maxBuffer: 16 * 1024 * 1024,
      });
      writeFileSync(join(output, `${label}.stdout.txt`), result.stdout);
      writeFileSync(join(output, `${label}.stderr.txt`), result.stderr);
      report[label] = { args, passed: true };
    } catch (error) {
      const failure = error as Error & {
        stdout?: string;
        stderr?: string;
        code?: unknown;
        signal?: unknown;
      };
      writeFileSync(join(output, `${label}.stdout.txt`), failure.stdout ?? "");
      writeFileSync(join(output, `${label}.stderr.txt`), failure.stderr ?? "");
      report[label] = {
        args,
        passed: false,
        error: String(error),
        code: failure.code,
        signal: failure.signal,
      };
      throw error;
    } finally {
      save();
    }
  };
  save();
  try {
    await command(
      "builder",
      [
        "build",
        "--pull",
        "--platform",
        "linux/amd64",
        "--tag",
        image,
        "--build-arg",
        `RUST_IMAGE=${pnpmBuild.builderImage}`,
        "--file",
        dockerfile,
        dirname(dockerfile),
      ],
      600_000,
    );
    await command(
      "compile",
      [
        "run",
        "--name",
        name,
        "--platform",
        "linux/amd64",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--memory",
        "5g",
        "--pids-limit",
        "512",
        "--tmpfs",
        "/tmp:rw,exec,size=512m",
        "--user",
        `${process.getuid!()}:${process.getgid!()}`,
        "--mount",
        `type=bind,src=${source},dst=/source,readonly`,
        "--mount",
        `type=bind,src=${output},dst=/output`,
        "--env",
        "HOME=/tmp",
        image,
        "bash",
        "-euc",
        pnpmBuildScript,
      ],
      3_000_000,
    );
    assert.deepEqual(digest(readFileSync(join(source, "Cargo.lock"))), lockfile);
    assert.equal(git("status", "--porcelain"), "");
    copyFileSync(join(output, "target", pnpmBuild.target, "release/pnpm"), join(output, "pnpm"));
    chmodSync(join(output, "pnpm"), 0o755);
    copyFileSync(join(source, "LICENSE"), join(output, "LICENSE"));
    report.binary = digest(readFileSync(join(output, "pnpm")));
    report.completed = true;
  } catch (error) {
    report.completed = false;
    report.error = String(error);
    throw error;
  } finally {
    try {
      // This unique name belongs to this run; it may be absent if the image build failed.
      const found = await runBuildCommand(
        "docker",
        ["ps", "--all", "--quiet", "--filter", `name=^/${name}$`],
        { timeout: 10_000 },
      );
      if (found.stdout.trim())
        await runBuildCommand("docker", ["rm", "--force", name], { timeout: 15_000 });
      report.cleanup = "removed-or-not-created";
    } catch (error) {
      report.cleanup = `failed: ${String(error)}`;
      report.completed = false;
    }
    save();
  }
  assert.equal(report.completed, true, "重建或容器清理失败，详见 build.json");
  verifyPnpmRebuild(report, readFileSync(join(output, "pnpm")), currentBatch());
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      output: { type: "string" },
    },
  });
  assert.ok(values.source && values.output, "需要 --source 和 --output 新结果目录");
  await rebuildPnpm(values.source, values.output);
}
