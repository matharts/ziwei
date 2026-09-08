import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const runner = join(root, 'tools/node/run.mjs');

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'ziwei-node-runtime-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const pkg = join(directory, 'packages/core');
  const entry = join(directory, 'tools/node/run.mjs');
  mkdirSync(pkg, { recursive: true });
  mkdirSync(dirname(entry), { recursive: true });
  if (existsSync(runner)) cpSync(runner, entry);
  for (const file of ['package.json', 'pnpm-workspace.yaml', 'mise.toml']) cpSync(join(root, file), join(directory, file));
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@ziweijs/core', private: true, scripts: {
    build: 'node probe.cjs build', test: 'node probe.cjs test', 'test:types': 'node probe.cjs test:types',
  } }));
  writeFileSync(join(pkg, 'probe.cjs'), `
    const {spawnSync} = require('node:child_process');
    const child = spawnSync('node', ['-p', 'JSON.stringify({version: process.version, executable: process.execPath})'], {encoding: 'utf8'});
    if (child.status !== 0) process.exit(child.status ?? 1);
    console.log(JSON.stringify({version: process.version, executable: process.execPath,
      child: JSON.parse(child.stdout), args: process.argv.slice(2), cwd: process.cwd()}));
  `);
  const shadow = join(directory, 'shadow bin');
  mkdirSync(shadow);
  const executable = join(shadow, process.platform === 'win32' ? 'node.cmd' : 'node');
  writeFileSync(executable, process.platform === 'win32' ? '@echo off\r\nexit /b 19\r\n' : '#!/bin/sh\nexit 19\n');
  if (process.platform !== 'win32') chmodSync(executable, 0o755);
  const env = { ...process.env };
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
  env[pathKey] = shadow + delimiter + env[pathKey];
  env.MISE_TRUSTED_CONFIG_PATHS = directory;
  const run = args => spawnSync(process.execPath, [entry, ...args], {
    cwd: directory, env, encoding: 'utf8', timeout: 30_000,
  });
  return { directory, pkg, run, env };
}

test('build, test and type checks keep the selected Node through nested processes', t => {
  const { pkg, run } = fixture(t);
  for (const script of ['build', 'test', 'test:types']) {
    const result = run([script]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(output.version, process.version);
    assert.equal(output.executable, process.execPath);
    assert.deepEqual(output.child, { version: process.version, executable: process.execPath });
    assert.deepEqual(output.args, [script]);
    assert.equal(realpathSync(output.cwd), realpathSync(pkg));
  }
});

test('root package commands and mise check use the same selected runtime', t => {
  const { directory, env } = fixture(t);
  for (const [command, args, expected] of [
    ['pnpm', ['run', 'build'], ['build']],
    ['pnpm', ['run', 'test'], ['test']],
    ['pnpm', ['run', 'test:types'], ['test:types']],
    ['mise', ['run', 'check:node'], ['build', 'test', 'test:types']],
  ]) {
    const result = spawnSync(command, args, { cwd: directory, env, encoding: 'utf8', timeout: 60_000 });
    assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stderr}`);
    const rows = result.stdout.split('\n').filter(line => line.startsWith('{')).map(JSON.parse);
    assert.deepEqual(rows.map(row => row.args[0]), expected);
    for (const row of rows) {
      assert.equal(row.version, process.version);
      assert.equal(row.executable, process.execPath);
      assert.deepEqual(row.child, { version: process.version, executable: process.execPath });
    }
  }
});

test('arguments reach the package script without shell interpretation', t => {
  const { run } = fixture(t);
  const args = ['--name', 'contains spaces', '中文', 'quote\'"', 'literal;$()&'];
  const result = run(['test', ...args]);
  assert.equal(result.status, 0, result.stderr);
  const row = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.deepEqual(row.args, ['test', ...args]);
});

test('unknown tasks fail without executing package scripts', t => {
  const { run } = fixture(t);
  for (const args of [[], ['publish'], ['--unknown']]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /需要指定任务/);
  }
});

test('a failing build preserves diagnostics and prevents later check tasks', t => {
  const { directory, pkg, env, run } = fixture(t);
  const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
  manifest.scripts.build = 'node failure.cjs';
  writeFileSync(join(pkg, 'package.json'), JSON.stringify(manifest));
  writeFileSync(join(pkg, 'failure.cjs'), "process.stdout.write('build-out\\n'); process.stderr.write('build-error\\n'); process.exit(23);\n");
  const direct = run(['build']);
  assert.equal(direct.status, 23);
  assert.match(direct.stdout, /build-out/);
  assert.match(direct.stderr, /build-error/);
  const task = spawnSync('mise', ['run', 'check:node'], { cwd: directory, env, encoding: 'utf8', timeout: 60_000 });
  assert.notEqual(task.status, 0);
  assert.match(task.stderr, /build-error/);
  assert.doesNotMatch(task.stdout, /\[node\] test/);
});
