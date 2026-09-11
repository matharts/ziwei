import assert from "node:assert/strict";

import { test } from "@rstest/core";
import { chromium, firefox, webkit } from "playwright";

import * as native from "@matharts/ziwei";
import { Ziwei, ZiweiError } from "@matharts/ziwei";

import {
  numberBoundaries,
  workerRecovery,
  terminateBusyWorker,
  memoryGrowth,
} from "./fixtures/browser-edge.ts";
import { queryCalls, invoke } from "./fixtures/queries.ts";
import { serveAssets } from "./fixtures/server.ts";

const birth = { gender: 0, birthYear: 1992, birthMonth: 8, birthDay: 15, birthHour: 3 } as const;

function expectedError(birthYear: number) {
  try {
    Ziwei.fromBirth({ ...birth, birthYear });
  } catch (error) {
    assert.ok(error instanceof ZiweiError);
    return { name: error.name, message: error.message, detail: error.detail };
  }
  throw new Error("Native reference accepted the invalid year");
}

for (const engine of [chromium, firefox, webkit]) {
  test(`${engine.name()}: real memory growth preserves existing charts, DTOs and disposal`, async () => {
    const server = await serveAssets();
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.goto(server.origin);
      const calls = queryCalls(native);
      const expected = Ziwei.fromBirth(birth);
      const result = await page.evaluate(memoryGrowth, { birth, calls });
      assert.equal(result.observed, 1);
      assert.equal(result.restored, true);
      assert.equal(result.before, result.previousPages * 65_536);
      assert.equal(result.after, result.before + 65_536);
      assert.equal(
        result.oldBufferBytes,
        0,
        "growth must invalidate the old non-shared memory buffer",
      );
      assert.deepEqual(
        result.results,
        calls.map((call) => invoke(expected, call)),
      );
      assert.deepEqual(result.snapshot, expected.toJSON());
      assert.deepEqual(result.retained, expected.toJSON());
      assert.equal(result.sameCache, true);
      assert.equal(result.retainedFrozen, true);
      assert.equal(result.disposed, true);
      assert.equal(result.disposedGetters, true);
    } finally {
      await browser.close();
      await server.close();
    }
  });

  test(`${engine.name()}: browser numeric boundaries preserve Node errors and original values`, async () => {
    const server = await serveAssets();
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.goto(server.origin);
      const result = await page.evaluate(numberBoundaries);
      assert.deepEqual(
        result.endpoints,
        [-2_147_483_648, 2_147_483_647].map((birthYear) =>
          Ziwei.fromBirth({ ...birth, birthYear }).toJSON(),
        ),
      );
      assert.equal(result.failures.length, 6);
      for (const { input, ...error } of result.failures)
        assert.deepEqual(error, expectedError(input));
    } finally {
      await browser.close();
      await server.close();
    }
  });

  test(`${engine.name()}: structured Worker errors retain numeric values and allow the next chart`, async () => {
    const server = await serveAssets();
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.goto(server.origin);
      const { errors, recovered } = await page.evaluate(workerRecovery);
      assert.equal(errors.length, 6);
      for (const { input, reply } of errors) {
        assert.equal(reply.status, "error");
        assert.deepEqual(reply.error, expectedError(input));
      }
      assert.equal(recovered.id, 100);
      assert.equal(recovered.status, "success");
      assert.deepEqual(recovered.snapshot, Ziwei.fromBirth(birth).toJSON());
    } finally {
      await browser.close();
      await server.close();
    }
  });

  test(`${engine.name()}: terminating a started busy Worker keeps the page and replacement usable`, async () => {
    const server = await serveAssets();
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.goto(server.origin);
      const result = await page.evaluate(terminateBusyWorker);
      assert.equal(result.started.id, 1);
      assert.ok(result.started.completed >= 16);
      assert.ok(result.ticks > 0, "main-thread timer must progress while Worker is busy");
      assert.equal(result.beforeReplacement, 1, "old task must not finish before termination");
      assert.deepEqual(
        result.messages,
        [result.started],
        "terminated task must not report success",
      );
      assert.equal(result.recovered.id, 2);
      assert.equal(result.recovered.status, "success");
      assert.deepEqual(result.recovered.snapshot, Ziwei.fromBirth(birth).toJSON());
    } finally {
      await browser.close();
      await server.close();
    }
  });
}
