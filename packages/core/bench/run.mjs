#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprint, parseRecord } from './record.mjs';
import { protocol } from './suite.mjs';

const usage = 'Usage: node bench/run.mjs [--smoke] [--output <new-directory>]\n';
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const root = resolve(packageRoot, '../..');

function options(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  const result = { smoke: false };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!['--smoke', '--output'].includes(arg)) throw new Error(`未知参数：${arg}`);
    if (seen.has(arg)) throw new Error(`重复参数：${arg}`);
    seen.add(arg);
    if (arg === '--smoke') result.smoke = true;
    else {
      const value = args[++i];
      if (!value?.trim() || value.startsWith('--')) throw new Error('--output 缺少目录参数');
      result.output = value;
    }
  }
  return result;
}

function writeJSON(path, value) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }); }
function sourceFingerprint() {
  return fingerprint(root, [
    ...['crates/ziwei/src', 'crates/ziwei_napi/src', 'packages/core/src'].map(path => ({ path, directory: true })),
    ...['Cargo.toml', 'Cargo.lock', 'crates/ziwei/Cargo.toml', 'crates/ziwei_napi/Cargo.toml',
      'crates/ziwei_napi/build.rs', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
      'packages/core/package.json', 'packages/core/tsconfig.json', 'mise.toml'].map(path => ({ path })),
    { path: '.cargo', directory: true, optional: true },
  ]);
}
function artifactFingerprint() {
  return fingerprint(root, [
    { path: 'packages/core/dist', directory: true }, { path: 'packages/core/native', directory: true },
    { path: 'packages/core/index.mjs' }, { path: 'packages/core/package.json' },
  ]);
}
function contractFingerprint() {
  return fingerprint(packageRoot, ['run.mjs', 'suite.mjs', 'record.mjs'].map(name => ({ path: `bench/${name}` })));
}
function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10_000 });
  return result.status === 0 ? result.stdout.trim() : null;
}
function environmentOverrides() {
  // Record provenance without copying potentially sensitive environment values.
  return Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => /^(NODE_OPTIONS|RUST.*|CARGO_.*|CC|CXX|CFLAGS|CXXFLAGS|NAPI_RS_.*)$/.test(key))
    .map(([key, value]) => [key, createHash('sha256').update(value).digest('hex')])
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
function childEnvironment() {
  const env = { ...process.env };
  const key = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
  env[key] = `${dirname(process.execPath)}${delimiter}${env[key] ?? ''}`;
  return env;
}
function command(output, label, executable, args, commands, extra = {}) {
  const stdout = openSync(join(output, `${label}.${label === 'run' ? 'jsonl' : 'stdout.log'}`), 'wx');
  const stderr = openSync(join(output, `${label}.stderr.log`), 'wx');
  let result;
  try {
    result = spawnSync(executable, args, {
      cwd: packageRoot, env: childEnvironment(), stdio: ['ignore', stdout, stderr], timeout: 600_000, ...extra,
    });
  } finally { closeSync(stdout); closeSync(stderr); }
  commands[label === 'run' ? 'measure' : label] = {
    executable, args, status: result.status, signal: result.signal, error: result.error?.message ?? null,
  };
  assert.ok(result.status === 0 && !result.error, `${label} 失败，请查看 ${output} 中的原始日志`);
}

async function main(config) {
  let output;
  if (config.output) {
    output = resolve(config.output);
    mkdirSync(dirname(output), { recursive: true });
    try { mkdirSync(output); }
    catch (error) { if (error.code === 'EEXIST') throw new Error(`输出目录已存在：${output}`); throw error; }
  } else {
    const parent = join(root, 'target/benchmarks/node');
    mkdirSync(parent, { recursive: true });
    output = mkdtempSync(join(parent, 'public-'));
  }
  const commands = {};
  const startedAt = new Date().toISOString();
  let stage = 'fingerprint';
  try {
    assert.ok(!process.env.NAPI_RS_NATIVE_LIBRARY_PATH, '不能通过环境变量替换基准原生库');
    const source = sourceFingerprint();
    const contract = contractFingerprint();
    const revision = git(['rev-parse', 'HEAD']);
    const gitStatus = git(['status', '--porcelain=v1', '--untracked-files=normal']);
    stage = 'toolchain';
    command(output, 'pnpm-version', 'pnpm', ['--version'], commands, { shell: process.platform === 'win32' });
    command(output, 'rustc-version', 'rustc', ['--version', '--verbose'], commands);
    const toolchain = {
      pnpm: readFileSync(join(output, 'pnpm-version.stdout.log'), 'utf8').trim(),
      rustc: readFileSync(join(output, 'rustc-version.stdout.log'), 'utf8').trim(),
      environmentOverrides: environmentOverrides(),
    };
    stage = 'build';
    // Only constant arguments enter the Windows command shell (pnpm.cmd requires it).
    command(output, 'build', 'pnpm', ['run', 'build'], commands, { shell: process.platform === 'win32' });
    assert.equal(sourceFingerprint().sha256, source.sha256, '构建期间源码发生变化');
    const artifact = artifactFingerprint();
    stage = 'measure';
    const plan = protocol(config.smoke);
    command(output, 'run', process.execPath, [
      '--expose-gc', join(packageRoot, 'bench/suite.mjs'), ...(config.smoke ? ['--smoke'] : []),
    ], commands);
    stage = 'validate';
    const parsed = parseRecord(readFileSync(join(output, 'run.jsonl'), 'utf8'), plan);
    assert.ok(artifact.files.some(file => file.path === `packages/core/${parsed.runtime.nativeLibrary}`), '加载的原生库未被产物指纹覆盖');
    assert.equal(sourceFingerprint().sha256, source.sha256, '计时期间源码发生变化');
    assert.equal(artifactFingerprint().sha256, artifact.sha256, '计时期间产物发生变化');
    assert.equal(contractFingerprint().sha256, contract.sha256, '计时期间基准合同发生变化');
    const record = {
      schemaVersion: 1, status: config.smoke ? 'smoke' : 'provisional', startedAt, completedAt: new Date().toISOString(),
      suite: plan.suite, corpusHash: plan.corpusHash, protocol: plan, ...parsed,
      git: { revision, dirty: gitStatus === null ? null : gitStatus !== '' },
      fingerprints: { source, artifact, contract }, commands,
      toolchain,
    };
    stage = 'output';
    await new Promise((done, fail) => {
      process.stdout.once('error', fail);
      process.stdout.write(`${join(output, 'record.json')}\n`, error => error ? fail(error) : done());
    });
    // Publish the summary only after the complete run, validation and stdout flush.
    writeJSON(join(output, 'record.json'), record);
  } catch (error) {
    writeJSON(join(output, 'failure.json'), { schemaVersion: 1, status: 'failed', startedAt,
      failedAt: new Date().toISOString(), stage, error: error.stack, commands });
    throw new Error(`${error.message}\n失败记录：${join(output, 'failure.json')}`);
  }
}

try {
  const config = options(process.argv.slice(2));
  if (config.help) process.stdout.write(usage);
  else await main(config);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
