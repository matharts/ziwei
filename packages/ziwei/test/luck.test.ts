import assert from "node:assert/strict";

import { test } from "@rstest/core";

import { Ziwei } from "@matharts/ziwei";

const birth = { gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0 } as const;
const parameters = {
  gender: 1,
  birthStem: 0,
  birthBranch: 0,
  birthMonth: 1,
  ziweiBranch: 2,
  birthHour: 0,
} as const;

test("luck queries preserve natal roles and expose selected periods without requiring a numeric year", () => {
  // Jia Zi fire-six: second decade starts at Mao, ages 16..25; last year is 2008 Zi.
  for (const natal of [Ziwei.fromBirth(birth), Ziwei.fromParameters(parameters)]) {
    assert.deepEqual(
      natal.decade(1).map((v) => v.name),
      [
        "XiongDi",
        "Ming",
        "FuMu",
        "FuDe",
        "TianZhai",
        "GuanLu",
        "JiaoYou",
        "QianYi",
        "JiE",
        "CaiBo",
        "ZiNv",
        "FuQi",
      ],
    );
    assert.deepEqual(natal.decadeByBranch(1, 3), {
      name: "Ming",
      nameHans: "大命",
      nameHant: "大命",
    });
    const palace = natal.decadePalaceByName(1, "Ming");
    assert.equal(palace.branch, 3);
    assert.equal(palace.name, "FuMu");
    assert.deepEqual(
      natal.yearly(1, 9).map((v) => v.name),
      [
        "FuDe",
        "TianZhai",
        "GuanLu",
        "JiaoYou",
        "QianYi",
        "JiE",
        "CaiBo",
        "ZiNv",
        "FuQi",
        "XiongDi",
        "Ming",
        "FuMu",
      ],
    );
    assert.deepEqual(natal.yearlyByBranch(1, 9, 0), {
      name: "Ming",
      nameHans: "流命",
      nameHant: "流命",
    });
    assert.equal(natal.yearlyPalaceByName(1, 9, "Ming").branch, 0);
    assert.equal(natal.yearlyPalaceByName(1, 9, "Ming").name, "FuQi");
    assert.deepEqual(
      natal.decadeYears(1).map((v) => v.age),
      [16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
    );
    for (const [age, expected] of [
      [0, null],
      [5, null],
      [6, { decade: 0, yearly: 0 }],
      [35, { decade: 2, yearly: 9 }],
      [125, { decade: 11, yearly: 9 }],
      [126, null],
      [255, null],
    ] as const) {
      assert.deepEqual(natal.periodIndicesAtAge(age), expected);
    }
  }
  assert.deepEqual(
    Ziwei.fromBirth(birth)
      .decadeYears(1)
      .map((v) => v.year),
    [1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008],
  );
  assert.deepEqual(
    Ziwei.fromParameters(parameters)
      .decadeYears(1)
      .map((v) => v.year),
    Array(10).fill(null),
  );
});

test("reverse decades, first and final indices, and numeric year extremes remain exact", () => {
  // Ren Shen female: water-two, reverse from Wu; period 11 is Wei, age 121 is Shen year.
  for (const natal of [
    Ziwei.fromBirth({ gender: 0, birthYear: 1992, birthMonth: 8, birthDay: 17, birthHour: 3 }),
    Ziwei.fromParameters({
      gender: 0,
      birthStem: 8,
      birthBranch: 8,
      birthMonth: 8,
      ziweiBranch: 9,
      birthHour: 3,
    }),
  ]) {
    assert.equal(natal.decadePalaceByName(0, "Ming").branch, 6);
    assert.equal(natal.decadePalaceByName(1, "Ming").branch, 5);
    assert.equal(natal.decadePalaceByName(11, "Ming").branch, 7);
    assert.equal(natal.decade(11)[5].name, "Ming");
    assert.equal(natal.yearlyPalaceByName(0, 0, "Ming").branch, 9);
    assert.equal(natal.yearlyPalaceByName(11, 9, "Ming").branch, 8);
    assert.equal(natal.yearly(11, 9)[6].name, "Ming");
    assert.deepEqual(natal.periodIndicesAtAge(121), { decade: 11, yearly: 9 });
    assert.equal(natal.periodIndicesAtAge(122), null);
  }
  // First-month Zi-hour bureau anchors + exact integer addition; no date conversion.
  for (const [birthYear, first, last] of [
    [-2147483648, -2147483645, -2147483526],
    [-1, 4, 123],
    [0, 4, 123],
    [2147483647, 2147483650, 2147483769],
  ]) {
    const natal = Ziwei.fromBirth({ ...birth, birthYear });
    assert.equal(natal.decadeYears(0)[0].year, first);
    assert.equal(natal.decadeYears(11)[9].year, last);
    assert.ok(Number.isSafeInteger(last));
    assert.equal(JSON.parse(JSON.stringify(natal.decadeYears(11)))[9].year, last);
  }
});

test("age lookup covers both ends of all five bureaux without wrapping", () => {
  for (const [birthYear, birthStem, birthBranch, first, last] of [
    [1984, 0, 0, 6, 125],
    [1985, 1, 1, 5, 124],
    [1986, 2, 2, 3, 122],
    [1987, 3, 3, 4, 123],
    [1988, 4, 4, 2, 121],
  ] as const) {
    for (const natal of [
      Ziwei.fromBirth({ ...birth, birthYear }),
      Ziwei.fromParameters({ ...parameters, birthStem, birthBranch }),
    ]) {
      assert.equal(natal.periodIndicesAtAge(first - 1), null);
      assert.deepEqual(natal.periodIndicesAtAge(first), { decade: 0, yearly: 0 });
      assert.deepEqual(natal.periodIndicesAtAge(last), { decade: 11, yearly: 9 });
      assert.equal(natal.periodIndicesAtAge(last + 1), null);
    }
  }
});
