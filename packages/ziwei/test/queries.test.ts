import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { test } from "@rstest/core";

import { Ziwei, ZiweiError, StarName } from "@matharts/ziwei";
import type { Natal, Branch } from "@matharts/ziwei";

import { invoke } from "./runtime.ts";
type Method = {
  [K in keyof Natal]: Natal[K] extends (...args: never[]) => unknown ? K : never;
}[keyof Natal];

const birth = { gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0 } as const;
const parameters = {
  gender: 1,
  birthStem: 0,
  birthBranch: 0,
  birthMonth: 1,
  ziweiBranch: 2,
  birthHour: 0,
} as const;
const charts = () => [Ziwei.fromBirth(birth), Ziwei.fromParameters(parameters)];

test("inherited code properties cannot turn valid query data into domain errors", () => {
  const natal = Ziwei.fromBirth(birth);
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, "code");
  try {
    Object.defineProperty(Object.prototype, "code", { configurable: true, value: "inherited" });
    assert.equal(natal.star("ZiWei").name, "ZiWei");
    assert.equal(natal.palace(2).name, "Ming");
    assert.equal(natal.decade(0).length, 12);
    assert.equal(natal.palaceStar(2, "WuQu"), null);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(Object.prototype, "code");
    else Object.defineProperty(Object.prototype, "code", previous);
  }
});

test("relative palaces and transformation queries preserve core order and all simultaneous facts", () => {
  for (const natal of charts()) {
    assert.equal(natal.oppositePalace(2).branch, 8);
    assert.deepEqual(
      natal.sanfangPalaces(2, false).map((p) => p.branch),
      [6, 10, 8],
    );
    assert.deepEqual(
      natal.sanfangPalaces(2, true).map((p) => p.branch),
      [2, 6, 10, 8],
    );
    assert.deepEqual(
      natal.sizhengPalaces(11).map((p) => p.branch),
      [11, 3, 7, 5],
    );
    assert.deepEqual(
      [natal.mingPalace(), natal.shenPalace(), natal.originPalace(), natal.ziweiPalace()].map(
        (p) => p.branch,
      ),
      [2, 2, 10, 2],
    );
    assert.deepEqual(
      natal
        .birthTransformations()
        .map((v) => [v.palace.branch, v.star.name, v.star.birthTransformation]),
      [
        [6, "LianZhen", "A"],
        [0, "PoJun", "B"],
        [10, "WuQu", "C"],
        [11, "TaiYang", "D"],
      ],
    );
    assert.deepEqual(
      natal.selfTransformations().map((v) => [v.palace.branch, v.star.name]),
      [
        [2, "ZiWei"],
        [3, "TaiYin"],
        [4, "TanLang"],
        [6, "LianZhen"],
        [9, "TianTong"],
        [10, "WuQu"],
        [10, "YouBi"],
        [1, "TianJi"],
      ],
    );
    assert.deepEqual(natal.palaceTransformations(2), [
      { sourceBranch: 2, targetBranch: 9, transformation: "A", star: "TianTong" },
      { sourceBranch: 2, targetBranch: 1, transformation: "B", star: "TianJi" },
      { sourceBranch: 2, targetBranch: 10, transformation: "C", star: "WenChang" },
      { sourceBranch: 2, targetBranch: 6, transformation: "D", star: "LianZhen" },
    ]);
    assert.deepEqual(natal.palaceTransformation(2, "D"), {
      sourceBranch: 2,
      targetBranch: 6,
      transformation: "D",
      star: "LianZhen",
    });
  }
  const ren = Ziwei.fromBirth({
    gender: 0,
    birthYear: 1992,
    birthMonth: 8,
    birthDay: 17,
    birthHour: 3,
  });
  assert.deepEqual(ren.palaceTransformationSources(0), [
    { sourceBranch: 2, targetBranch: 0, transformation: "A", star: "TianLiang" },
    { sourceBranch: 5, targetBranch: 0, transformation: "B", star: "TianLiang" },
    { sourceBranch: 9, targetBranch: 0, transformation: "C", star: "TianLiang" },
    { sourceBranch: 0, targetBranch: 0, transformation: "A", star: "TianLiang" },
  ]);
  assert.deepEqual(ren.palaceTransformationSources(2), []);
  const tanLang = ren.selfTransformations().filter((v) => v.star.name === "TanLang");
  assert.equal(tanLang.length, 1);
  assert.deepEqual(tanLang[0].star.selfTransformations, { inward: "D", outward: "B" });
  assert.equal(ren.birthTransformations()[2].star.name, "ZuoFu");
});

test("single palace and star queries locate the hand-derived Jia Zi facts", () => {
  // Independent expected locations: core fixtures/README.md and jia_zi_fire_six.csv.
  for (const natal of charts()) {
    assert.equal(natal.palace(2).name, "Ming");
    assert.equal(natal.palaceByName("CaiBo").branch, 10);
    assert.equal(natal.palaceByStar("WenQu").branch, 4);
    assert.equal(natal.star("WuQu").birthTransformation, "C");
    assert.equal(natal.palaceStar(10, "WuQu")?.nameHant, "武曲");
    assert.equal(natal.palaceStar(2, "WuQu"), null);
    assert.deepEqual(natal.star("TaiYin").selfTransformations, { inward: "C", outward: "A" });
    assert.ok(Object.isFrozen(natal.palace(2).stars[0].selfTransformations));
  }
});

test("every palace and star identity is queryable against the independent fixed fixture", () => {
  const branches: Record<string, Branch> = {
    Zi: 0,
    Chou: 1,
    Yin: 2,
    Mao: 3,
    Chen: 4,
    Si: 5,
    Wu: 6,
    Wei: 7,
    Shen: 8,
    You: 9,
    Xu: 10,
    Hai: 11,
  };
  const fixture = readFileSync(
    new URL("../../../crates/ziwei/tests/fixtures/jia_zi_fire_six.csv", import.meta.url),
    "utf8",
  )
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(","));
  const names = [
    ["Ming", 2],
    ["XiongDi", 1],
    ["FuQi", 0],
    ["ZiNv", 11],
    ["CaiBo", 10],
    ["JiE", 9],
    ["QianYi", 8],
    ["JiaoYou", 7],
    ["GuanLu", 6],
    ["TianZhai", 5],
    ["FuDe", 4],
    ["FuMu", 3],
  ] as const;
  for (const natal of charts()) {
    for (const [name, branch] of names) {
      assert.equal(natal.palaceByName(name).branch, branch);
      assert.equal(natal.palace(branch).name, name);
    }
    for (const [name, branch, birth, inward, outward] of fixture) {
      const starName = StarName.ALL.find((value) => value === name);
      assert.ok(starName);
      const star = natal.star(starName);
      assert.equal(star.name, name);
      assert.equal(natal.palaceByStar(starName).branch, branches[branch]);
      assert.equal(star.birthTransformation, birth === "-" ? null : birth);
      assert.deepEqual(star.selfTransformations, {
        inward: inward === "-" ? null : inward,
        outward: outward === "-" ? null : outward,
      });
      assert.deepEqual(natal.palaceStar(branches[branch], starName), star);
    }
  }
});

test("query arguments retain exact paths, numeric reasons and structured domain failures", () => {
  const natal = Ziwei.fromBirth(birth);
  const calls: [Method, unknown[], string[]][] = [
    ["palace", [2], ["branch"]],
    ["oppositePalace", [2], ["branch"]],
    ["sanfangPalaces", [2, true], ["branch", "includeSelf"]],
    ["sizhengPalaces", [2], ["branch"]],
    ["palaceByName", ["Ming"], ["name"]],
    ["palaceByStar", ["ZiWei"], ["name"]],
    ["star", ["ZiWei"], ["name"]],
    ["palaceStar", [2, "ZiWei"], ["branch", "name"]],
    ["palaceTransformation", [2, "A"], ["sourceBranch", "kind"]],
    ["palaceTransformations", [2], ["sourceBranch"]],
    ["palaceTransformationSources", [2], ["targetBranch"]],
    ["periodIndicesAtAge", [6], ["age"]],
    ["decade", [0], ["index"]],
    ["decadeByBranch", [0, 2], ["decade", "branch"]],
    ["decadePalaceByName", [0, "Ming"], ["decade", "name"]],
    ["decadeYears", [0], ["decade"]],
    ["yearly", [0, 0], ["decade", "index"]],
    ["yearlyByBranch", [0, 0, 2], ["decade", "yearly", "branch"]],
    ["yearlyPalaceByName", [0, 0, "Ming"], ["decade", "yearly", "name"]],
  ];
  const failure = (call: () => unknown, path: string, reason: unknown, value?: unknown) =>
    assert.throws(call, (error) => {
      assert.ok(error instanceof ZiweiError);
      assert.equal(error.code, "INVALID_ARGUMENT");
      assert.ok(error.detail.code === "INVALID_ARGUMENT");
      assert.equal(error.code, error.detail.code);
      assert.deepEqual(error.detail.path, [path]);
      assert.equal(error.detail.reason, reason);
      assert.ok(Object.isFrozen(error.detail.received));
      if (typeof value === "number") {
        assert.ok(error.detail.received.type === "number");
        assert.ok(Object.is(error.detail.received.value, value));
      }
      return true;
    });
  for (const [method, args, paths] of calls) {
    for (let i = 0; i < args.length; i++) {
      failure(() => invoke(natal[method], natal, ...args.slice(0, i)), paths[i], "missing");
      for (const value of [undefined, null, {}, [], 1n, Symbol("invalid"), () => 2]) {
        const invalid = args.with(i, value);
        failure(() => invoke(natal[method], natal, ...invalid), paths[i], "type", value);
      }
      if (typeof args[i] === "number") {
        for (const [value, reason] of [
          [NaN, "non_finite"],
          [Infinity, "non_finite"],
          [-Infinity, "non_finite"],
          [1.5, "non_integer"],
          [-1, "out_of_range"],
          [256, "out_of_range"],
          [4294967296, "out_of_range"],
        ]) {
          failure(
            () => invoke(natal[method], natal, ...args.with(i, value)),
            paths[i],
            reason,
            value,
          );
        }
        failure(() => invoke(natal[method], natal, ...args.with(i, "2")), paths[i], "type");
      } else if (typeof args[i] === "string") {
        for (const value of ["", "constructor", "toString", "__proto__", "紫微"]) {
          failure(
            () => invoke(natal[method], natal, ...args.with(i, value)),
            paths[i],
            "not_member",
          );
        }
        failure(() => invoke(natal[method], natal, ...args.with(i, 123)), paths[i], "type", 123);
      } else {
        failure(() => invoke(natal[method], natal, ...args.with(i, 1)), paths[i], "type", 1);
      }
    }
    assert.throws(
      () => invoke(natal[method], {}, ...args),
      (error) => error instanceof TypeError && !(error instanceof ZiweiError),
    );
    assert.throws(
      () => invoke(natal[method], {}),
      (error) => error instanceof TypeError && !(error instanceof ZiweiError),
    );
  }
  for (const [method, args, code, value] of [
    ["decade", [12], "INVALID_DECADE_INDEX", 12],
    ["decadeYears", [255], "INVALID_DECADE_INDEX", 255],
    ["yearly", [0, 10], "INVALID_YEARLY_INDEX", 10],
    ["yearlyByBranch", [0, 255, 2], "INVALID_YEARLY_INDEX", 255],
    ["yearlyPalaceByName", [0, 10, "Ming"], "INVALID_YEARLY_INDEX", 10],
  ] as const)
    assert.throws(
      () => invoke(natal[method], natal, ...args),
      (error) => {
        assert.ok(error instanceof ZiweiError);
        assert.deepEqual(error.detail, { code, value });
        assert.equal(error.code, code);
        return true;
      },
    );
  const sentinel = new Error("must not coerce input");
  const hostile = {
    valueOf() {
      throw sentinel;
    },
    toString() {
      throw sentinel;
    },
    [Symbol.toPrimitive]() {
      throw sentinel;
    },
  };
  failure(() => invoke(natal.palace, natal, hostile), "branch", "type");
  failure(() => invoke(natal.star, natal, hostile), "name", "type");
});

test("single queries do not require whole-chart snapshots, do not cache failures and return deeply readonly data", () => {
  const natal = Ziwei.fromBirth(birth);
  const freeze = Object.freeze;
  const sentinel = new Error("host conversion failure");
  try {
    Object.freeze = <T>(value: T): Readonly<T> => {
      if (
        (Array.isArray(value) && value.length === 12) ||
        (value &&
          typeof value === "object" &&
          ("birthYear" in value || ("name" in value && value.name === "ZiWei")))
      )
        throw sentinel;
      return freeze(value);
    };
    assert.throws(
      () => natal.palaces,
      (error) => error === sentinel,
    );
    assert.throws(
      () => natal.profile,
      (error) => error === sentinel,
    );
    assert.equal(natal.star("WuQu").birthTransformation, "C");
    assert.equal(natal.palace(10).name, "CaiBo");
    assert.equal(natal.palaceByName("CaiBo").branch, 10);
    assert.equal(natal.palaceByStar("WuQu").branch, 10);
    assert.equal(natal.palaceStar(10, "WuQu")?.name, "WuQu");
    assert.equal(natal.palaceTransformation(2, "D").star, "LianZhen");
    assert.equal(natal.decadeByBranch(0, 2).name, "Ming");
    assert.equal(natal.yearlyByBranch(0, 0, 5).name, "Ming");
    assert.throws(
      () => natal.star("ZiWei"),
      (error) => error === sentinel,
    );
  } finally {
    Object.freeze = freeze;
  }
  assert.equal(natal.star("ZiWei").name, "ZiWei");
  assert.equal(natal.palaces.length, 12);
  const deepFrozen = (value: unknown) => {
    if (value === null || typeof value !== "object") return;
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) deepFrozen(child);
  };
  for (const result of [
    natal.birthTransformations(),
    natal.selfTransformations(),
    natal.palaceTransformations(2),
    natal.palaceTransformationSources(0),
    natal.sanfangPalaces(2, true),
    natal.sizhengPalaces(2),
    natal.decade(0),
    natal.yearly(0, 0),
    natal.decadeYears(0),
    natal.periodIndicesAtAge(6),
  ])
    deepFrozen(result);
});
