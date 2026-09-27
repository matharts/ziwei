import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import type { ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "@rstest/core";

test("the packed TypeScript package is a clean Node consumer with no native runtime files", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ziwei-ts~consumer-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  const options: ExecFileSyncOptionsWithStringEncoding = {
    encoding: "utf8",
    timeout: 30_000,
    stdio: ["ignore", "pipe", "pipe"],
  };
  const packed = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--pack-destination", directory], {
      ...options,
      cwd: packageRoot,
    }),
  ) as [{ filename: string }];
  const tarball = join(directory, packed[0].filename);
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({
      name: "ziwei-local-consumer",
      private: true,
      type: "module",
      dependencies: { "@matharts/ziwei": "file:./ziwei.tgz" },
    }),
  );
  execFileSync(
    "npm",
    ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    {
      ...options,
      cwd: directory,
    },
  );

  const installedPackage = join(directory, "node_modules", "@matharts", "ziwei");
  const manifest = JSON.parse(readFileSync(join(installedPackage, "package.json"), "utf8"));
  assert.equal(manifest.name, "@matharts/ziwei");
  assert.equal(manifest.private, true);
  assert.equal(manifest.type, "module");
  assert.equal(manifest.engines.node, ">=24.15.0");
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.optionalDependencies, undefined);
  assert.equal(manifest.napi, undefined);
  assert.deepEqual(Object.keys(manifest.exports), ["."]);
  assert.deepEqual(manifest.exports["."], {
    types: "./dist/index.d.ts",
    default: "./dist/index.js",
  });
  const allowedFiles = new Set(["dist", "README.md", "AGENTS.md", "package.json", "LICENSE"]);
  for (const entry of readdirSync(installedPackage)) assert.ok(allowedFiles.has(entry), entry);
  assert.deepEqual(
    readdirSync(join(installedPackage, "dist"), { recursive: true, encoding: "utf8" }).sort(),
    ["index.d.ts", "index.js"],
  );
  for (const file of ["index.js", "index.d.ts"]) {
    const contents = readFileSync(join(installedPackage, "dist", file), "utf8");
    assert.doesNotMatch(contents, /@matharts\/ziwei-shared|ziwei-shared\/src/);
    assert.doesNotMatch(contents, /native\/binding|\.node\b|napi-rs/);
  }
  assert.doesNotMatch(
    readFileSync(join(installedPackage, "dist", "index.js"), "utf8"),
    /from ["']node:|import\(["']node:/,
  );

  const consumerSource = `
    import { Ziwei, Branch, StarName, type Natal, type NatalSnapshot } from '@matharts/ziwei';
    const natal: Natal = Ziwei.fromBirth({ gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: Branch.Zi });
    const snapshot: NatalSnapshot = natal.toJSON();
    const star = natal.star(StarName.WuQu);
    const name: string = star.nameHans;
    void snapshot; void name;
  `;
  const esmSource = join(directory, "consumer.ts");
  const cjsSource = join(directory, "consumer.cts");
  const workerSource = join(directory, "worker.mjs");
  writeFileSync(esmSource, consumerSource);
  writeFileSync(cjsSource, consumerSource);
  writeFileSync(
    workerSource,
    `
      import { parentPort } from 'node:worker_threads';
      import { Ziwei, Branch } from '@matharts/ziwei';
      const natal = Ziwei.fromBirth({ gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: Branch.Zi });
      parentPort.postMessage({ zodiac: natal.zodiac, bureau: natal.fiveElementBureau, palaces: natal.palaces.length });
    `,
  );
  execFileSync(
    "pnpm",
    [
      "exec",
      "tsc",
      "--ignoreConfig",
      "--noEmit",
      "--strict",
      "--noUncheckedIndexedAccess",
      "--exactOptionalPropertyTypes",
      "--module",
      "NodeNext",
      "--target",
      "ES2022",
      esmSource,
      cjsSource,
    ],
    { ...options, cwd: packageRoot },
  );

  const result = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
        import assert from 'node:assert/strict';
        import { createRequire } from 'node:module';
        import { Worker } from 'node:worker_threads';
        import { Ziwei, ZiweiError, Branch, StarName } from '@matharts/ziwei';
        const require = createRequire(import.meta.url);
        const cjs = require('@matharts/ziwei');
        assert.equal(cjs.ZiweiError, ZiweiError);
        assert.equal(cjs.Branch, Branch);
        const natal = Ziwei.fromBirth({ gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: Branch.Zi });
        assert.equal(natal.zodiac, 'Rat');
        assert.equal(natal.fiveElementBureau, 6);
        assert.equal(natal.mingPalace().branch, Branch.Yin);
        assert.equal(natal.star(StarName.WuQu).birthTransformation, 'C');
        assert.equal(natal.decadeYears(0)[0].year, 1989);
        assert.equal(cjs.Ziwei.fromParameters({ gender: 1, birthStem: 0, birthBranch: 0, birthMonth: 1, ziweiBranch: 2, birthHour: 0 }).profile.birthYear, null);
        assert.throws(() => Ziwei.fromBirth({ gender: 1, birthYear: 1984, birthMonth: 13, birthDay: 1, birthHour: 0 }), ZiweiError);
        const worker = new Worker(new URL('./worker.mjs', import.meta.url), { execArgv: [] });
        const workerResult = await new Promise((resolve, reject) => {
          worker.once('message', resolve);
          worker.once('error', reject);
        });
        await worker.terminate();
        assert.deepEqual(workerResult, { zodiac: 'Rat', bureau: 6, palaces: 12 });
        console.log('typescript-consumer-ok');
      `,
    ],
    { ...options, cwd: directory },
  );
  assert.match(result, /typescript-consumer-ok/);
});
