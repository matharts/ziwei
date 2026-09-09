import assert from 'node:assert/strict';
import { describe, test } from '@rstest/core';
import type { TestContext } from '@rstest/core';
import type { SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import type { RecordRow } from './record.ts';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRecord } from './record.ts';
import { protocol, sampleOrder } from './suite.ts';

const runner = fileURLToPath(new URL('./run.ts', import.meta.url));
const cwd = fileURLToPath(new URL('..', import.meta.url));
function temp(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'ziwei-bench-test-'));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function cli(args: string[], options: Partial<SpawnSyncOptionsWithStringEncoding> = {}) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd, encoding: 'utf8', timeout: 120_000, ...options,
  });
}

test('help and invalid benchmark options do not create output records', t => {
  const directory = temp(t);
  const help = cli(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--smoke/);
  for (const args of [
    ['--unknown'], ['--smoke', '--smoke'], ['--output'], ['--output', ''],
    ['--output', '--smoke'], ['--output', directory, '--output', directory],
    ['--max-regression', '0.1'], ['--help', '--smoke'],
  ]) {
    const result = cli(args);
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, /参数|重复|缺少|不能/);
  }
  assert.deepEqual(readdirSync(directory), []);
});

test('public package smoke records complete samples and protects existing output', t => {
  const directory = temp(t);
  const output = join(directory, 'smoke');
  const result = cli(['--smoke', '--output', output]);
  assert.equal(result.status, 0, result.stderr);
  const original = readFileSync(join(output, 'record.json'), 'utf8');
  const record = JSON.parse(original);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.status, 'smoke');
  assert.equal(record.suite.id, 'ziwei-node-public-512');
  assert.equal(record.suite.version, 1);
  assert.equal(record.corpusHash, '2cbeaeef0fc8b448d4f4dc89e7f10012bb9c2a88fcfd1ede763bd08afdae9f92');
  assert.equal(record.samples.length, 12);
  assert.equal(Object.keys(record.metrics).length, 12);
  for (const sample of record.samples) {
    assert.equal(sample.operations, 512);
    assert.ok(Number.isSafeInteger(sample.elapsedNs) && sample.elapsedNs > 0);
    assert.equal(record.metrics[sample.name].medianNsPerOp, sample.elapsedNs / sample.operations);
    assert.equal(record.metrics[sample.name].p95BatchMeanNsPerOp, sample.elapsedNs / sample.operations);
  }
  for (const key of ['source', 'artifact', 'contract']) {
    assert.match(record.fingerprints[key].sha256, /^[a-f0-9]{64}$/);
    assert.ok(record.fingerprints[key].files.length > 0);
  }
  assert.ok(record.fingerprints.source.files.some((file: { path: string }) => file.path === 'mise.toml'));
  assert.equal(record.runtime.node, process.version);
  assert.equal(record.runtime.v8, process.versions.v8);
  assert.match(record.runtime.nativeLibrary, /ziwei-native.*\.node$/);
  assert.equal(record.commands.build.status, 0);
  assert.equal(record.commands.build.executable, 'mise');
  assert.deepEqual(record.commands.build.args, ['run', '--tool', `node@${process.versions.node}`, 'build:node']);
  assert.equal(record.commands.measure.status, 0);
  assert.match(record.toolchain.pnpm, /^\d+\.\d+\.\d+$/);
  assert.match(record.toolchain.mise, /^\d+\.\d+\.\d+/);
  assert.match(record.toolchain.rustc, /^rustc /);
  const lines = readFileSync(join(output, 'run.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(lines.length, 14);
  assert.equal(lines[0].type, 'start');
  assert.equal(lines.at(-1).type, 'complete');
  assert.deepEqual(lines.filter(line => line.type === 'sample').map(({ type, ...sample }) => sample), record.samples);
  assert.ok(!readdirSync(output).includes('failure.json'));
  const duplicate = cli(['--smoke', '--output', output]);
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /已存在/);
  assert.equal(readFileSync(join(output, 'record.json'), 'utf8'), original);

  const sample = (rows: RecordRow[], index = 1) => { const row = rows[index]; assert.ok(row.type === 'sample'); return row; };
  const start = (rows: RecordRow[]) => { const row = rows[0]; assert.ok(row.type === 'start'); return row; };
  const complete = (rows: RecordRow[]) => { const row = rows.at(-1); assert.ok(row?.type === 'complete'); return row; };
  const damaged: ((rows: RecordRow[]) => void)[] = [
    rows => rows.pop(),
    rows => rows.push(rows[1]),
    rows => { sample(rows).operations++; },
    rows => { sample(rows).elapsedNs = 0; },
    rows => { sample(rows).elapsedNs = 1.5; },
    rows => { sample(rows).elapsedNs = Number.MAX_SAFE_INTEGER + 1; },
    rows => { sample(rows, 2).name = sample(rows).name; },
    rows => { start(rows).protocol.warmup++; },
    rows => { complete(rows).corpusHash = 'different'; },
    rows => { start(rows).runtime.v8 = 'different'; },
  ];
  for (const corrupt of damaged) {
    const rows = structuredClone(lines);
    corrupt(rows);
    assert.throws(() => parseRecord(rows.map(row => JSON.stringify(row)).join('\n'), protocol(true)));
  }
  assert.throws(() => parseRecord('{truncated', protocol(true)));
});

test('full record statistics use all 21 batch means per operation', () => {
  const plan = protocol(false);
  const rows = [
    { type: 'start', protocol: plan, runtime: { node: process.version, v8: process.versions.v8, execArgv: ['--expose-gc'] } },
    ...sampleOrder(plan).map(sample => ({ type: 'sample', ...sample,
      elapsedNs: 1000 * (sample.round + 1) * (sample.batch + 1) * sample.operations })),
    { type: 'complete', samples: 252, corpusHash: plan.corpusHash },
  ];
  const record = parseRecord(rows.map(row => JSON.stringify(row)).join('\n'), plan);
  assert.equal(record.samples.length, 252);
  for (const metric of Object.values(record.metrics)) {
    assert.deepEqual(metric, { medianNsPerOp: 6000, p95BatchMeanNsPerOp: 18000, batchCount: 21 });
  }
});

// Isolated package fixture: controlled process failures cannot mutate the real checkout.
function fixture(t: TestContext) {
  const directory = temp(t);
  const root = join(directory, 'repo');
  const actualRoot = resolve(cwd, '../..');
  for (const path of [
    'crates/ziwei/src', 'crates/ziwei_napi/src', 'packages/core/src', 'packages/core/bench',
    'Cargo.toml', 'Cargo.lock', 'crates/ziwei/Cargo.toml', 'crates/ziwei_napi/Cargo.toml',
    'crates/ziwei_napi/build.rs', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
    'packages/core/package.json', 'packages/core/tsconfig.json', 'packages/core/rslib.config.ts', 'mise.toml',
  ]) {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(actualRoot, path), destination, { recursive: true });
  }
  const pkg = join(root, 'packages/core');
  const configPath = join(root, 'mise.toml');
  const config = readFileSync(configPath, 'utf8');
  const buildTask = /\[tasks\."build:node"\][\s\S]*?(?=\n\[)/;
  assert.match(config, buildTask);
  writeFileSync(configPath, config.replace(buildTask, '[tasks."build:node"]\ndir = "packages/core"\nrun = "node build-fixture.cjs"\n'));
  const build = join(pkg, 'build-fixture.cjs');
  writeFileSync(build, "process.stdout.write('build stdout\\n'); process.stderr.write('build stderr\\n'); process.exit(13);\n");
  const env = { ...process.env, MISE_TRUSTED_CONFIG_PATHS: root };
  const output = join(directory, 'result');
  const run = (options: Partial<SpawnSyncOptionsWithStringEncoding> = {}) => spawnSync(process.execPath, [join(pkg, 'bench/run.ts'), '--smoke', '--output', output], {
    cwd: pkg, encoding: 'utf8', timeout: 120_000, ...options, env: { ...env, ...options.env },
  });
  return { root, pkg, output, run, build, env };
}

test('build failure keeps both raw logs and never produces a success record', t => {
  const { output, run } = fixture(t);
  const result = run();
  assert.equal(result.status, 1);
  const failure = JSON.parse(readFileSync(join(output, 'failure.json'), 'utf8'));
  assert.equal(failure.status, 'failed');
  assert.equal(failure.stage, 'build');
  assert.equal(failure.commands.build.status, 13);
  assert.match(readFileSync(join(output, 'build.stdout.log'), 'utf8'), /build stdout/);
  assert.match(readFileSync(join(output, 'build.stderr.log'), 'utf8'), /build stderr/);
  assert.equal(existsSync(join(output, 'record.json')), false);
});

test('external native override is rejected before build', t => {
  const { output, run } = fixture(t);
  const result = run({ env: { ...process.env, NAPI_RS_NATIVE_LIBRARY_PATH: '/external/native.node' } });
  assert.equal(result.status, 1);
  const failure = JSON.parse(readFileSync(join(output, 'failure.json'), 'utf8'));
  assert.match(failure.error, /不能通过环境变量替换/);
  assert.deepEqual(failure.commands, {});
  assert.equal(existsSync(join(output, 'build.stdout.log')), false);
  assert.equal(existsSync(join(output, 'record.json')), false);
});

function builtFixture(t: TestContext, childBody: string) {
  const instance = fixture(t);
  for (const path of ['dist', 'native']) {
    cpSync(join(cwd, path), join(instance.pkg, path), { recursive: true });
  }
  writeFileSync(instance.build, 'process.exit(0);\n');
  const child = join(instance.pkg, 'bench/suite.ts');
  const original = readFileSync(child, 'utf8');
  const call = "await measure(process.argv[2] === '--smoke');";
  assert.ok(original.includes(call));
  writeFileSync(child, original.replace(call, childBody.replace('$MEASURE', call)));
  return instance;
}

describe('child failures, malformed output and changed files cannot become valid records', () => {
  for (const { name, body, stage, raw } of [
    { name: 'child error', body: "process.stdout.write('partial raw\\n'); throw new Error('fixture child failure');", stage: 'measure', raw: /partial raw/ },
    { name: 'malformed record', body: "process.stdout.write('{broken\\n');", stage: 'validate', raw: /broken/ },
    { name: 'source mutation', body: "$MEASURE (await import('node:fs')).appendFileSync(new URL('../src/index.ts', import.meta.url), '\\n// fixture mutation\\n');", stage: 'validate', raw: /complete/ },
    { name: 'build config mutation', body: "$MEASURE (await import('node:fs')).appendFileSync(new URL('../rslib.config.ts', import.meta.url), '\\n// fixture mutation\\n');", stage: 'validate', raw: /complete/ },
    { name: 'task definition mutation', body: "$MEASURE (await import('node:fs')).appendFileSync(new URL('../../../mise.toml', import.meta.url), '\\n# fixture mutation\\n');", stage: 'validate', raw: /complete/ },
    { name: 'artifact mutation', body: "$MEASURE (await import('node:fs')).appendFileSync(new URL('../dist/index.js', import.meta.url), '\\n// fixture mutation\\n');", stage: 'validate', raw: /complete/ },
  ]) {
    test(name, t => {
      const { output, run } = builtFixture(t, body);
      const result = run();
      assert.equal(result.status, 1);
      const failure = JSON.parse(readFileSync(join(output, 'failure.json'), 'utf8'));
      assert.equal(failure.stage, stage, failure.error);
      assert.equal(existsSync(join(output, 'record.json')), false);
      assert.match(readFileSync(join(output, 'run.jsonl'), 'utf8'), raw);
      if (name === 'child error') assert.match(readFileSync(join(output, 'run.stderr.log'), 'utf8'), /fixture child failure/);
      if (name.endsWith('mutation')) assert.match(failure.error, /期间.*发生变化/);
    });
  }
});

test.skipIf(process.platform === 'win32')('closed stdout does not leave a success record', async t => {
  const { output, pkg, env } = builtFixture(t, '$MEASURE');
  const child = spawn(process.execPath, [join(pkg, 'bench/run.ts'), '--smoke', '--output', output], {
    cwd: pkg, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000,
  });
  child.stdout.destroy();
  child.stderr.resume();
  const status = await new Promise((done, fail) => {
    child.once('error', fail);
    child.once('close', done);
  });
  assert.equal(status, 1);
  const failure = JSON.parse(readFileSync(join(output, 'failure.json'), 'utf8'));
  assert.equal(failure.stage, 'output');
  assert.equal(existsSync(join(output, 'record.json')), false);
});

test.skipIf(process.platform === 'win32')('build and measurement preserve the selected Node runtime despite PATH shadowing', t => {
  const { output, run, build } = builtFixture(t, '$MEASURE');
  const shadow = join(temp(t), 'node');
  writeFileSync(shadow, '#!/bin/sh\nexit 19\n');
  chmodSync(shadow, 0o755);
  writeFileSync(build, 'console.log(process.version);\n');
  const result = run({ env: { ...process.env, PATH: `${dirname(shadow)}:${process.env.PATH}` } });
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(readFileSync(join(output, 'record.json'), 'utf8'));
  assert.equal(record.runtime.node, process.version);
  assert.ok(readFileSync(join(output, 'build.stdout.log'), 'utf8').includes(process.version));
});
