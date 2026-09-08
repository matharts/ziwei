import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRecord } from './record.mjs';
import { protocol, sampleOrder } from './suite.mjs';

const runner = fileURLToPath(new URL('./run.mjs', import.meta.url));
const cwd = fileURLToPath(new URL('..', import.meta.url));
function temp(t) {
  const directory = mkdtempSync(join(tmpdir(), 'ziwei-bench-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function cli(args, options = {}) {
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
  assert.equal(record.runtime.node, process.version);
  assert.equal(record.runtime.v8, process.versions.v8);
  assert.match(record.runtime.nativeLibrary, /ziwei-native.*\.node$/);
  assert.equal(record.commands.build.status, 0);
  assert.equal(record.commands.measure.status, 0);
  assert.match(record.toolchain.pnpm, /^\d+\.\d+\.\d+$/);
  assert.match(record.toolchain.rustc, /^rustc /);
  const lines = readFileSync(join(output, 'run.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 14);
  assert.equal(lines[0].type, 'start');
  assert.equal(lines.at(-1).type, 'complete');
  assert.deepEqual(lines.filter(line => line.type === 'sample').map(({ type, ...sample }) => sample), record.samples);
  assert.ok(!readdirSync(output).includes('failure.json'));
  const duplicate = cli(['--smoke', '--output', output]);
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /已存在/);
  assert.equal(readFileSync(join(output, 'record.json'), 'utf8'), original);

  const damaged = [
    rows => rows.pop(),
    rows => rows.push(rows[1]),
    rows => { rows[1].operations++; },
    rows => { rows[1].elapsedNs = 0; },
    rows => { rows[1].elapsedNs = 1.5; },
    rows => { rows[1].elapsedNs = Number.MAX_SAFE_INTEGER + 1; },
    rows => { rows[2].name = rows[1].name; },
    rows => { rows[0].protocol.warmup++; },
    rows => { rows.at(-1).corpusHash = 'different'; },
    rows => { rows[0].runtime.v8 = 'different'; },
  ];
  for (const corrupt of damaged) {
    const rows = structuredClone(lines);
    corrupt(rows);
    assert.throws(() => parseRecord(rows.map(JSON.stringify).join('\n'), protocol(true)));
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
  const record = parseRecord(rows.map(JSON.stringify).join('\n'), plan);
  assert.equal(record.samples.length, 252);
  for (const metric of Object.values(record.metrics)) {
    assert.deepEqual(metric, { medianNsPerOp: 6000, p95BatchMeanNsPerOp: 18000, batchCount: 21 });
  }
});

// Isolated package fixture: controlled process failures cannot mutate the real checkout.
function fixture(t) {
  const directory = temp(t);
  const root = join(directory, 'repo');
  const actualRoot = resolve(cwd, '../..');
  for (const path of [
    'crates/ziwei/src', 'crates/ziwei_napi/src', 'packages/core/src', 'packages/core/bench',
    'Cargo.toml', 'Cargo.lock', 'crates/ziwei/Cargo.toml', 'crates/ziwei_napi/Cargo.toml',
    'crates/ziwei_napi/build.rs', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
    'packages/core/package.json', 'packages/core/tsconfig.json', 'mise.toml',
  ]) {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(actualRoot, path), destination, { recursive: true });
  }
  const pkg = join(root, 'packages/core');
  const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
  manifest.scripts.build = 'node -e "process.stdout.write(\'build stdout\\n\'); process.stderr.write(\'build stderr\\n\'); process.exit(13)"';
  writeFileSync(join(pkg, 'package.json'), JSON.stringify(manifest));
  const output = join(directory, 'result');
  const run = (options = {}) => spawnSync(process.execPath, [join(pkg, 'bench/run.mjs'), '--smoke', '--output', output], {
    cwd: pkg, encoding: 'utf8', timeout: 120_000, ...options,
  });
  return { root, pkg, output, run, manifest };
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

function builtFixture(t, childBody) {
  const instance = fixture(t);
  for (const path of ['dist', 'native', 'index.mjs']) {
    cpSync(join(cwd, path), join(instance.pkg, path), { recursive: true });
  }
  instance.manifest.scripts.build = 'node -e "process.exit(0)"';
  writeFileSync(join(instance.pkg, 'package.json'), JSON.stringify(instance.manifest));
  const child = join(instance.pkg, 'bench/suite.mjs');
  const original = readFileSync(child, 'utf8');
  const call = "await measure(process.argv[2] === '--smoke');";
  assert.ok(original.includes(call));
  writeFileSync(child, original.replace(call, childBody.replace('$MEASURE', call)));
  return instance;
}

test('child failures, malformed output and changed files cannot become valid records', async t => {
  for (const { name, body, stage, raw } of [
    { name: 'child error', body: "process.stdout.write('partial raw\\n'); throw new Error('fixture child failure');", stage: 'measure', raw: /partial raw/ },
    { name: 'malformed record', body: "process.stdout.write('{broken\\n');", stage: 'validate', raw: /broken/ },
    { name: 'source mutation', body: "$MEASURE (await import('node:fs')).appendFileSync(new URL('../src/index.ts', import.meta.url), '\\n// fixture mutation\\n');", stage: 'validate', raw: /complete/ },
    { name: 'artifact mutation', body: "$MEASURE (await import('node:fs')).appendFileSync(new URL('../dist/index.js', import.meta.url), '\\n// fixture mutation\\n');", stage: 'validate', raw: /complete/ },
  ]) {
    await t.test(name, t => {
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

test('closed stdout does not leave a success record', { skip: process.platform === 'win32' }, async t => {
  const { output, pkg } = builtFixture(t, '$MEASURE');
  const child = spawn(process.execPath, [join(pkg, 'bench/run.mjs'), '--smoke', '--output', output], {
    cwd: pkg, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000,
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

test('build and measurement preserve the selected Node runtime despite PATH shadowing', { skip: process.platform === 'win32' }, t => {
  const { output, pkg, run, manifest } = builtFixture(t, '$MEASURE');
  const shadow = join(temp(t), 'node');
  writeFileSync(shadow, '#!/bin/sh\nexit 19\n');
  chmodSync(shadow, 0o755);
  manifest.scripts.build = 'node -p process.version';
  writeFileSync(join(pkg, 'package.json'), JSON.stringify(manifest));
  const result = run({ env: { ...process.env, PATH: `${dirname(shadow)}:${process.env.PATH}` } });
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(readFileSync(join(output, 'record.json'), 'utf8'));
  assert.equal(record.runtime.node, process.version);
  assert.ok(readFileSync(join(output, 'build.stdout.log'), 'utf8').includes(process.version));
});
