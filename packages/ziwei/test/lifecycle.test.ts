import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";

import { test } from "@rstest/core";
import type { TestContext } from "@rstest/core";

import * as esm from "@matharts/ziwei";

import { invoke } from "./runtime.ts";

const birth = { gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0 } as const;

test("profile is immutable, stable by reference, detached from input and usable after chart release", () => {
  const input: { -readonly [K in keyof esm.Birth]: esm.Birth[K] } = { ...birth };
  let natal: esm.Natal | null = esm.Ziwei.fromBirth(input);
  input.birthYear = 2000;
  const profile = natal.profile;
  assert.equal(profile.birthYear, 1984);
  assert.equal(natal.profile, profile);
  assert.ok(Object.isFrozen(natal));
  assert.ok(Object.isFrozen(profile));
  assert.throws(() => {
    // @ts-expect-error Deliberately test a forbidden operation at runtime.
    natal!.profile = {};
  }, TypeError);
  assert.throws(() => {
    // @ts-expect-error Deliberately test a forbidden operation at runtime.
    profile.birthYear = 2000;
  }, TypeError);
  assert.equal(natal.constructor, undefined);
  const getter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(natal), "profile")?.get;
  assert.ok(getter);
  assert.throws(() => getter.call({}), TypeError);
  natal = null;
  assert.equal(profile.birthYear, 1984);
  assert.notEqual(esm.Ziwei.fromBirth(input).profile, profile);
});

test("ESM and CJS share entry points and error identity; only the root is public", async () => {
  const require = createRequire(import.meta.url);
  const cjs = require("@matharts/ziwei");
  assert.equal(esm.Ziwei, cjs.Ziwei);
  assert.equal(esm.ZiweiError, cjs.ZiweiError);
  assert.deepEqual(Object.keys(esm).sort(), [
    "Branch",
    "FiveElement",
    "FiveElementBureau",
    "Gender",
    "PalaceName",
    "StarCategory",
    "StarGalaxy",
    "StarName",
    "Stem",
    "Transformation",
    "YinYang",
    "Ziwei",
    "ZiweiError",
    "Zodiac",
  ]);
  assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort());
  assert.deepEqual(Object.keys(esm.Ziwei).sort(), ["fromBirth", "fromParameters"]);
  const fromBirth = esm.Ziwei.fromBirth;
  assert.equal(fromBirth(birth).profile.birthYear, 1984);
  assert.throws(
    () => invoke(fromBirth, undefined, null),
    (error) => {
      assert.ok(error instanceof esm.ZiweiError);
      assert.ok(error.detail.code === "INVALID_ARGUMENT");
      const detail = error.detail;
      assert.throws(() => {
        // @ts-expect-error Deliberately test a forbidden operation at runtime.
        error.code = "changed";
      }, TypeError);
      assert.throws(() => {
        // @ts-expect-error Runtime mutation must fail as well as the type contract.
        detail.reason = "changed";
      }, TypeError);
      assert.throws(() => {
        Array.prototype.push.call(detail.path, "changed");
      }, TypeError);
      assert.throws(() => {
        // @ts-expect-error Runtime mutation must fail as well as the type contract.
        detail.received.type = "changed";
      }, TypeError);
      return true;
    },
  );
  for (const value of [
    esm.Ziwei,
    esm.Gender,
    esm.Stem,
    esm.Branch,
    esm.Zodiac,
    esm.FiveElementBureau,
    esm.PalaceName,
    esm.StarName,
    esm.StarCategory,
    esm.StarGalaxy,
    esm.Transformation,
  ])
    assert.ok(Object.isFrozen(value));
  assert.throws(() => {
    // @ts-expect-error Deliberately test a forbidden operation at runtime.
    esm.Ziwei.fromBirth = () => null;
  }, TypeError);
  for (const subpath of ["native/binding.cjs", "dist/natal.js", "src/natal.ts", "natal"]) {
    const specifier = `@matharts/ziwei/${subpath}`;
    assert.throws(() => require(specifier), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
    await assert.rejects(import(specifier), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
  }
  // @ts-expect-error Deliberately test a forbidden operation at runtime.
  assert.throws(() => new esm.ZiweiError(), TypeError);
});

test("full i32 years and birth day boundaries preserve exact profile values", () => {
  // Fixed Euclidean sexagenary anchors, not derived from either adapter entry.
  for (const [birthYear, birthStem, birthBranch] of [
    [-2147483648, 8, 0],
    [-1, 5, 7],
    [0, 6, 8],
    [2147483647, 3, 3],
  ]) {
    for (const birthDay of [1, 30]) {
      const profile = esm.Ziwei.fromBirth({ ...birth, birthYear, birthDay }).profile;
      assert.equal(profile.birthYear, birthYear);
      assert.equal(profile.birthStem, birthStem);
      assert.equal(profile.birthBranch, birthBranch);
      assert.equal(profile.birthDay, birthDay);
    }
  }
  assert.equal(
    Object.is(
      esm.Ziwei.fromBirth({ ...birth, birthYear: -0, birthHour: -0 }).profile.birthYear,
      -0,
    ),
    false,
  );
});

// Observe both message and exit: an early exit must not leave a message promise pending.
function workerResult(worker: Worker, t: TestContext) {
  t.onTestFinished(async () => {
    await worker.terminate();
  });
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let message: Record<string, unknown> | undefined;
    worker.once("message", (value: unknown) => {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        message = value as Record<string, unknown>;
      }
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
      else if (message === undefined) reject(new Error("Worker exited without a result object"));
      else resolve(message);
    });
  });
}

test("Worker failure before a message preserves the exit or error diagnostic", async (t) => {
  for (const [source, expected] of [
    ["process.exit(2)", /Worker exited with code 2/],
    ["process.exit(0)", /Worker exited without a result object/],
    ['throw new Error("worker failure fixture")', /worker failure fixture/],
  ] as const) {
    await assert.rejects(workerResult(new Worker(source, { eval: true }), t), expected);
  }
});

test("independent Worker environments construct charts and return detached plain profiles", async (t) => {
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), {
        workerData: birth,
      });
      const message = await workerResult(worker, t);
      const natal = esm.Ziwei.fromBirth(birth);
      assert.deepEqual(message, {
        profile: natal.profile,
        palaces: natal.palaces,
        snapshot: natal.toJSON(),
        query: natal.birthTransformations(),
        period: natal.yearly(11, 9),
        frozen: true,
        palacesFrozen: true,
        queryFrozen: true,
      });
      assert.equal(Object.isFrozen(message.profile), false);
      assert.equal(Object.isFrozen(message.palaces), false);
      assert.equal(Object.isFrozen(message.query), false);
      assert.equal(Object.isFrozen(message.snapshot), false);
    }),
  );
});
