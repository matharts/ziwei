import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import type { ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "@rstest/core";

test("the packed package loads from an independent consumer without install scripts", (t) => {
  // Exercise paths containing a tilde, as in Windows runner short user names.
  const directory = mkdtempSync(join(tmpdir(), "ziwei-node~consumer-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  const tarball = join(directory, "ziwei.tgz");
  const options: ExecFileSyncOptionsWithStringEncoding = {
    encoding: "utf8",
    timeout: 30_000,
    stdio: ["ignore", "pipe", "pipe"],
  };
  execFileSync("pnpm", ["pack", "--out", tarball], { ...options, cwd: packageRoot });
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({
      name: "ziwei-local-consumer",
      private: true,
      type: "module",
      dependencies: { "@matharts/ziwei": "file:./ziwei.tgz" },
    }),
  );
  // No source build, registry dependency, or install lifecycle script is needed.
  execFileSync("pnpm", ["install", "--offline", "--ignore-scripts"], {
    ...options,
    cwd: directory,
  });
  const installedPackage = join(directory, "node_modules", "@matharts", "ziwei");
  const manifest = JSON.parse(readFileSync(join(installedPackage, "package.json"), "utf8"));
  assert.equal(manifest.name, "@matharts/ziwei");
  assert.deepEqual(Object.keys(manifest.exports), ["."]);
  assert.equal(manifest.dependencies, undefined);
  // Consumers receive only distribution assets, never Rust/TS sources or workspace tooling.
  const allowedFiles = new Set([
    "dist",
    "native",
    "README.md",
    "AGENTS.md",
    "package.json",
    "LICENSE",
  ]);
  assert.equal(manifest.type, "module");
  assert.equal(manifest.engines.node, ">=24.15.0");
  assert.deepEqual(manifest.exports["."], {
    types: "./dist/index.d.ts",
    default: "./dist/index.js",
  });
  for (const entry of readdirSync(installedPackage)) assert.ok(allowedFiles.has(entry), entry);
  // bundle: false emits one ESM module and declaration per source module.
  const expectedDist = readdirSync(join(packageRoot, "src"))
    .filter((file) => file.endsWith(".ts"))
    .flatMap((file) => [file.replace(/\.ts$/, ".js"), file.replace(/\.ts$/, ".d.ts")]);
  assert.deepEqual(readdirSync(join(installedPackage, "dist")).sort(), expectedDist.sort());
  const consumerSource = `
    import { Ziwei, Branch, StarName, type Natal, type NatalSnapshot, type DecadeYear } from '@matharts/ziwei';
    const natal: Natal = Ziwei.fromBirth({ gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: Branch.Zi });
    const snapshot: NatalSnapshot = natal.toJSON();
    const years: readonly DecadeYear[] = natal.decadeYears(11);
    const star = natal.palaceStar(Branch.Yin, StarName.ZiWei);
    if (star !== null) { const name: string = star.nameHant; void name; }
    void snapshot; void years;
  `;
  const esmSource = join(directory, "consumer.ts");
  const cjsSource = join(directory, "consumer.cts");
  writeFileSync(esmSource, consumerSource);
  writeFileSync(cjsSource, consumerSource);
  // Resolve declarations from the installed tarball, not the source package's self-reference.
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
      "--expose-gc",
      "--input-type=module",
      "--eval",
      `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { Ziwei, ZiweiError, Branch } from '@matharts/ziwei';
    const cjs = createRequire(import.meta.url)('@matharts/ziwei');
    assert.equal(cjs.ZiweiError, ZiweiError);
    let profile;
    let palaces;
    let located;
    let years;
    let snapshot;
    for (let i = 0; i < 5000; i++) {
      const natal = Ziwei.fromBirth({ gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0 });
      assert.equal(natal.zodiac, 'Rat');
      assert.equal(natal.fiveElementBureau, 6);
      profile = natal.profile;
      palaces = natal.palaces;
      located = natal.birthTransformations();
      years = natal.decadeYears(11);
      snapshot = natal.toJSON();
      assert.equal(natal.star('WuQu').birthTransformation, 'C');
      assert.equal(natal.yearlyPalaceByName(1, 9, 'Ming').branch, 0);
      assert.equal(natal.palaces, palaces);
      if (i % 100 === 0) global.gc();
    }
    global.gc();
    assert.equal(profile.birthStem, 0);
    assert.equal(profile.birthYear, 1984);
    assert.equal(palaces.length, 12);
    assert.equal(palaces[0].stars[0].name, 'ZiWei');
    assert.ok(Object.isFrozen(palaces[0].stars[0].selfTransformations));
    assert.equal(located[0].star.name, 'LianZhen');
    assert.ok(Object.isFrozen(located[0].palace.stars));
    assert.equal(years[9].year, 2108);
    assert.equal(snapshot.originPalaceBranch, 10);
    assert.equal(Branch.zodiac(0), 'Rat');
    assert.equal(cjs.Branch, Branch);
    const queried = cjs.Ziwei.fromParameters({ gender: 1, birthStem: 0, birthBranch: 0, birthMonth: 1, ziweiBranch: 2, birthHour: 0 });
    assert.equal(queried.palaceStar(2, 'WuQu'), null);
    assert.equal(queried.decadeYears(0)[0].year, null);
    assert.throws(() => queried.yearly(0, 10), error => error instanceof ZiweiError && error.code === 'INVALID_YEARLY_INDEX');
    assert.equal(cjs.Ziwei.fromParameters({ gender: 1, birthStem: 0, birthBranch: 0, birthMonth: 1, ziweiBranch: 2, birthHour: 0 }).palaces[0].name, 'Ming');
    assert.throws(() => cjs.Ziwei.fromBirth(null), ZiweiError);
    console.log('consumer-ok');
  `,
    ],
    { ...options, cwd: directory },
  );
  assert.match(result, /consumer-ok/);
});
