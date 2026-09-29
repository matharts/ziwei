import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { test } from "@rstest/core";

import {
  Branch,
  PalaceName,
  StarName,
  Stem,
  Transformation,
  Ziwei,
  ZiweiError,
} from "@matharts/ziwei";

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

test("repeated palace transformations share frozen values across charts", () => {
  const first = Ziwei.fromParameters(parameters);
  const second = Ziwei.fromParameters(parameters);
  const expected = first.palaceTransformations(Branch.Yin);
  const repeated = second.palaceTransformations(Branch.Yin);
  const cached = first.palaceTransformations(Branch.Yin);

  assert.deepEqual(repeated, expected);
  assert.strictEqual(cached, repeated);
  assert.equal(Object.isFrozen(cached), true);
  assert.equal(cached.every(Object.isFrozen), true);
  assert.notStrictEqual(first.palaceTransformations(Branch.Mao), cached);
});

test("decade year cache keeps boundary birth years and yearless charts distinct", () => {
  const cases = [
    ...[-2_147_483_648, -1, 0, 2_147_483_647].map((birthYear) =>
      Ziwei.fromBirth({ ...birth, birthYear }),
    ),
    Ziwei.fromParameters(parameters),
  ];
  for (const natal of cases) {
    for (const decade of [0, 11]) {
      const years = natal.decadeYears(decade);
      const firstAge = natal.fiveElementBureau + 10 * decade;
      assert.deepEqual(years[0], {
        age: firstAge,
        year: natal.profile.birthYear === null ? null : natal.profile.birthYear + firstAge - 1,
      });
      assert.equal(years[9]?.age, firstAge + 9);
      assert.strictEqual(natal.decadeYears(decade), years);
      assert.equal(Object.isFrozen(years), true);
      assert.equal(years.every(Object.isFrozen), true);
    }
  }
});

test("Rust public query inventory has a TypeScript equivalent", () => {
  const natal = Ziwei.fromBirth(birth);
  for (const name of [
    "palace",
    "oppositePalace",
    "sanfangPalaces",
    "sizhengPalaces",
    "palaceByName",
    "mingPalace",
    "shenPalace",
    "originPalace",
    "ziweiPalace",
    "palaceByStar",
    "star",
    "birthTransformations",
    "selfTransformations",
    "palaceTransformation",
    "palaceTransformations",
    "palaceTransformationSources",
    "periodIndicesAtAge",
    "decade",
    "decadeByBranch",
    "decadePalaceByName",
    "decadeYears",
    "yearly",
    "yearlyByBranch",
    "yearlyPalaceByName",
  ])
    assert.equal(typeof natal[name as keyof typeof natal], "function", name);
  assert.equal(typeof natal.palace(Branch.Yin).star, "function");
  assert.equal(natal.palace(Branch.Yin).star(StarName.WuQu), null);
  assert.equal(natal.palace(Branch.Yin).star(StarName.ZiWei), natal.star(StarName.ZiWei));
});

test("both constructors match independent fixed palace and star facts", () => {
  const fixture = readFileSync(
    new URL("../../../crates/ziwei/tests/fixtures/jia_zi_fire_six.csv", import.meta.url),
    "utf8",
  )
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(","));
  const branchByName = Object.fromEntries(
    Object.entries(Branch)
      .filter(([key]) => key !== "ALL")
      .map(([key, value]) => [key, value]),
  ) as Record<string, Branch>;
  for (const natal of charts()) {
    assert.equal(natal.palaces.length, 12);
    assert.equal(natal.palaces.flatMap((palace) => palace.stars).length, 18);
    assert.deepEqual(
      natal.palaces.map((palace) => palace.branch),
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1],
    );
    assert.deepEqual(
      natal.palaces.map((palace) => palace.name),
      [
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
        "XiongDi",
      ],
    );
    assert.equal(natal.fiveElementBureau, 6);
    assert.equal(natal.zodiac, "Rat");
    for (const [name, branch, birthKind, inward, outward] of fixture) {
      const star = natal.star(name as StarName);
      assert.equal(natal.palaceByStar(name as StarName).branch, branchByName[branch]);
      assert.equal(star.birthTransformation, birthKind === "-" ? null : birthKind);
      assert.deepEqual(star.selfTransformations, {
        inward: inward === "-" ? null : inward,
        outward: outward === "-" ? null : outward,
      });
    }
    assert.equal(natal.palaceByName(PalaceName.CaiBo).branch, Branch.Xu);
    assert.deepEqual(
      [
        natal.mingPalace().branch,
        natal.shenPalace().branch,
        natal.originPalace().branch,
        natal.ziweiPalace().branch,
      ],
      [2, 2, 10, 2],
    );
    assert.deepEqual(
      natal.sanfangPalaces(Branch.Yin, false).map((palace) => palace.branch),
      [6, 10, 8],
    );
    assert.deepEqual(
      natal.sizhengPalaces(Branch.Yin).map((palace) => palace.branch),
      [2, 6, 10, 8],
    );
    assert.equal(natal.oppositePalace(Branch.Yin).branch, Branch.Shen);
  }
});

test("transformation and period operations preserve Rust's ordering and missing values", () => {
  for (const natal of charts()) {
    assert.deepEqual(
      natal.birthTransformations().map(({ star }) => star.name),
      ["LianZhen", "PoJun", "WuQu", "TaiYang"],
    );
    assert.deepEqual(
      natal.palaceTransformations(Branch.Yin).map(({ transformation }) => transformation),
      ["A", "B", "C", "D"],
    );
    assert.deepEqual(natal.palaceTransformation(Branch.Yin, "D"), {
      sourceBranch: 2,
      targetBranch: 6,
      transformation: "D",
      star: "LianZhen",
    });
    assert.deepEqual(natal.palaceTransformationSources(Branch.Yin), [
      { sourceBranch: 8, targetBranch: 2, transformation: "B", star: "ZiWei" },
      { sourceBranch: 11, targetBranch: 2, transformation: "C", star: "ZiWei" },
    ]);
    assert.deepEqual(natal.periodIndicesAtAge(6), { decade: 0, yearly: 0 });
    assert.equal(natal.periodIndicesAtAge(126), null);
    assert.equal(natal.decade(1).length, 12);
    assert.equal(natal.decadeByBranch(1, Branch.Mao).name, PalaceName.Ming);
    assert.equal(natal.decadePalaceByName(1, PalaceName.Ming).branch, Branch.Mao);
    assert.equal(natal.yearly(1, 9).length, 12);
    assert.equal(natal.yearlyByBranch(1, 9, Branch.Zi).name, PalaceName.Ming);
    assert.equal(natal.yearlyPalaceByName(1, 9, PalaceName.Ming).branch, Branch.Zi);
  }
  assert.equal(charts()[0].decadeYears(1)[0]?.year, 1999);
  assert.equal(charts()[1].decadeYears(1)[0]?.year, null);
});

test("period layouts agree with every branch query and remain immutable", () => {
  for (const natal of charts()) {
    for (let decade = 0; decade < 12; decade++) {
      const layout = natal.decade(decade);
      assert.equal(Object.isFrozen(layout), true);
      assert.deepEqual(
        [...new Set(layout.map(({ name }) => name))].sort(),
        [...PalaceName.ALL].sort(),
      );
      for (const branch of Branch.ALL) {
        assert.equal(layout[(branch + 10) % 12], natal.decadeByBranch(decade, branch));
      }
      for (let yearly = 0; yearly < 10; yearly++) {
        const yearlyLayout = natal.yearly(decade, yearly);
        assert.equal(Object.isFrozen(yearlyLayout), true);
        for (const branch of Branch.ALL) {
          assert.equal(
            yearlyLayout[(branch + 10) % 12],
            natal.yearlyByBranch(decade, yearly, branch),
          );
        }
      }
    }
  }
});

test("incoming palace transformations match ordered source relations", () => {
  const varied = Array.from({ length: 24 }, (_, index) =>
    Ziwei.fromBirth({
      gender: (index % 2) as 0 | 1,
      birthYear: 1984 + index,
      birthMonth: 1 + (index % 12),
      birthDay: 1 + ((index * 7) % 30),
      birthHour: ((index * 5) % 12) as Branch,
    }),
  );
  const variedParameters = Array.from({ length: 24 }, (_, index) =>
    Ziwei.fromParameters({
      gender: (index % 2) as 0 | 1,
      birthStem: (index % 10) as Stem,
      birthBranch: (index % 12) as Branch,
      birthMonth: 1 + (index % 12),
      ziweiBranch: ((index * 5) % 12) as Branch,
      birthHour: ((index * 7) % 12) as Branch,
    }),
  );
  for (const natal of [...charts(), ...varied, ...variedParameters]) {
    const firstIncoming = natal.palaceTransformationSources(Branch.Yin);
    const repeatedIncoming = natal.palaceTransformationSources(Branch.Yin);
    assert.notStrictEqual(firstIncoming, repeatedIncoming);
    for (let index = 0; index < firstIncoming.length; index++) {
      assert.notStrictEqual(firstIncoming[index], repeatedIncoming[index]);
    }
    const earlyOutgoing = Branch.ALL.map((source) => natal.palaceTransformations(source));
    const earlySingle = natal.palaceTransformation(Branch.Yin, Transformation.A);
    const relations = natal.palaces.flatMap((palace) => {
      const outgoing = natal.palaceTransformations(palace.branch);
      assert.deepEqual(earlyOutgoing[palace.branch], outgoing);
      for (let index = 0; index < 4; index++) {
        assert.deepEqual(
          natal.palaceTransformation(palace.branch, Transformation.ALL[index]!),
          outgoing[index],
        );
      }
      return outgoing;
    });
    assert.deepEqual(earlySingle, earlyOutgoing[Branch.Yin]![0]);
    assert.deepEqual(
      firstIncoming,
      relations.filter((relation) => relation.targetBranch === Branch.Yin),
    );
    for (const target of Branch.ALL) {
      const incoming = natal.palaceTransformationSources(target);
      assert.equal(Object.isFrozen(incoming), true);
      assert.deepEqual(
        incoming,
        relations.filter((relation) => relation.targetBranch === target),
      );
      assert.equal(
        incoming.every((relation) => Object.isFrozen(relation)),
        true,
      );
    }
  }
});

test("inputs reject invalid domains before calculation", () => {
  assert.throws(
    () => Ziwei.fromBirth({ ...birth, birthMonth: 13 }),
    (error) => error instanceof ZiweiError && error.code === "INVALID_LUNISOLAR_MONTH",
  );
  assert.throws(
    () => Ziwei.fromBirth({ ...birth, birthDay: 31 }),
    (error) => error instanceof ZiweiError && error.code === "INVALID_LUNISOLAR_DAY",
  );
  assert.throws(
    () => Ziwei.fromParameters({ ...parameters, birthBranch: Branch.Chou }),
    (error) => error instanceof ZiweiError && error.code === "INVALID_SEXAGENARY_YEAR",
  );
  assert.throws(
    () => charts()[0].decade(12),
    (error) => error instanceof ZiweiError && error.code === "INVALID_DECADE_INDEX",
  );
  assert.throws(
    () => charts()[0].yearly(0, 10),
    (error) => error instanceof ZiweiError && error.code === "INVALID_YEARLY_INDEX",
  );
});

test("self transformations and incoming relations retain simultaneous facts", () => {
  const jia = Ziwei.fromBirth(birth);
  const first = jia.selfTransformations();
  assert.deepEqual(
    first.map(({ palace, star }) => [palace.branch, star.name]),
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
  const second = jia.selfTransformations();
  const third = jia.selfTransformations();
  assert.notStrictEqual(second, third);
  for (const repeated of [second, third]) {
    assert.deepEqual(repeated, first);
    assert.notStrictEqual(repeated, first);
    assert.equal(Object.isFrozen(repeated), true);
    for (let index = 0; index < repeated.length; index++) {
      assert.notStrictEqual(repeated[index], first[index]);
      assert.equal(Object.isFrozen(repeated[index]), true);
    }
  }
  for (let index = 0; index < second.length; index++) {
    assert.notStrictEqual(second[index], third[index]);
  }
  const ren = Ziwei.fromBirth({
    gender: 0,
    birthYear: 1992,
    birthMonth: 8,
    birthDay: 17,
    birthHour: 3,
  });
  assert.deepEqual(ren.palaceTransformationSources(Branch.Zi), [
    { sourceBranch: 2, targetBranch: 0, transformation: "A", star: "TianLiang" },
    { sourceBranch: 5, targetBranch: 0, transformation: "B", star: "TianLiang" },
    { sourceBranch: 9, targetBranch: 0, transformation: "C", star: "TianLiang" },
    { sourceBranch: 0, targetBranch: 0, transformation: "A", star: "TianLiang" },
  ]);
  assert.deepEqual(ren.star(StarName.TanLang).selfTransformations, { inward: "D", outward: "B" });
  assert.equal(ren.birthTransformations()[2]?.star.name, StarName.ZuoFu);
});

test("localized facts belong to the palace and star domain values", () => {
  const natal = Ziwei.fromBirth(birth);
  assert.deepEqual([natal.mingPalace().nameHans, natal.mingPalace().nameHant], ["命宫", "命宮"]);
  assert.deepEqual(
    [natal.palaceByName(PalaceName.CaiBo).nameHans, natal.palaceByName(PalaceName.CaiBo).nameHant],
    ["财帛", "財帛"],
  );
  const tianji = natal.star(StarName.TianJi);
  assert.deepEqual(
    [
      tianji.nameHans,
      tianji.nameHant,
      tianji.abbrHans,
      tianji.abbrHant,
      tianji.category,
      tianji.galaxy,
    ],
    ["天机", "天機", "机", "機", "Major", "North"],
  );
  const wenqu = natal.star(StarName.WenQu);
  assert.deepEqual(
    [wenqu.nameHans, wenqu.nameHant, wenqu.category, wenqu.galaxy],
    ["文曲", "文曲", "Minor", "Central"],
  );
  assert.deepEqual(natal.decadeByBranch(1, Branch.Mao), {
    name: PalaceName.Ming,
    nameHans: "大命",
    nameHant: "大命",
  });
  assert.deepEqual(natal.yearlyByBranch(1, 9, Branch.Zi), {
    name: PalaceName.Ming,
    nameHans: "流命",
    nameHant: "流命",
  });
});
