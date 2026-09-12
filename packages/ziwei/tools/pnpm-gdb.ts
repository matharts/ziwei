import assert from "node:assert/strict";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import { runCandidateCommand } from "./candidate-runtime.ts";

export function pnpmGdbArgs(binary: string, socket: string) {
  assert.match(socket, /^\/[\w/.-]+$/, "GDB socket 必须是安全的绝对路径");
  const commands = [
    "set pagination off",
    "set confirm off",
    "set debuginfod enabled off",
    "set sysroot target:",
    "handle SIGSEGV stop print nopass",
    `target remote ${socket}`,
    "continue",
    "echo [pnpm-gdb] registers\\n",
    "info registers",
    "x/24i $pc-32",
    "bt 32",
    "info files",
    "info sharedlibrary",
    "info proc mappings",
    "disconnect",
  ];
  return [
    "--nx",
    "--batch",
    "-iex",
    "set auto-load off",
    binary,
    ...commands.flatMap((command) => ["-ex", command]),
  ];
}

/** Stop at the first guest SIGSEGV; collecting evidence is not a successful startup. */
export async function capturePnpmCrash(
  output: string,
  temporary: string,
  binary: string,
  args: string[],
) {
  const directory = join(temporary, "debug");
  mkdirSync(directory, { mode: 0o700 });
  const socket = join(directory, "gdb.sock");
  const name = args[args.indexOf("--name") + 1]!;
  const dockerArgs = [...args];
  dockerArgs.splice(
    1,
    0,
    "--detach",
    "--mount",
    `type=bind,src=${directory},dst=/debug`,
    "--env",
    "QEMU_GDB=/debug/gdb.sock",
  );
  const gdbArgs = pnpmGdbArgs(binary, socket);
  const evidence: Record<string, unknown> = {
    dockerArgs,
    gdbArgs,
    captured: false,
    cleanup: "pending",
  };
  const save = () =>
    writeFileSync(join(output, "gdb.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  save();
  try {
    evidence.version = await runCandidateCommand("gdb-multiarch", ["--version"], {
      timeout: 10_000,
    });
    await runCandidateCommand("docker", dockerArgs, { timeout: 15_000 });
    const deadline = Date.now() + 15_000;
    while (!statSync(socket, { throwIfNoEntry: false })?.isSocket()) {
      assert.ok(Date.now() < deadline, "等待 QEMU GDB socket 超时");
      await setTimeout(200);
    }
    console.log("[pnpm-gdb] capturing the first guest signal");
    try {
      evidence.session = await runCandidateCommand("gdb-multiarch", gdbArgs, {
        timeout: 45_000,
        maxBuffer: 2 * 1024 * 1024,
      });
    } catch (error) {
      const failure = error as Error & {
        stdout?: string;
        stderr?: string;
        code?: unknown;
        signal?: unknown;
      };
      evidence.session = {
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? "",
        code: failure.code,
        signal: failure.signal,
        error: String(error),
      };
    }
    const session = evidence.session as { stdout: string };
    evidence.captured =
      /received signal SIGSEGV/.test(session.stdout) &&
      /\[pnpm-gdb\] registers/.test(session.stdout);
    assert.equal(evidence.captured, true, "未捕获首次 SIGSEGV；检查 gdb.json");
  } catch (error) {
    evidence.error = String(error);
    throw error;
  } finally {
    try {
      evidence.containerLogs = await runCandidateCommand("docker", ["logs", name], {
        timeout: 10_000,
      });
    } catch (error) {
      evidence.logsError = String(error);
    }
    try {
      await runCandidateCommand("docker", ["rm", "--force", name], { timeout: 15_000 });
      evidence.cleanup = "removed";
    } catch (error) {
      evidence.cleanup = `failed: ${String(error)}`;
    }
    save();
  }
  assert.equal(evidence.cleanup, "removed", "GDB 容器清理失败");
  throw new Error("已捕获 SIGSEGV；pnpm 启动仍失败，详见 gdb.json");
}
