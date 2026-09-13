import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { test } from "@rstest/core";
import { chromium, firefox, webkit } from "playwright";

import * as native from "@matharts/ziwei";

import {
  fullContract,
  runWorker,
  resourceFailure,
  corsFailure,
  cspFailure,
  metadataProjection,
  metadataReuse,
} from "./fixtures/browser.ts";
import { queryCalls, invoke } from "./fixtures/queries.ts";
import { serveAssets } from "./fixtures/server.ts";

const birth = { gender: 0, birthYear: 1992, birthMonth: 8, birthDay: 15, birthHour: 3 } as const;

test("webkit: Worker progress does not depend on animation frames", async () => {
  const server = await serveAssets();
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage();
    await page.goto(server.origin);
    // Model a browser withholding rendering opportunities while tasks still run.
    await page.evaluate(() => {
      globalThis.requestAnimationFrame = () => 0;
    });
    const expected = native.Ziwei.fromBirth(birth);
    const result = await page.evaluate(runWorker, {
      birth,
      parameters: {
        gender: birth.gender,
        birthStem: expected.profile.birthStem,
        birthBranch: expected.profile.birthBranch,
        birthMonth: birth.birthMonth,
        ziweiBranch: expected.ziweiPalace().branch,
        birthHour: birth.birthHour,
      },
      calls: [],
    });
    assert.ok(result.ticks > 0, "the main thread must respond while the Worker job is active");
    assert.equal(
      Reflect.get(result, "completed"),
      50_000,
      "the Worker must finish a fixed batch independently",
    );
    assert.deepEqual(result.charts.birth.snapshot, expected.toJSON());
  } finally {
    await browser.close();
    await server.close();
  }
});

for (const engine of [chromium, firefox, webkit]) {
  test(`${engine.name()}: cold metadata projection retries and keeps chart ownership`, async () => {
    const server = await serveAssets();
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.goto(server.origin);
      assert.deepEqual(
        await page.evaluate(metadataProjection, birth),
        native.Ziwei.fromBirth(birth).toJSON(),
      );
    } finally {
      await browser.close();
      await server.close();
    }
  });

  test(`${engine.name()}: metadata reuses bounded strings within each Wasm instance`, async () => {
    const server = await serveAssets({ dist: fileURLToPath(new URL("..", import.meta.url)) });
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.goto(server.origin);
      const instances = await page.evaluate(metadataReuse, birth);
      assert.equal(instances.length, 2);
      for (const instance of instances) assert.equal(instance.retained, 18 * 7 + 12 * 3);
    } finally {
      await browser.close();
      await server.close();
    }
  });

  test(`${engine.name()}: default asset, all queries, lifecycle and non-isolated Worker consumer`, async () => {
    const server = await serveAssets({
      csp: "script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'",
    });
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.goto(server.origin);
      const calls = queryCalls(native);
      const expected = native.Ziwei.fromBirth(birth);
      const parameters = {
        gender: birth.gender,
        birthStem: expected.profile.birthStem,
        birthBranch: expected.profile.birthBranch,
        birthMonth: birth.birthMonth,
        ziweiBranch: expected.ziweiPalace().branch,
        birthHour: birth.birthHour,
      };
      const expectedCharts = {
        birth: expected,
        parameters: native.Ziwei.fromParameters(parameters),
      };
      const input = { birth, parameters, calls };
      const result = await page.evaluate(fullContract, input);
      assert.equal(result.isolated, false);
      assert.equal(result.same, true);
      const workerResult = await page.evaluate(runWorker, input);
      assert.equal(workerResult.isolated, false);
      assert.equal(workerResult.same, true);
      for (const output of [result, workerResult]) {
        for (const entry of ["birth", "parameters"] as const) {
          const actual = output.charts[entry];
          assert.equal(actual.frozen, true);
          assert.equal(actual.cached, true);
          assert.equal(actual.disposed, true);
          assert.deepEqual(actual.snapshot, expectedCharts[entry].toJSON());
          assert.deepEqual(
            actual.results,
            calls.map((call) => invoke(expectedCharts[entry], call)),
          );
        }
      }
      assert.equal(workerResult.cloneFrozen, false);
      assert.ok(workerResult.ticks > 0);
      assert.equal(workerResult.completed, 50_000);
      console.log(
        `${engine.name()} ${browser.version()}: page and Worker, two inputs, ${calls.length} queries each verified`,
      );
    } finally {
      await browser.close();
      await server.close();
    }
  }, 60_000);

  test(`${engine.name()}: CSP, CORS and resource failures are visible and retryable`, async () => {
    const server = await serveAssets();
    const cdn = await serveAssets();
    const blocked = await serveAssets({ csp: "script-src 'self'; connect-src 'self'" });
    const browser = await engine.launch();
    try {
      for (const [path, code] of [
        ["/missing", "INVALID_RESPONSE"],
        ["/wrong-mime", "INVALID_RESPONSE"],
        ["/corrupt", "INTEGRITY_MISMATCH"],
      ]) {
        assert.ok(path);
        const page = await browser.newPage();
        await page.goto(server.origin);
        const result = await page.evaluate(resourceFailure, {
          bad: server.url(path).href,
          good: server.url("/wasm").href,
        });
        assert.equal(result.code, code);
        assert.equal(result.ready, true);
        await page.close();
      }
      const page = await browser.newPage();
      await page.goto(server.origin);
      const cors = await page.evaluate(corsFailure, {
        denied: cdn.url("/wasm").href,
        allowed: cdn.url("/cors").href,
      });
      assert.equal(cors.deniedCode, "LOAD_FAILED");
      assert.equal(cors.ready, true);
      const restrictive = await browser.newPage();
      await restrictive.goto(blocked.origin);
      const csp = await restrictive.evaluate(cspFailure);
      assert.equal(csp, "INSTANTIATION_FAILED");
    } finally {
      await browser.close();
      await server.close();
      await cdn.close();
      await blocked.close();
    }
  }, 60_000);
}
