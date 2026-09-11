import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, test } from "@rstest/core";

import { initialize, ZiweiError, ZiweiLifecycleError } from "@matharts/ziwei-wasm";
import type { Birth, ReadyZiweiRuntime } from "@matharts/ziwei-wasm";

import type { NativeConstruction } from "../generated/ziwei_wasm.js";
import { serveAssets } from "./fixtures/server.ts";

let raw: typeof import("../generated/ziwei_wasm.js");
let runtime: ReadyZiweiRuntime;
let server: Awaited<ReturnType<typeof serveAssets>>;
const birth: Birth = { gender: 0, birthYear: 1992, birthMonth: 8, birthDay: 15, birthHour: 3 };

beforeAll(async () => {
  const glue = new URL("../generated/ziwei_wasm.js", import.meta.url);
  raw = await import(/* webpackIgnore: true */ glue.href);
  raw.initSync({
    module: await readFile(new URL("../generated/ziwei_wasm_bg.wasm", import.meta.url)),
  });
  server = await serveAssets();
  runtime = await initialize({ wasmUrl: server.url("/wasm") });
});
afterAll(async () => {
  await server?.close();
});

function rawChart() {
  const result = raw.fromBirth(0, 1992, 8, 15, 3);
  assert.equal(result.error, null);
  assert.ok(result.natal);
  return result.natal;
}

function constructionError(result: NativeConstruction): unknown {
  try {
    assert.equal(result.natal, null, "invalid input must not allocate a chart");
    assert.ok(result.error);
    return result.error;
  } finally {
    result.natal?.free();
  }
}

function argumentFailure(result: unknown, path: string, reason: string, value: unknown): void {
  assert.ok(result !== null && typeof result === "object");
  assert.equal(Reflect.get(result, "code"), "INVALID_ARGUMENT");
  assert.equal(Reflect.get(result, "path"), path);
  assert.equal(Reflect.get(result, "reason"), reason);
  assert.equal(Reflect.get(result, "receivedType"), typeof value);
  assert.equal(Reflect.get(result, "value"), typeof value === "number" ? value : null);
}

test("raw constructors reject non-finite, fractional and overflowing values before narrowing", () => {
  const entries: { path: string; invoke: (value: unknown) => NativeConstruction }[] = [
    { path: "gender", invoke: (v) => raw.fromBirth(v, 1992, 8, 15, 3) },
    { path: "birthYear", invoke: (v) => raw.fromBirth(0, v, 8, 15, 3) },
    { path: "birthMonth", invoke: (v) => raw.fromBirth(0, 1992, v, 15, 3) },
    { path: "birthDay", invoke: (v) => raw.fromBirth(0, 1992, 8, v, 3) },
    { path: "birthHour", invoke: (v) => raw.fromBirth(0, 1992, 8, 15, v) },
    { path: "gender", invoke: (v) => raw.fromParameters(v, 0, 0, 8, 3, 3) },
    { path: "birthStem", invoke: (v) => raw.fromParameters(0, v, 0, 8, 3, 3) },
    { path: "birthBranch", invoke: (v) => raw.fromParameters(0, 0, v, 8, 3, 3) },
    { path: "birthMonth", invoke: (v) => raw.fromParameters(0, 0, 0, v, 3, 3) },
    { path: "ziweiBranch", invoke: (v) => raw.fromParameters(0, 0, 0, 8, v, 3) },
    { path: "birthHour", invoke: (v) => raw.fromParameters(0, 0, 0, 8, 3, v) },
  ];
  const invalid = [
    { value: NaN, reason: "non_finite" },
    { value: Infinity, reason: "non_finite" },
    { value: -Infinity, reason: "non_finite" },
    { value: 0.5, reason: "non_integer" },
    { value: 4_294_967_296, reason: "out_of_range" },
  ];
  for (const { path, invoke } of entries) {
    for (const { value, reason } of invalid) {
      argumentFailure(constructionError(invoke(value)), path, reason, value);
    }
    if (path !== "birthYear")
      argumentFailure(constructionError(invoke(256)), path, "out_of_range", 256);
  }
});

test("raw signed birth years retain exact endpoints and reject adjacent overflow", () => {
  for (const year of [-2_147_483_648, -1, 0, 2_147_483_647]) {
    const result = raw.fromBirth(0, year, 8, 15, 3);
    assert.equal(result.error, null);
    assert.ok(result.natal);
    try {
      assert.equal(result.natal.profile.birthYear, year);
    } finally {
      result.natal.free();
    }
  }
  for (const year of [-2_147_483_649, 2_147_483_648]) {
    argumentFailure(
      constructionError(raw.fromBirth(0, year, 8, 15, 3)),
      "birthYear",
      "out_of_range",
      year,
    );
  }
});

test("raw query errors retain the original number and leave the same chart usable", () => {
  const natal = rawChart();
  try {
    const entries = [
      { path: "branch", invoke: (v: unknown) => natal.palace(v) },
      { path: "age", invoke: (v: unknown) => natal.periodIndicesAtAge(v) },
      { path: "index", invoke: (v: unknown) => natal.decade(v) },
      { path: "index", invoke: (v: unknown) => natal.yearly(0, v) },
    ];
    for (const { path, invoke } of entries) {
      for (const value of [256, 4_294_967_296, -1])
        argumentFailure(invoke(value), path, "out_of_range", value);
      argumentFailure(invoke(0.5), path, "non_integer", 0.5);
      argumentFailure(invoke(NaN), path, "non_finite", NaN);
      assert.equal(natal.mingPalace()[0], "Ming");
    }
  } finally {
    natal.free();
  }
});

test("raw arguments reject non-numbers without invoking coercion hooks", () => {
  const natal = rawChart();
  let reads = 0;
  const coercible = {
    [Symbol.toPrimitive]() {
      reads++;
      throw new Error("must not coerce");
    },
  };
  try {
    for (const value of ["0", 0n, true, Symbol("0"), coercible]) {
      argumentFailure(natal.palace(value), "branch", "type", value);
    }
    assert.equal(reads, 0);
    assert.equal(natal.mingPalace()[0], "Ming");
  } finally {
    natal.free();
  }
});

test("raw revoked Proxy exceptions unwind numeric, enum and boolean query borrows", () => {
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const natal = rawChart();
  try {
    for (const call of [
      () => natal.palace(revoked.proxy),
      () => natal.star(revoked.proxy),
      () => natal.sanfangPalaces(0, revoked.proxy),
    ]) {
      assert.throws(
        call,
        (error: unknown) => error instanceof TypeError && !(error instanceof ZiweiError),
      );
      assert.equal(natal.mingPalace()[0], "Ming");
    }
    assert.throws(() => raw.fromBirth(revoked.proxy, 1992, 8, 15, 3), TypeError);
  } finally {
    // free also proves no Rust shared borrow was stranded by the JS exception.
    natal.free();
  }
  const next = rawChart();
  try {
    assert.equal(next.mingPalace()[0], "Ming");
  } finally {
    next.free();
  }
});

test("public input Proxy traps preserve thrown identity without poisoning a live chart", () => {
  const natal = runtime.Ziwei.fromBirth(birth);
  const thrown = { marker: "original trap exception" };
  const proxies = [
    new Proxy(birth, {
      getOwnPropertyDescriptor() {
        throw thrown;
      },
    }),
    new Proxy(birth, {
      ownKeys() {
        throw thrown;
      },
    }),
  ];
  try {
    for (const input of proxies) {
      assert.throws(
        () => runtime.Ziwei.fromBirth(input),
        (error: unknown) => error === thrown,
      );
      assert.equal(natal.mingPalace().name, "Ming");
    }
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    assert.throws(() => Reflect.apply(natal.palace, natal, [revoked.proxy]), TypeError);
    assert.equal(natal.mingPalace().name, "Ming");
  } finally {
    natal.dispose();
  }
  assert.doesNotThrow(() => natal.dispose());
  assert.throws(() => natal.mingPalace(), ZiweiLifecycleError);
});
