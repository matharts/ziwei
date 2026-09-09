import assert from "node:assert/strict";

import { test } from "@rstest/core";

import * as api from "@matharts/ziwei";

import { invoke } from "./runtime.ts";

test("identity helpers are frozen, receiver-independent and preserve the core protocol order", () => {
  assert.deepEqual(api.Stem.ALL, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(api.Branch.ALL, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(api.PalaceName.ALL, [
    "Ming",
    "XiongDi",
    "FuQi",
    "ZiNv",
    "CaiBo",
    "JiE",
    "QianYi",
    "JiaoYou",
    "GuanLu",
    "TianZhai",
    "FuDe",
    "FuMu",
  ]);
  assert.deepEqual(api.StarName.ALL, [
    "ZiWei",
    "TianJi",
    "TaiYang",
    "WuQu",
    "TianTong",
    "LianZhen",
    "TianFu",
    "TaiYin",
    "TanLang",
    "JuMen",
    "TianXiang",
    "TianLiang",
    "QiSha",
    "PoJun",
    "ZuoFu",
    "YouBi",
    "WenChang",
    "WenQu",
  ]);
  assert.deepEqual(api.Transformation.ALL, ["A", "B", "C", "D"]);
  assert.deepEqual(api.YinYang, { Yin: 0, Yang: 1 });
  assert.deepEqual(api.FiveElement, {
    Water: "Water",
    Wood: "Wood",
    Metal: "Metal",
    Earth: "Earth",
    Fire: "Fire",
  });
  for (const value of [
    api.YinYang,
    api.FiveElement,
    api.Stem.ALL,
    api.Branch.ALL,
    api.PalaceName.ALL,
    api.StarName.ALL,
    api.Transformation.ALL,
  ])
    assert.ok(Object.isFrozen(value));
  const { yinYang: gender } = api.Gender;
  const { yinYang: stem } = api.Stem;
  const { yinYang: branch, zodiac } = api.Branch;
  assert.deepEqual([gender(0), gender(1)], [0, 1]);
  assert.deepEqual(
    ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map(stem),
    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  );
  assert.deepEqual(
    ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const).map(branch),
    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  );
  assert.deepEqual(([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const).map(zodiac), [
    "Rat",
    "Ox",
    "Tiger",
    "Rabbit",
    "Dragon",
    "Snake",
    "Horse",
    "Goat",
    "Monkey",
    "Rooster",
    "Dog",
    "Pig",
  ]);
});

test("identity helpers reject malformed numbers without coercion and distinguish omission", () => {
  for (const [fn, maximum] of [
    [api.Gender.yinYang, 1],
    [api.Stem.yinYang, 9],
    [api.Branch.yinYang, 11],
    [api.Branch.zodiac, 11],
  ] as const) {
    assert.throws(
      () => invoke(fn, undefined),
      (error) =>
        error instanceof api.ZiweiError &&
        error.detail.code === "INVALID_ARGUMENT" &&
        error.detail.reason === "missing",
    );
    for (const [value, reason] of [
      [undefined, "type"],
      [null, "type"],
      ["0", "type"],
      [{}, "type"],
      [NaN, "non_finite"],
      [Infinity, "non_finite"],
      [0.5, "non_integer"],
      [-1, "out_of_range"],
      [maximum + 1, "out_of_range"],
    ]) {
      assert.throws(
        () => invoke(fn, undefined, value),
        (error) => {
          assert.ok(error instanceof api.ZiweiError);
          assert.equal(error.code, "INVALID_ARGUMENT");
          assert.ok(error.detail.code === "INVALID_ARGUMENT");
          assert.deepEqual(error.detail.path, ["value"]);
          assert.equal(error.detail.reason, reason);
          return true;
        },
      );
    }
  }
});
