import assert from "node:assert/strict";

import { test } from "@rstest/core";

import { Branch, Gender, StarName, Ziwei } from "@matharts/ziwei";

test("TypeScript engine preserves the independently worked Jia Zi chart", () => {
  // This fixed example is documented in crates/ziwei/tests/fixtures/README.md.
  // Expectations are written here explicitly; no Rust-generated output is consulted.
  const natal = Ziwei.fromBirth({
    gender: Gender.Male,
    birthYear: 1984,
    birthMonth: 1,
    birthDay: 6,
    birthHour: Branch.Zi,
  });

  assert.equal(natal.zodiac, "Rat");
  assert.equal(natal.fiveElementBureau, 6);
  assert.equal(natal.mingPalace().branch, Branch.Yin);
  assert.equal(natal.ziweiPalace().branch, Branch.Yin);
  assert.deepEqual(
    natal.palaces.map((palace) => [
      palace.name,
      palace.branch,
      palace.stem,
      palace.decadeAgeRange,
      palace.stars.map((star) => star.name),
    ]),
    [
      ["Ming", Branch.Yin, 2, [6, 15], ["ZiWei", "TianFu"]],
      ["FuMu", Branch.Mao, 3, [16, 25], ["TaiYin"]],
      ["FuDe", Branch.Chen, 4, [26, 35], ["TanLang", "ZuoFu", "WenQu"]],
      ["TianZhai", Branch.Si, 5, [36, 45], ["JuMen"]],
      ["GuanLu", Branch.Wu, 6, [46, 55], ["LianZhen", "TianXiang"]],
      ["JiaoYou", Branch.Wei, 7, [56, 65], ["TianLiang"]],
      ["QianYi", Branch.Shen, 8, [66, 75], ["QiSha"]],
      ["JiE", Branch.You, 9, [76, 85], ["TianTong"]],
      ["CaiBo", Branch.Xu, 0, [86, 95], ["WuQu", "YouBi", "WenChang"]],
      ["ZiNv", Branch.Hai, 1, [96, 105], ["TaiYang"]],
      ["FuQi", Branch.Zi, 2, [106, 115], ["PoJun"]],
      ["XiongDi", Branch.Chou, 3, [116, 125], ["TianJi"]],
    ],
  );
  assert.equal(natal.star(StarName.WuQu).birthTransformation, "C");
  assert.deepEqual(natal.periodIndicesAtAge(6), { decade: 0, yearly: 0 });
  assert.equal(natal.periodIndicesAtAge(5), null);
  assert.equal(natal.periodIndicesAtAge(126), null);
  assert.deepEqual(
    natal.decadeYears(0),
    Array.from({ length: 10 }, (_, index) => ({ age: 6 + index, year: 1989 + index })),
  );
});

test("parameter entry agrees with fixed Jia Zi facts and keeps unavailable birth dates absent", () => {
  const natal = Ziwei.fromParameters({
    gender: Gender.Male,
    birthStem: 0,
    birthBranch: Branch.Zi,
    birthMonth: 1,
    ziweiBranch: Branch.Yin,
    birthHour: Branch.Zi,
  });

  assert.deepEqual(natal.profile, {
    gender: Gender.Male,
    birthYear: null,
    birthStem: 0,
    birthBranch: Branch.Zi,
    birthMonth: 1,
    birthDay: null,
    birthHour: Branch.Zi,
  });
  assert.equal(natal.zodiac, "Rat");
  assert.equal(natal.fiveElementBureau, 6);
  assert.equal(natal.mingPalace().branch, Branch.Yin);
  assert.equal(natal.palaceByStar(StarName.WuQu).branch, Branch.Xu);
  assert.deepEqual(
    natal.decadeYears(0),
    Array.from({ length: 10 }, (_, index) => ({ age: 6 + index, year: null })),
  );
});
