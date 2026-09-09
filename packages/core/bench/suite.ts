import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { platform, arch, release, cpus, totalmem, freemem, loadavg } from 'node:os';
import { fileURLToPath } from 'node:url';
import { relative, resolve } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import type { Birth, Parameters, Branch } from '@ziweijs/core';

declare global { var __ziweiBenchSink: unknown; }
export type Protocol = ReturnType<typeof protocol>;
export type Sample = ReturnType<typeof sampleOrder>[number];

export const suite = { id: 'ziwei-node-public-512', version: 1 };
export const corpusHash = '2cbeaeef0fc8b448d4f4dc89e7f10012bb9c2a88fcfd1ede763bd08afdae9f92';
const counts = {
  fromBirth: 16384, fromParameters: 16384,
  birthAndFirstPalaces: 1024, birthAndToJSON: 1024, birthAndStringify: 1024,
  hotPalaces: 131072, star: 16384, birthTransformations: 2048,
  selfTransformations: 1024, palaceTransformations: 16384, decade: 4096, yearly: 4096,
};

export function protocol(smoke: boolean) {
  return {
    suite, mode: smoke ? 'smoke' : 'full', corpusHash,
    rounds: smoke ? 1 : 3, batches: smoke ? 1 : 7, warmup: smoke ? 512 : 2560,
    gcPasses: 3, rssLimitBytes: 1024 ** 3,
    cases: Object.entries(counts).map(([name, operations]) => ({ name, operations: smoke ? 512 : operations })),
  };
}

export function sampleOrder(plan: Protocol) {
  return Array.from({ length: plan.rounds }, (_, round) =>
    Array.from({ length: plan.cases.length }, (_, offset) => {
      const item = plan.cases[(offset + round) % plan.cases.length];
      return Array.from({ length: plan.batches }, (_, batch) => ({ round, batch, ...item }));
    }).flat()).flat();
}

function corpus() {
  let seed = 0x5a172026;
  const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const births = Array.from({ length: 512 }, (_, i) => ({
    gender: next() % 2,
    birthYear: i < 4 ? [-2147483648, 2147483647, 0, -1000][i] : 1984 + next() % 120,
    birthMonth: 1 + next() % 12, birthDay: 1 + next() % 30, birthHour: next() % 12,
  } as Birth));
  const parameters = Array.from({ length: 512 }, () => {
    const year = next() % 60;
    return { gender: 1 - next() % 2, birthStem: year % 10, birthBranch: year % 12,
      birthMonth: 1 + next() % 12, ziweiBranch: next() % 12, birthHour: next() % 12 } as Parameters;
  });
  return { births, parameters };
}

function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function emit(value: unknown) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function resourceState() { return { memory: process.memoryUsage(), freeMemory: freemem(), loadAverage: loadavg() }; }

async function measure(smoke: boolean) {
  assert.ok(global.gc, '基准必须以 --expose-gc 运行');
  const { Ziwei, StarName } = await import('@ziweijs/core');
  const inputs = corpus();
  assert.equal(hash(inputs), corpusHash, '固定输入语料发生变化');
  const { births, parameters } = inputs;
  const charts = [...births.map(x => Ziwei.fromBirth(x)), ...parameters.map(x => Ziwei.fromParameters(x))];
  // Validate and pre-materialize the read corpus outside all timed batches.
  for (const chart of charts) {
    assert.equal(chart.palaces.length, 12);
    assert.equal(chart.palaces.reduce((sum, palace) => sum + palace.stars.length, 0), 18);
    assert.ok(Object.isFrozen(chart.palaces));
  }
  assert.equal(Ziwei.fromBirth({ gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0 }).star('WuQu').birthTransformation, 'C');
  const operations: Record<string, (index: number) => unknown> = {
    fromBirth: i => Ziwei.fromBirth(births[i & 511]),
    fromParameters: i => Ziwei.fromParameters(parameters[i & 511]),
    birthAndFirstPalaces: i => Ziwei.fromBirth(births[i & 511]).palaces,
    birthAndToJSON: i => Ziwei.fromBirth(births[i & 511]).toJSON(),
    birthAndStringify: i => JSON.stringify(Ziwei.fromBirth(births[i & 511])),
    hotPalaces: i => charts[i & 1023].palaces,
    star: i => charts[i & 1023].star(StarName.ALL[i % 18]),
    birthTransformations: i => charts[i & 1023].birthTransformations(),
    selfTransformations: i => charts[i & 1023].selfTransformations(),
    palaceTransformations: i => charts[i & 1023].palaceTransformations(i % 12 as Branch),
    decade: i => charts[i & 1023].decade(i % 12),
    yearly: i => charts[i & 1023].yearly(i % 12, i % 10),
  };
  const nativeLibraries = Object.keys(createRequire(import.meta.url).cache).filter(path => path.endsWith('.node'));
  assert.equal(nativeLibraries.length, 1, '必须只加载本包的一个原生库');
  const packageRoot = fileURLToPath(new URL('..', import.meta.url));
  const plan = protocol(smoke);
  emit({ type: 'start', protocol: plan, runtime: {
    node: process.version, v8: process.versions.v8, execPath: process.execPath, execArgv: process.execArgv,
    platform: platform(), arch: arch(), osRelease: release(), cpu: cpus()[0]?.model ?? 'unknown',
    logicalCpus: cpus().length, totalMemory: totalmem(),
    nativeLibrary: relative(packageRoot, nativeLibraries[0]).replaceAll('\\', '/'),
    before: resourceState(),
  } });
  for (const sample of sampleOrder(plan)) {
    const run = operations[sample.name];
    if (sample.batch === 0) {
      for (let i = 0; i < plan.warmup; i++) globalThis.__ziweiBenchSink = run(i);
      globalThis.__ziweiBenchSink = undefined;
      for (let pass = 0; pass < plan.gcPasses; pass++) { global.gc(); await setImmediate(); }
    }
    assert.ok(process.memoryUsage().rss < plan.rssLimitBytes, '基准 RSS 超过 1 GiB 安全上限');
    const start = process.hrtime.bigint();
    for (let i = 0; i < sample.operations; i++) globalThis.__ziweiBenchSink = run(i);
    const elapsedNs = Number(process.hrtime.bigint() - start);
    assert.ok(Number.isSafeInteger(elapsedNs) && elapsedNs > 0);
    emit({ type: 'sample', ...sample, elapsedNs });
    globalThis.__ziweiBenchSink = undefined;
    await setImmediate();
  }
  assert.equal(hash(inputs), corpusHash, '输入语料被修改');
  assert.ok(process.memoryUsage().rss < plan.rssLimitBytes, '基准 RSS 超过 1 GiB 安全上限');
  emit({ type: 'complete', corpusHash, samples: sampleOrder(plan).length, after: resourceState() });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--smoke'));
    await measure(process.argv[2] === '--smoke');
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  }
}
