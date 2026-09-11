import assert from "node:assert/strict";

import { afterAll, beforeAll, test } from "@rstest/core";

import * as reference from "@matharts/ziwei";
import { initialize, ZiweiError, ZiweiLifecycleError } from "@matharts/ziwei-wasm";
import type { Birth, ReadyZiweiRuntime } from "@matharts/ziwei-wasm";

import { queryCalls, invoke, assertFrozen, facts } from "./fixtures/queries.ts";
import { serveAssets } from "./fixtures/server.ts";

let server: Awaited<ReturnType<typeof serveAssets>>;
let runtime: ReadyZiweiRuntime;
beforeAll(async () => {
  server = await serveAssets();
  runtime = await initialize({ wasmUrl: server.url("/wasm") });
});
afterAll(async () => {
  await server?.close();
});

test("explicit initialization shares one complete frozen runtime", async () => {
  assert.equal(await initialize({ wasmUrl: server.url("/wasm") }), runtime);
  assert.equal(server.hits.get("/wasm"), 1);
  assert.ok(Object.isFrozen(runtime));
  for (const value of Object.values(runtime)) assert.ok(Object.isFrozen(value));
  assert.equal(
    runtime.Gender.yinYang(runtime.Gender.Female),
    reference.Gender.yinYang(reference.Gender.Female),
  );
  for (const stem of runtime.Stem.ALL)
    assert.equal(runtime.Stem.yinYang(stem), reference.Stem.yinYang(stem));
  for (const branch of runtime.Branch.ALL) {
    assert.equal(runtime.Branch.yinYang(branch), reference.Branch.yinYang(branch));
    assert.equal(runtime.Branch.zodiac(branch), reference.Branch.zodiac(branch));
  }
});

test("real Wasm matches every finite query against the native adapter for both inputs", () => {
  const calls = queryCalls(runtime);
  const births: Birth[] = [
    { gender: 0, birthYear: 1992, birthMonth: 8, birthDay: 15, birthHour: 3 },
    { gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 1, birthHour: 0 },
    { gender: 0, birthYear: -2147483648, birthMonth: 12, birthDay: 30, birthHour: 11 },
    { gender: 1, birthYear: 2147483647, birthMonth: 6, birthDay: 29, birthHour: 5 },
  ];
  for (const birth of births) {
    const native = reference.Ziwei.fromBirth(birth);
    const wasm = runtime.Ziwei.fromBirth(birth);
    const parameters = {
      gender: birth.gender,
      birthStem: native.profile.birthStem,
      birthBranch: native.profile.birthBranch,
      birthMonth: birth.birthMonth,
      ziweiBranch: native.ziweiPalace().branch,
      birthHour: birth.birthHour,
    };
    const pair = runtime.Ziwei.fromParameters(parameters);
    const expectedPair = reference.Ziwei.fromParameters(parameters);
    try {
      assert.deepEqual(facts(wasm), facts(native));
      assert.deepEqual(facts(pair), facts(expectedPair));
      for (const call of calls) {
        const actual = invoke(wasm, call);
        assert.deepEqual(actual, invoke(native, call), call.method);
        assertFrozen(actual);
        assert.deepEqual(invoke(pair, call), invoke(expectedPair, call), call.method);
      }
    } finally {
      wasm.dispose();
      pair.dispose();
    }
  }
});

test("all output ownership and explicit disposal contracts are preserved", () => {
  const natal = runtime.Ziwei.fromBirth({
    gender: 0,
    birthYear: 1992,
    birthMonth: 8,
    birthDay: 15,
    birthHour: 3,
  });
  const snapshot = natal.toJSON();
  assert.equal(natal.profile, natal.profile);
  assert.equal(natal.palaces, natal.palaces);
  assertFrozen(snapshot);
  assert.equal(Object.getPrototypeOf(natal).constructor, undefined);
  natal.dispose();
  natal.dispose();
  for (const name of ["profile", "palaces", "zodiac", "fiveElementBureau"]) {
    assert.throws(() => Reflect.get(natal, name), ZiweiLifecycleError);
  }
  for (const call of queryCalls(runtime))
    assert.throws(() => invoke(natal, call), ZiweiLifecycleError);
  assert.equal(snapshot.palaces.length, 12);
  assertFrozen(snapshot);
});

test("input errors and getter defense match the current native contract", () => {
  const input = { gender: 0, birthYear: 1992, birthMonth: 8, birthDay: 15, birthHour: 3 };
  const invalid = [
    null,
    undefined,
    [],
    {},
    { ...input, birthMonth: 0 },
    { ...input, birthDay: 31 },
    { ...input, gender: NaN },
    { ...input, birthHour: Infinity },
    { ...input, birthYear: 1.5 },
    { ...input, birthYear: 2147483648 },
    { ...input, extra: true },
    { ...input, [Symbol("extra")]: 1 },
  ];
  let getterCalls = 0;
  invalid.push(
    Object.defineProperty({ ...input }, "birthYear", {
      get() {
        getterCalls++;
        return 1992;
      },
    }),
  );
  for (const value of invalid) {
    const captured = (fn: Function) => {
      try {
        Reflect.apply(fn, undefined, [value]);
      } catch (error) {
        return error;
      }
      throw new Error("Expected rejection");
    };
    const actual = captured(runtime.Ziwei.fromBirth);
    const expected = captured(reference.Ziwei.fromBirth);
    assert.ok(actual instanceof ZiweiError);
    assert.ok(expected instanceof reference.ZiweiError);
    assert.deepEqual(actual.detail, expected.detail);
    assert.equal(actual.message, expected.message);
  }
  assert.equal(getterCalls, 0);
  assert.throws(
    () => Reflect.apply(runtime.Ziwei.fromBirth, null, []),
    (error: unknown) =>
      error instanceof ZiweiError &&
      error.detail.code === "INVALID_ARGUMENT" &&
      error.detail.reason === "missing",
  );
  assert.throws(
    () =>
      runtime.Ziwei.fromParameters({
        gender: 0,
        birthStem: 0,
        birthBranch: 1,
        birthMonth: 1,
        ziweiBranch: 0,
        birthHour: 0,
      }),
    (error: unknown) => error instanceof ZiweiError && error.code === "INVALID_SEXAGENARY_YEAR",
  );
});

test("repeated allocation, explicit cleanup and retained DTOs remain usable", () => {
  for (let i = 0; i < 1000; i++) {
    const natal = runtime.Ziwei.fromBirth({
      gender: 0,
      birthYear: 1992,
      birthMonth: 8,
      birthDay: 15,
      birthHour: 3,
    });
    const palace = natal.mingPalace();
    natal.dispose();
    assert.equal(palace.name, "Ming");
  }
});
