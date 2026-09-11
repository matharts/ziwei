import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { test } from "@rstest/core";
import { chromium, firefox, webkit } from "playwright";
import { build } from "vite";

import * as native from "@matharts/ziwei";

import { fullContract } from "./fixtures/browser.ts";
import { queryCalls, invoke } from "./fixtures/queries.ts";
import { serveAssets } from "./fixtures/server.ts";

const execute = promisify(execFile);
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const birth = { gender: 0, birthYear: 1992, birthMonth: 8, birthDay: 15, birthHour: 3 } as const;

test("the real tarball has independent ESM/types and Vite/Rslib production consumers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ziwei-wasm~consumer-"));
  try {
    const tarball = join(directory, "ziwei-wasm.tgz");
    await execute("pnpm", ["pack", "--out", tarball], { cwd: packageRoot, timeout: 30_000 });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "ziwei-wasm-isolated-consumer",
        private: true,
        type: "module",
        dependencies: { "@matharts/ziwei-wasm": "file:./ziwei-wasm.tgz" },
      }),
    );
    await execute("pnpm", ["install", "--offline", "--ignore-scripts"], {
      cwd: directory,
      timeout: 30_000,
    });
    const installed = join(directory, "node_modules", "@matharts", "ziwei-wasm");
    const manifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
    assert.equal(manifest.type, "module");
    assert.equal(manifest.private, true);
    assert.equal(manifest.dependencies, undefined);
    assert.deepEqual(Object.keys(manifest.exports), ["."]);
    for (const file of await readdir(installed)) {
      assert.ok(["dist", "package.json", "README.md", "AGENTS.md", "LICENSE"].includes(file), file);
    }
    const declaration = await readFile(join(installed, "dist", "index.d.ts"), "utf8");
    assert.doesNotMatch(declaration, /generated\/|NativeNatal|Symbol\.dispose|ESNext\.Disposable/);
    const main = join(directory, "main.ts");
    await writeFile(
      main,
      `import { initialize, type Natal, type Birth, ZiweiError } from '@matharts/ziwei-wasm';
declare global { var initializeZiwei: typeof initialize; }
globalThis.initializeZiwei = initialize;
export { initialize };
export async function contract(birth: Birth) {
  try { const { Ziwei } = await initialize(); const natal: Natal = Ziwei.fromBirth(birth); const data = natal.toJSON(); natal.dispose(); return data; }
  catch (error) { if (error instanceof ZiweiError) return error.detail; throw error; }
}
`,
    );
    const tsc = join(packageRoot, "node_modules", "typescript", "bin", "tsc");
    for (const module of ["NodeNext", "Preserve"]) {
      await execute(
        process.execPath,
        [
          tsc,
          "--ignoreConfig",
          "--noEmit",
          "--strict",
          "--exactOptionalPropertyTypes",
          "--target",
          "ES2022",
          "--lib",
          "ES2022,DOM",
          "--module",
          module,
          "--moduleResolution",
          module === "NodeNext" ? "NodeNext" : "Bundler",
          main,
        ],
        { cwd: directory, timeout: 30_000 },
      );
    }
    const imported = await execute(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "const api = await import('@matharts/ziwei-wasm'); if (typeof api.initialize !== 'function' || 'Ziwei' in api) throw new Error('Wrong ESM exports'); console.log('wasm-consumer-import-ok');",
      ],
      { cwd: directory, timeout: 30_000 },
    );
    assert.match(imported.stdout, /wasm-consumer-import-ok/);
    await writeFile(
      join(directory, "index.html"),
      '<!doctype html><meta charset="utf-8"><script type="module" src="/main.ts"></script>',
    );
    await build({
      configFile: false,
      root: directory,
      base: "/nested/",
      logLevel: "silent",
      build: { outDir: "vite-dist", assetsInlineLimit: 0, minify: false },
    });
    const rslibConfig = join(directory, "rslib.config.ts");
    await writeFile(
      rslibConfig,
      `export default {
  source: {entry: {index: './main.ts'}},
  lib: [{format: 'esm', bundle: true, autoExternal: false, syntax: 'es2022', dts: false}],
  output: {target: 'web', distPath: {root: './rslib-dist'}, dataUriLimit: 0}
};`,
    );
    await execute(
      process.execPath,
      [
        join(packageRoot, "node_modules", "@rslib", "core", "bin", "rslib.js"),
        "build",
        "--config",
        rslibConfig,
      ],
      { cwd: directory, timeout: 30_000 },
    );
    const expected = native.Ziwei.fromBirth(birth);
    const parameters = {
      gender: birth.gender,
      birthStem: expected.profile.birthStem,
      birthBranch: expected.profile.birthBranch,
      birthMonth: birth.birthMonth,
      ziweiBranch: expected.ziweiPalace().branch,
      birthHour: birth.birthHour,
    };
    const calls = queryCalls(native);
    const expectedCharts = {
      birth: expected,
      parameters: native.Ziwei.fromParameters(parameters),
    };
    for (const engine of [chromium, firefox, webkit]) {
      const browser = await engine.launch();
      try {
        for (const kind of ["tarball", "vite", "rslib"]) {
          const server = await serveAssets({
            dist: kind === "tarball" ? join(installed, "dist") : join(directory, `${kind}-dist`),
            ...(kind === "tarball" ? {} : { base: "/nested/" }),
          });
          try {
            const page = await browser.newPage();
            await page.goto(`${server.origin}${kind === "tarball" ? "/" : "/nested/"}`);
            if (kind === "rslib")
              await page.addScriptTag({
                type: "module",
                url: `${server.origin}/nested/index.js`,
              });
            const input = {
              birth,
              parameters,
              calls,
              entry: kind === "tarball" ? "package" : "consumer",
            } satisfies Parameters<typeof fullContract>[0];
            const actual = await page.evaluate(fullContract, input);
            assert.equal(actual.same, true);
            for (const entry of ["birth", "parameters"] as const) {
              const chart = actual.charts[entry];
              assert.equal(chart.frozen, true);
              assert.equal(chart.cached, true);
              assert.equal(chart.disposed, true);
              assert.deepEqual(chart.snapshot, expectedCharts[entry].toJSON());
              assert.deepEqual(
                chart.results,
                calls.map((call) => invoke(expectedCharts[entry], call)),
              );
            }
            await page.close();
          } finally {
            await server.close();
          }
        }
        console.log(
          `${engine.name()} ${browser.version()}: tarball/Vite/Rslib, two inputs, ${calls.length} queries each verified`,
        );
      } finally {
        await browser.close();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);
