import assert from "node:assert/strict";

import { test } from "@rstest/core";

import { Ziwei, ZiweiError } from "@matharts/ziwei";

import * as native from "../native/binding.cjs";
import { invoke } from "./runtime.ts";

const birth = { gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0 } as const;
const parameters = {
  gender: 1,
  birthStem: 0,
  birthBranch: 0,
  birthMonth: 1,
  ziweiBranch: 2,
  birthHour: 0,
} as const;

function fails(call: () => unknown, expected: Record<string, unknown>) {
  assert.throws(call, (error) => {
    assert.ok(error instanceof ZiweiError);
    assert.equal(error.name, "ZiweiError");
    assert.equal(error.code, error.detail.code);
    assert.match(error.message, /[\u4e00-\u9fff]/u);
    assert.ok(Object.isFrozen(error.detail));
    for (const [key, value] of Object.entries(expected))
      assert.deepEqual(Reflect.get(error.detail, key), value);
    return true;
  });
}

test("numbers are checked before narrowing, without coercion", () => {
  for (const [value, reason] of [
    [NaN, "non_finite"],
    [Infinity, "non_finite"],
    [-Infinity, "non_finite"],
    [1.5, "non_integer"],
    [-1, "out_of_range"],
    [256, "out_of_range"],
    [2 ** 32 + 1, "out_of_range"],
    [Number.MAX_SAFE_INTEGER, "out_of_range"],
  ]) {
    fails(() => invoke(Ziwei.fromBirth, undefined, { ...birth, birthMonth: value }), {
      code: "INVALID_ARGUMENT",
      path: ["birthMonth"],
      reason,
      received: { type: "number", value },
    });
  }
  for (const [value, type] of [
    ["1", "string"],
    [undefined, "undefined"],
    [null, "null"],
    [true, "boolean"],
    [1n, "bigint"],
    [Symbol("private"), "symbol"],
    [() => 1, "function"],
    [[], "array"],
    [
      {
        valueOf() {
          throw new Error("must not coerce");
        },
      },
      "object",
    ],
  ]) {
    fails(() => invoke(Ziwei.fromBirth, undefined, { ...birth, birthMonth: value }), {
      code: "INVALID_ARGUMENT",
      path: ["birthMonth"],
      reason: "type",
      received: { type },
    });
  }
});

test("core domain failures retain structured payloads and declaration order", () => {
  for (const value of [0, 13, 31, 255]) {
    fails(
      () =>
        invoke(Ziwei.fromBirth, undefined, {
          ...birth,
          birthMonth: value,
          birthHour: Infinity,
        }),
      {
        code: "INVALID_LUNISOLAR_MONTH",
        value,
      },
    );
  }
  for (const value of [0, 31, 255]) {
    fails(() => invoke(Ziwei.fromBirth, undefined, { ...birth, birthDay: value }), {
      code: "INVALID_LUNISOLAR_DAY",
      value,
    });
  }
  fails(() => invoke(Ziwei.fromParameters, undefined, { ...parameters, birthBranch: 1 }), {
    code: "INVALID_SEXAGENARY_YEAR",
    stem: 0,
    branch: 1,
  });
  fails(
    () =>
      invoke(Ziwei.fromParameters, undefined, {
        ...parameters,
        birthBranch: 1,
        birthMonth: 0,
      }),
    {
      code: "INVALID_LUNISOLAR_MONTH",
      value: 0,
    },
  );
  for (const [field, value] of [
    ["gender", 2],
    ["birthYear", 2147483648],
    ["birthYear", -2147483649],
    ["birthHour", 12],
  ]) {
    fails(() => invoke(Ziwei.fromBirth, undefined, { ...birth, [field]: value }), {
      code: "INVALID_ARGUMENT",
      path: [field],
      reason: "out_of_range",
    });
  }
  for (const [field, value] of [
    ["birthStem", 10],
    ["birthBranch", 12],
    ["ziweiBranch", 12],
  ]) {
    fails(() => invoke(Ziwei.fromParameters, undefined, { ...parameters, [field]: value }), {
      code: "INVALID_ARGUMENT",
      path: [field],
      reason: "out_of_range",
    });
  }
});

test("shape validation distinguishes missing values, rejects unknown keys and never calls accessors", () => {
  fails(() => invoke(Ziwei.fromBirth, undefined), {
    code: "INVALID_ARGUMENT",
    path: [],
    reason: "missing",
  });
  for (const input of [undefined, null, [], new Date(), "1984", 1, () => birth]) {
    fails(() => invoke(Ziwei.fromBirth, undefined, input), {
      code: "INVALID_ARGUMENT",
      path: input instanceof Date ? ["gender"] : [],
      reason: input instanceof Date ? "missing" : "type",
    });
  }
  const inherited = Object.create(birth);
  fails(() => invoke(Ziwei.fromBirth, undefined, inherited), {
    path: ["gender"],
    reason: "missing",
  });
  let calls = 0;
  const accessor = {
    ...birth,
    get birthYear() {
      calls++;
      return 1984;
    },
  };
  fails(() => invoke(Ziwei.fromBirth, undefined, accessor), {
    path: ["birthYear"],
    reason: "accessor",
    received: { type: "unread" },
  });
  const extras = {
    ...birth,
    z: 1,
    "a.b": 2,
    get a() {
      calls++;
      return 3;
    },
  };
  fails(() => invoke(Ziwei.fromBirth, undefined, extras), {
    path: ["a"],
    reason: "unknown_field",
    received: { type: "unread" },
  });
  fails(() => invoke(Ziwei.fromBirth, undefined, { ...birth, [Symbol("extra")]: 1 }), {
    path: [],
    reason: "unknown_field",
  });
  fails(() => invoke(Ziwei.fromParameters, undefined, { ...parameters, birthDay: 6 }), {
    path: ["birthDay"],
    reason: "unknown_field",
  });
  assert.equal(calls, 0);
});

test("capture reads each descriptor once and propagates proxy exceptions unchanged", () => {
  const counts = new Map();
  const proxy = new Proxy(birth, {
    getOwnPropertyDescriptor(target, key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  assert.equal(invoke(Ziwei.fromBirth, undefined, proxy).profile.birthYear, 1984);
  assert.deepEqual([...counts.values()], [1, 1, 1, 1, 1]);
  const sentinel = new Error("caller trap");
  assert.throws(
    () =>
      invoke(
        Ziwei.fromBirth,
        undefined,
        new Proxy(birth, {
          getOwnPropertyDescriptor() {
            throw sentinel;
          },
        }),
      ),
    (error) => error === sentinel,
  );
});

test("unknown fields keep lexical precedence over symbols regardless of own-key order", () => {
  for (const [create, valid] of [
    [Ziwei.fromBirth, birth],
    [Ziwei.fromParameters, parameters],
  ] as const) {
    for (const keys of [
      ["z", "a", "10", "2"],
      ["😀", "\uffff", ""],
      ["😀", "\uffff"],
    ]) {
      const input = { ...valid, [Symbol("extra")]: 1 };
      for (const key of keys) Object.defineProperty(input, key, { value: 1, configurable: true });
      const expected = keys.length === 4 ? "10" : keys.length === 3 ? "" : "😀";
      const observed: PropertyKey[] = [];
      const proxy = new Proxy(input, {
        getOwnPropertyDescriptor(target, key) {
          observed.push(key);
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
        ownKeys(target) {
          return Reflect.ownKeys(target).reverse();
        },
        get() {
          throw new Error("input property getters must not run");
        },
      });
      fails(() => invoke(create, undefined, proxy), {
        path: [expected],
        reason: "unknown_field",
      });
      assert.deepEqual(observed, Object.keys(valid));
    }
  }
});

test("the native seam rejects bad values even when the public facade is bypassed", () => {
  for (const value of [NaN, Infinity, 1.5, -1, 257, 2 ** 32 + 1, "1", null, [], {}]) {
    const result = native.fromBirth(1, 1984, value, 6, 0);
    assert.equal(result.natal, undefined);
    assert.ok(result.error);
    assert.equal(result.error.code, "INVALID_ARGUMENT");
    assert.equal(result.error.path, "birthMonth");
  }
  assert.equal(native.fromBirth(1, 1984, 13, 6, 0).error?.code, "INVALID_LUNISOLAR_MONTH");
  assert.equal(native.fromParameters(1, 0, 1, 1, 2, 0).error?.code, "INVALID_SEXAGENARY_YEAR");
});
