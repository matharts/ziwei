import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { sampleOrder } from './suite.ts';
import type { Protocol, Sample } from './suite.ts';

type FingerprintPath = { path: string; directory?: boolean; optional?: boolean };
export type Runtime = {
  node: string; v8: string; execArgv: string[]; nativeLibrary: string;
  [key: string]: unknown;
};
export type StartRow = { type: 'start'; protocol: Protocol; runtime: Runtime };
export type SampleRow = { type: 'sample'; elapsedNs: number } & Sample;
export type CompleteRow = { type: 'complete'; samples: number; corpusHash: string; after?: unknown };
export type RecordRow = StartRow | SampleRow | CompleteRow;
type Metrics = Record<string, { medianNsPerOp: number; p95BatchMeanNsPerOp: number; batchCount: number }>;

const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Sorted, path-sensitive file hashes; the record retains the entire manifest. */
export function fingerprint(root: string, paths: FingerprintPath[]) {
  const files: string[] = [];
  function add(path: string) {
    const entries = readdirSync(path, { withFileTypes: true });
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) add(child);
      else {
        assert.ok(entry.isFile(), `指纹不接受符号链接：${child}`);
        files.push(child);
      }
    }
  }
  for (const { path, directory = false, optional = false } of paths) {
    const full = join(root, path);
    if (optional && !existsSync(full)) continue;
    if (directory) add(full); else files.push(full);
  }
  const manifest = files.map(path => ({ path: relative(root, path).replaceAll('\\', '/'), sha256: hash(readFileSync(path)) }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert.ok(manifest.length > 0, '指纹文件集不能为空');
  return { sha256: hash(JSON.stringify(manifest)), files: manifest };
}

/** Validate every row before deriving batch-mean statistics; never accept a partial run. */
export function parseRecord(raw: string, plan: Protocol) {
  // These are untrusted protocol rows; every consumed identity and timing is checked below.
  const lines: RecordRow[] = raw.trim().split('\n').map(line => JSON.parse(line));
  const expected = sampleOrder(plan);
  assert.equal(lines.length, expected.length + 2, '基准记录数量不完整');
  const header = lines[0];
  assert.ok(header.type === 'start');
  assert.deepEqual(header.protocol, plan, '基准合同不一致');
  assert.equal(header.runtime.node, process.version, 'Node 运行时不一致');
  assert.equal(header.runtime.v8, process.versions.v8, 'V8 运行时不一致');
  assert.ok(header.runtime.execArgv.includes('--expose-gc'));
  const complete = lines.at(-1);
  assert.ok(complete?.type === 'complete');
  assert.equal(complete.samples, expected.length);
  assert.equal(complete.corpusHash, plan.corpusHash);
  const samples = lines.slice(1, -1).map((row, index) => {
    assert.ok(row.type === 'sample');
    const { type, elapsedNs, ...identity } = row;
    assert.deepEqual(identity, expected[index], '样本顺序、计数或身份错误');
    assert.ok(Number.isSafeInteger(elapsedNs) && elapsedNs > 0, '计时必须是正整数纳秒');
    return { ...identity, elapsedNs };
  });
  const metrics: Metrics = {};
  for (const { name } of plan.cases) {
    const values = samples.filter(sample => sample.name === name)
      .map(sample => sample.elapsedNs / sample.operations).sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    metrics[name] = {
      medianNsPerOp: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
      p95BatchMeanNsPerOp: values[Math.ceil(values.length * 0.95) - 1],
      batchCount: values.length,
    };
  }
  return { samples, metrics, runtime: { ...header.runtime, after: complete.after } };
}
