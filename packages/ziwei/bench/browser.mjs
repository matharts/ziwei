import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { chromium, firefox, webkit } from "playwright";

const artifact = await readFile(new URL(process.argv[2] ?? "../dist/index.js", import.meta.url));
const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/index.js") {
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.end(artifact);
        return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><meta charset=utf-8><title>Ziwei browser benchmark</title>");
});
await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolveListen();
    });
});
const origin = `http://127.0.0.1:${server.address().port}`;

try {
    for (const engine of [chromium, firefox, webkit]) {
        const browser = await engine.launch();
        try {
            const page = await browser.newPage();
            await page.goto(origin);
            const measurements = await page.evaluate(async () => {
                const { Ziwei, Branch, StarName } = await import("/index.js");
                const corpus = Array.from({ length: 512 }, (_, index) => ({
                    gender: index % 2,
                    birthYear: 1984 + ((index * 37) % 80),
                    birthMonth: 1 + (index % 12),
                    birthDay: 1 + ((index * 7) % 30),
                    birthHour: (index * 5) % 12,
                }));
                const charts = corpus.map((birth) => Ziwei.fromBirth(birth));
                for (const chart of charts) {
                    if (chart.palaces.length !== 12) throw new Error("Invalid palace count");
                    chart.star(StarName.ALL[0]);
                }
                const operations = {
                    create(index) {
                        const chart = Ziwei.fromBirth(corpus[index & 511]);
                        globalThis.__ziweiBenchSink = chart;
                        return chart.profile.birthStem;
                    },
                    full(index) {
                        const palaces = Ziwei.fromBirth(corpus[index & 511]).palaces;
                        globalThis.__ziweiBenchSink = palaces;
                        return palaces[index % 12].stars.length;
                    },
                    sanfang(index) {
                        const chart = Ziwei.fromBirth(corpus[index & 511]);
                        const palaces = chart.sanfangPalaces(index % 12, Math.floor(index / 12) % 2 === 0);
                        globalThis.__ziweiBenchSink = chart;
                        return palaces.length;
                    },
                    sanfangThenFull(index) {
                        const chart = Ziwei.fromBirth(corpus[index & 511]);
                        chart.sanfangPalaces(index % 12, Math.floor(index / 12) % 2 === 0);
                        const palaces = chart.palaces;
                        globalThis.__ziweiBenchSink = chart;
                        return palaces.length;
                    },
                    lifecycle(index) {
                        const chart = Ziwei.fromBirth(corpus[index & 511]);
                        let checksum = chart.palaces.length;
                        for (const name of StarName.ALL) {
                            checksum += chart.palaceByStar(name).branch;
                            checksum += chart.star(name).name.length;
                        }
                        checksum += chart.birthTransformations().length;
                        checksum += chart.selfTransformations().length;
                        for (const source of Branch.ALL) {
                            checksum += chart.palaceTransformations(source).length;
                            checksum += chart.palaceTransformationSources(source).length;
                        }
                        checksum += chart.decadeYears(index % 12).length;
                        globalThis.__ziweiBenchSink = chart;
                        return checksum;
                    },
                    palaceStar(index) {
                        const star = charts[index & 511].palaces[(index >>> 9) % 12].star(
                            StarName.ALL[(index * 7) % 18],
                        );
                        globalThis.__ziweiBenchSink = star;
                        return star === null ? 0 : 1;
                    },
                    star(index) {
                        const star = charts[index & 511].star(StarName.ALL[(index * 7) % 18]);
                        globalThis.__ziweiBenchSink = star;
                        return star === null ? 0 : 1;
                    },
                    decadeYears(index) {
                        const years = charts[index & 511].decadeYears((index >>> 9) % 12);
                        globalThis.__ziweiBenchSink = years;
                        return years[0].age + years[0].year;
                    },
                    palaceTransformationSources(index) {
                        const sources = charts[index & 511].palaceTransformationSources(
                            (index >>> 9) % 12,
                        );
                        globalThis.__ziweiBenchSink = sources;
                        return sources.length;
                    },
                    palaceTransformations(index) {
                        const relations = charts[index & 511].palaceTransformations(
                            (index >>> 9) % 12,
                        );
                        globalThis.__ziweiBenchSink = relations;
                        return relations[0].targetBranch;
                    },
                    palaceTransformation(index) {
                        const relation = charts[index & 511].palaceTransformation(
                            (index >>> 9) % 12,
                            "C",
                        );
                        globalThis.__ziweiBenchSink = relation;
                        return relation.targetBranch;
                    },
                    birthTransformations(index) {
                        const relations = charts[index & 511].birthTransformations();
                        globalThis.__ziweiBenchSink = relations;
                        return relations.length;
                    },
                    selfTransformations(index) {
                        const relations = charts[index & 511].selfTransformations();
                        globalThis.__ziweiBenchSink = relations;
                        return relations.length;
                    },
                };
                const counts = {
                    create: 65_536,
                    full: 65_536,
                    sanfang: 65_536,
                    sanfangThenFull: 65_536,
                    lifecycle: 65_536,
                    palaceStar: 524_288,
                    star: 1_048_576,
                    decadeYears: 131_072,
                    palaceTransformationSources: 131_072,
                    palaceTransformations: 131_072,
                    palaceTransformation: 131_072,
                    birthTransformations: 131_072,
                    selfTransformations: 131_072,
                };
                const output = {};
                for (const [name, run] of Object.entries(operations)) {
                    for (let index = 0; index < 20_000; index++) run(index);
                    const samples = [];
                    let checksum = 0;
                    for (let round = 0; round < 5; round++) {
                        const start = performance.now();
                        for (let index = 0; index < counts[name]; index++) checksum += run(index);
                        samples.push(((performance.now() - start) * 1_000_000) / counts[name]);
                    }
                    const sorted = [...samples].sort((left, right) => left - right);
                    output[name] = {
                        count: counts[name],
                        samplesNsPerOp: samples,
                        medianNsPerOp: sorted[2],
                        checksum,
                    };
                }
                const expected = {
                    create: 1_473_280,
                    full: 499_435,
                    sanfang: 1_146_900,
                    sanfangThenFull: 3_932_160,
                    lifecycle: 111_633_920,
                    palaceStar: 219_030,
                    star: 5_242_880,
                    decadeYears: 1_401_940_480,
                    palaceTransformationSources: 2_621_400,
                    palaceTransformations: 3_614_880,
                    palaceTransformation: 3_658_785,
                    birthTransformations: 2_621_440,
                    selfTransformations: 4_823_040,
                };
                for (const [name, checksum] of Object.entries(expected)) {
                    if (output[name].checksum !== checksum)
                        throw new Error(`Invalid ${name} checksum`);
                }
                return output;
            });
            process.stdout.write(
                `${JSON.stringify({
                    suite: "ziwei-typescript-browser-provisional-512",
                    version: 8,
                    engine: engine.name(),
                    browserVersion: browser.version(),
                    nodeVersion: process.version,
                    artifactSha256,
                    measurements,
                })}\n`,
            );
        } finally {
            await browser.close();
        }
    }
} finally {
    server.closeAllConnections();
    await new Promise((resolveClose) => server.close(resolveClose));
}
