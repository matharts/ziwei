import { spawnSync } from 'node:child_process';
import { delimiter, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [script, ...args] = process.argv.slice(2);
const scripts = ['build', 'test', 'test:types'];

if (!scripts.includes(script)) {
  process.stderr.write(`需要指定任务：${scripts.join(' | ')}\n`);
  process.exitCode = 1;
} else {
  // mise selects this executable; descendants must not resolve a different Node.
  const env = { ...process.env };
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
  env[pathKey] = `${dirname(process.execPath)}${delimiter}${env[pathKey] ?? ''}`;
  process.stdout.write(`[node] ${script}: ${process.version}\n`);
  // Keep pnpm's argument, lifecycle and exit-code behavior; never invoke a shell here.
  const result = spawnSync('pnpm', ['run', script, ...args], {
    cwd: fileURLToPath(new URL('../../packages/core/', import.meta.url)),
    env,
    stdio: 'inherit',
  });
  if (result.error) process.stderr.write(`无法运行 ${script}：${result.error.message}\n`);
  process.exitCode = result.status ?? 1;
}
