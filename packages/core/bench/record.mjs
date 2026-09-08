import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { sampleOrder } from './suite.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Sorted, path-sensitive file hashes; the record retains the entire manifest. */
export function fingerprint(root, paths) {
  const files = [];
  function add(path) {
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
export function parseRecord(raw, plan) {
  const lines = raw.trim().split('\n').map(line => JSON.parse(line));
  const expected = sampleOrder(plan);
  assert.equal(lines.length, expected.length + 2, '基准记录数量不完整');
  const header = lines[0];
  assert.equal(header.type, 'start');
  assert.deepEqual(header.protocol, plan, '基准合同不一致');
  assert.equal(header.runtime.node, process.version, 'Node 运行时不一致');
  assert.equal(header.runtime.v8, process.versions.v8, 'V8 运行时不一致');
  assert.ok(header.runtime.execArgv.includes('--expose-gc'));
  assert.equal(lines.at(-1).type, 'complete');
  assert.equal(lines.at(-1).samples, expected.length);
  assert.equal(lines.at(-1).corpusHash, plan.corpusHash);
  const samples = lines.slice(1, -1).map(({ type, elapsedNs, ...identity }, index) => {
    assert.equal(type, 'sample');
    assert.deepEqual(identity, expected[index], '样本顺序、计数或身份错误');
    assert.ok(Number.isSafeInteger(elapsedNs) && elapsedNs > 0, '计时必须是正整数纳秒');
    return { ...identity, elapsedNs };
  });
  const metrics = {};
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
  return { samples, metrics, runtime: { ...header.runtime, after: lines.at(-1).after } };
}
