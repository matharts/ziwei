import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** Real registry-shaped exact dependencies, redirected to local tarballs for this test only. */
export function verifyDistribution(artifactsDirectory: string) {
  const artifacts = JSON.parse(readFileSync(join(artifactsDirectory, "artifacts.json"), "utf8"));
  assert.equal(artifacts.platforms.length, 1, "runtime verification requires one explicit target");
  const platform = artifacts.platforms[0];
  const directory = mkdtempSync(join(tmpdir(), "ziwei-distribution~consumer-"));
  const env = { ...process.env };
  // No developer override or global module path may hide a broken package.
  for (const key of [
    "NAPI_RS_NATIVE_LIBRARY_PATH",
    "NAPI_RS_FORCE_WASI",
    "NODE_PATH",
    "NODE_OPTIONS",
    "NAPI_RS_ENFORCE_VERSION_CHECK",
  ])
    delete env[key];
  const options = { cwd: directory, env, encoding: "utf8" as const, timeout: 30_000 };
  try {
    const nativeTarball = `file:${join(artifactsDirectory, platform.tarball).replaceAll("\\", "/")}`;
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({
        name: "ziwei-distribution-consumer",
        private: true,
        type: "module",
        dependencies: {
          "@matharts/ziwei": `file:${join(artifactsDirectory, artifacts.main).replaceAll("\\", "/")}`,
        },
        overrides: { [platform.name]: nativeTarball },
      }),
    );
    // npm ships with the Node container; do not install workspace tooling in runtime images.
    // Launch its JS CLI directly because npm.cmd is not an executable on Windows.
    const npmCli = process.env.ZIWEI_NPM_CLI;
    if (!npmCli) throw new Error("ZIWEI_NPM_CLI must point to the selected Node runtime's npm CLI");
    execFileSync(
      process.execPath,
      [npmCli, "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"],
      options,
    );
    const mainRoot = join(directory, "node_modules/@matharts/ziwei");
    const nativeRoot = join(directory, "node_modules", platform.name);
    const manifest = JSON.parse(readFileSync(join(mainRoot, "package.json"), "utf8"));
    const nativeManifest = JSON.parse(readFileSync(join(nativeRoot, "package.json"), "utf8"));
    assert.deepEqual(manifest.optionalDependencies, { [platform.name]: manifest.version });
    assert.equal(nativeManifest.version, manifest.version);
    assert.deepEqual(nativeManifest.os, [process.platform]);
    assert.deepEqual(nativeManifest.cpu, [process.arch]);
    if (process.platform === "linux") {
      const report = process.report.getReport() as { header: { glibcVersionRuntime?: string } };
      assert.deepEqual(nativeManifest.libc, [report.header.glibcVersionRuntime ? "glibc" : "musl"]);
    }
    assert.equal(manifest.private, true);
    assert.equal(nativeManifest.private, true);
    assert.equal(manifest.scripts, undefined);
    assert.equal(nativeManifest.scripts, undefined);
    assert.deepEqual(readdirSync(mainRoot).sort(), [
      "AGENTS.md",
      "LICENSE",
      "README.md",
      "dist",
      "native",
      "package.json",
    ]);
    assert.deepEqual(readdirSync(join(mainRoot, "native")).sort(), [
      "binding.cjs",
      "binding.d.cts",
    ]);
    assert.deepEqual(
      readdirSync(nativeRoot).sort(),
      ["LICENSE", "README.md", "package.json", nativeManifest.main].sort(),
    );
    const mainFiles = readdirSync(mainRoot, { recursive: true }) as string[];
    assert.ok(mainFiles.every((file) => !file.endsWith(".node")));
    assert.equal(
      readFileSync(join(mainRoot, "LICENSE"), "utf8"),
      readFileSync(join(nativeRoot, "LICENSE"), "utf8"),
    );
    // Full runner jobs check declarations from the installed tarball; Alpine only
    // runs the consumer, without the workspace's glibc-based TypeScript compiler.
    const tscCli = process.env.ZIWEI_TSC_CLI;
    if (tscCli) {
      const source = `import { Ziwei, type Natal } from '@matharts/ziwei';\nconst natal: Natal = Ziwei.fromBirth({gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0});\nvoid natal.toJSON();\n`;
      for (const file of ["consumer.ts", "consumer.cts"])
        writeFileSync(join(directory, file), source);
      execFileSync(
        process.execPath,
        [
          tscCli,
          "--ignoreConfig",
          "--noEmit",
          "--strict",
          "--module",
          "NodeNext",
          "--target",
          "ES2022",
          "consumer.ts",
          "consumer.cts",
        ],
        options,
      );
    }
    const run = (source: string, extraEnv: NodeJS.ProcessEnv = {}) =>
      spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
        ...options,
        env: { ...env, ...extraEnv },
      });
    const runtime = run(
      `
      import assert from 'node:assert/strict';
      import { realpathSync } from 'node:fs';
      import { createRequire } from 'node:module';
      import { Ziwei, ZiweiError, Branch } from '@matharts/ziwei';
      const require = createRequire(import.meta.url);
      const cjs = require('@matharts/ziwei');
      assert.equal(cjs.Ziwei, Ziwei);
      assert.equal(cjs.ZiweiError, ZiweiError);
      assert.equal(cjs.Branch, Branch);
      const natal = Ziwei.fromBirth({ gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0 });
      assert.equal(natal.fiveElementBureau, 6);
      assert.equal(natal.palaces.length, 12);
      assert.equal(natal.star('WuQu').birthTransformation, 'C');
      assert.equal(natal.yearlyPalaceByName(1, 9, 'Ming').branch, 0);
      assert.ok(Object.isFrozen(natal.palaces[0].stars));
      const queried = Ziwei.fromParameters({ gender: 1, birthStem: 0, birthBranch: 0, birthMonth: 1, ziweiBranch: 2, birthHour: 0 });
      assert.equal(queried.decadeYears(0)[0].year, null);
      assert.throws(() => Ziwei.fromBirth(null), ZiweiError);
      assert.equal(realpathSync.native(require.resolve(${JSON.stringify(platform.name)})), ${JSON.stringify(realpathSync.native(join(nativeRoot, nativeManifest.main)))});
    `,
      { NAPI_RS_ENFORCE_VERSION_CHECK: "1" },
    );
    assert.equal(runtime.status, 0, runtime.stderr);
    const checkFailure = (extraEnv: NodeJS.ProcessEnv = {}, pattern?: RegExp) => {
      const result = run("await import('@matharts/ziwei')", extraEnv);
      assert.notEqual(result.status, 0, "broken distribution must not load");
      assert.match(result.stderr, /Cannot find native binding/);
      if (pattern) assert.match(result.stderr, pattern);
    };
    // Missing dependency: a main-package binary must not rescue this import.
    renameSync(nativeRoot, `${nativeRoot}.missing`);
    checkFailure({}, /@matharts\/ziwei-/);
    renameSync(`${nativeRoot}.missing`, nativeRoot);
    // The generated loader's version enforcement is explicitly opt-in.
    writeFileSync(
      join(nativeRoot, "package.json"),
      JSON.stringify({ ...nativeManifest, version: "0.0.0-wrong" }),
    );
    checkFailure({ NAPI_RS_ENFORCE_VERSION_CHECK: "1" }, /0\.0\.0-wrong/);
    writeFileSync(join(nativeRoot, "package.json"), JSON.stringify(nativeManifest));
    // Modify only npm's private extracted copy, never the build or tarball.
    writeFileSync(join(nativeRoot, nativeManifest.main), "not a native library");
    checkFailure();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const directory = process.argv[2];
  if (!directory) throw new Error("expected a distribution artifacts directory");
  verifyDistribution(resolve(directory));
  console.log(`distribution-consumer-ok ${process.platform}/${process.arch}`);
}
