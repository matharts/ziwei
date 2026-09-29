import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { cpus } from "node:os";

import { Ziwei } from "@matharts/ziwei";

assert.ok(global.gc, "run with --expose-gc");
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--single-palace"));
const singlePalace = process.argv[2] === "--single-palace";

const corpus = [];
for (let birthStem = 0; birthStem < 10; birthStem++) {
    for (let birthMonth = 1; birthMonth <= 12; birthMonth++) {
        for (let ziweiBranch = 0; ziweiBranch < 12; ziweiBranch++) {
            for (let birthHour = 0; birthHour < 12; birthHour++) {
                corpus.push({
                    gender: 0,
                    birthStem,
                    birthBranch: birthStem & 1,
                    birthMonth,
                    ziweiBranch,
                    birthHour,
                });
            }
        }
    }
}
assert.equal(corpus.length, 17_280);
const corpusSha256 = createHash("sha256").update(JSON.stringify(corpus)).digest("hex");

let checksum = 0;
function readChart(input) {
    const chart = Ziwei.fromParameters(input);
    const value = singlePalace ? chart.palace(input.birthHour) : chart.palaces;
    checksum += singlePalace ? value.stars.length : value[input.birthHour].stars.length;
    globalThis.__ziweiUniqueSink = value;
}

for (let index = 0; index < 20_000; index++) readChart(corpus[index & 511]);
global.gc();
const heapBefore = process.memoryUsage().heapUsed;
const warmupChecksum = checksum;
const coldStart = process.hrtime.bigint();
for (let index = 512; index < corpus.length; index++) readChart(corpus[index]);
const coldElapsedNs = Number(process.hrtime.bigint() - coldStart);
global.gc();
const heapAfterCold = process.memoryUsage().heapUsed;
assert.equal(checksum, singlePalace ? 55_190 : 55_114, "unique corpus checksum changed");
const passChecksum = checksum - warmupChecksum;
const beforeCacheFill = checksum;
for (let index = 512; index < corpus.length; index++) readChart(corpus[index]);
assert.equal(checksum - beforeCacheFill, passChecksum);
global.gc();
const heapAfterCacheFill = process.memoryUsage().heapUsed;
const beforeCachedRead = checksum;
const cachedStart = process.hrtime.bigint();
for (let index = 512; index < corpus.length; index++) readChart(corpus[index]);
const cachedElapsedNs = Number(process.hrtime.bigint() - cachedStart);
assert.equal(checksum - beforeCachedRead, passChecksum);
const artifact = await readFile(new URL("../dist/index.js", import.meta.url));

console.log(
    JSON.stringify({
        suite: singlePalace
            ? "ziwei-typescript-node-unique-single-palace"
            : "ziwei-typescript-node-unique-combinations",
        version: singlePalace ? 1 : 2,
        status: "provisional",
        runtime: {
            node: process.version,
            v8: process.versions.v8,
            platform: process.platform,
            arch: process.arch,
            cpu: cpus()[0]?.model ?? null,
        },
        artifactSha256: createHash("sha256").update(artifact).digest("hex"),
        corpusSha256,
        warmupCalls: 20_000,
        warmupCombinations: 512,
        measuredCombinations: corpus.length - 512,
        cacheFillCalls: corpus.length - 512,
        coldElapsedNs,
        nsPerUniqueChart: coldElapsedNs / (corpus.length - 512),
        cachedElapsedNs,
        nsPerCachedChart: cachedElapsedNs / (corpus.length - 512),
        coldHeapDeltaBytes: heapAfterCold - heapBefore,
        retainedCacheHeapDeltaBytes: heapAfterCacheFill - heapBefore,
        checksum,
    }),
);
