import assert from "node:assert/strict";

import { test } from "@rstest/core";

import * as api from "@matharts/ziwei";

const birth = {
  gender: api.Gender.Male,
  birthYear: 1984,
  birthMonth: 1,
  birthDay: 6,
  birthHour: api.Branch.Zi,
};

test("the package exposes one synchronous TypeScript chart entry", () => {
  assert.deepEqual(Object.keys(api.Ziwei), ["fromBirth", "fromParameters"]);
  assert.ok(Object.isFrozen(api.Ziwei));
  assert.equal("Natal" in api, false);
  assert.equal("Palace" in api, false);
  assert.equal("Star" in api, false);
  const natal = api.Ziwei.fromBirth(birth);
  assert.equal(natal instanceof Promise, false);
  assert.equal(
    natal.palace(api.Branch.Yin).star(api.StarName.ZiWei),
    natal.star(api.StarName.ZiWei),
  );
  assert.equal(natal.palace(api.Branch.Yin).star(api.StarName.WuQu), null);
  assert.equal("palaceStar" in natal, false);
  assert.equal("toJSON" in natal, false);
});

test("palace name lookups reject inherited and noncanonical names", () => {
  const natal = api.Ziwei.fromBirth(birth);
  const lookups = [
    (value: unknown) => natal.palaceByName(value as api.PalaceName),
    (value: unknown) => natal.decadePalaceByName(0, value as api.PalaceName),
    (value: unknown) => natal.yearlyPalaceByName(0, 0, value as api.PalaceName),
  ];
  for (const value of ["toString", "constructor", "__proto__", "Ming ", null, 1]) {
    for (const lookup of lookups) {
      assert.throws(
        () => lookup(value),
        (error: unknown) => {
          assert.ok(error instanceof api.ZiweiError);
          assert.equal(error.code, "INVALID_ARGUMENT");
          assert.deepEqual(error.detail, { code: "INVALID_ARGUMENT", field: "name", value });
          return true;
        },
      );
    }
  }
});

test("star lookups reject inherited and noncanonical names", () => {
  const natal = api.Ziwei.fromBirth(birth);
  for (const value of ["toString", "constructor", "__proto__", "ziwei", "ZiWei ", null, 1]) {
    for (const lookup of [
      (name: unknown) => natal.star(name as api.StarName),
      (name: unknown) => natal.palaceByStar(name as api.StarName),
      (name: unknown) => natal.mingPalace().star(name as api.StarName),
    ]) {
      assert.throws(
        () => lookup(value),
        (error: unknown) => {
          assert.ok(error instanceof api.ZiweiError);
          assert.equal(error.code, "INVALID_ARGUMENT");
          assert.deepEqual(error.detail, { code: "INVALID_ARGUMENT", field: "name", value });
          return true;
        },
      );
    }
  }
});

test("domain identities and values retain Rust order and are immutable", () => {
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
  assert.deepEqual(api.Transformation.ALL, ["A", "B", "C", "D"]);
  assert.equal(api.genderYinYang(api.Gender.Male), api.YinYang.Yang);
  assert.equal(api.stemYinYang(api.Stem.Yi), api.YinYang.Yin);
  assert.equal(api.branchYinYang(api.Branch.Zi), api.YinYang.Yang);
  assert.equal(api.branchZodiac(api.Branch.Hai), api.Zodiac.Pig);
  for (const value of [
    api.Ziwei,
    api.Gender,
    api.Stem,
    api.Branch,
    api.PalaceName,
    api.StarName,
    api.Transformation,
  ])
    assert.ok(Object.isFrozen(value));
});

test("chart facts detach from input, remain immutable and retain null absence", () => {
  const mutable = { ...birth };
  const natal = api.Ziwei.fromBirth(mutable);
  const other = api.Ziwei.fromParameters({
    gender: 1,
    birthStem: 0,
    birthBranch: 0,
    birthMonth: 1,
    ziweiBranch: 2,
    birthHour: 0,
  });
  mutable.birthYear = 1992;
  assert.equal(natal.profile.birthYear, 1984);
  assert.equal(natal.profile.birthDay, 6);
  assert.equal(other.profile.birthYear, null);
  assert.equal(other.profile.birthDay, null);
  assert.ok(Object.isFrozen(natal));
  assert.ok(Object.isFrozen(natal.profile));
  assert.ok(Object.isFrozen(natal.palaces));
  assert.strictEqual(natal.palaces, natal.palaces);
  const decadeYears = natal.decadeYears(0);
  assert.ok(Object.isFrozen(decadeYears));
  assert.ok(decadeYears.every(Object.isFrozen));
  for (const palace of natal.palaces) {
    assert.ok(Object.isFrozen(palace));
    assert.ok(Object.isFrozen(palace.stars));
    assert.ok(Object.isFrozen(palace.decadeAgeRange));
    for (const star of palace.stars) {
      assert.ok(Object.isFrozen(star));
      assert.ok(Object.isFrozen(star.selfTransformations));
    }
  }
  assert.throws(() => {
    (natal.profile as { birthYear: number | null }).birthYear = 0;
  }, TypeError);
});

test("query order preserves chart results and shared readonly objects", () => {
  const natal = api.Ziwei.fromBirth(birth);
  const beforePalaces = natal.decade(0);
  const beforeStar = natal.star(api.StarName.WuQu);
  const palace = natal.palaceByStar(api.StarName.WuQu);
  assert.strictEqual(palace.star(api.StarName.WuQu), beforeStar);
  assert.strictEqual(natal.star(api.StarName.WuQu), beforeStar);
  assert.strictEqual(natal.palaceByStar(api.StarName.WuQu), palace);
  assert.strictEqual(natal.palaces, natal.palaces);
  assert.deepEqual(natal.decade(0), beforePalaces);
  assert.ok(Object.isFrozen(beforePalaces[0]));

  const palacesFirst = api.Ziwei.fromBirth(birth);
  const initialPalaces = palacesFirst.palaces;
  for (const name of api.StarName.ALL) {
    assert.strictEqual(palacesFirst.palaceByStar(name).star(name), palacesFirst.star(name));
  }
  assert.strictEqual(palacesFirst.palaces, initialPalaces);
});

test("single-palace queries retain identity when the full chart is read later", () => {
  const queries = [
    (chart: api.Natal) => chart.palace(api.Branch.Zi),
    (chart: api.Natal) => chart.oppositePalace(api.Branch.Yin),
    (chart: api.Natal) => chart.palaceByName(api.PalaceName.Ming),
    (chart: api.Natal) => chart.palaceByStar(api.StarName.WuQu),
    (chart: api.Natal) => chart.decadePalaceByName(3, api.PalaceName.Ming),
    (chart: api.Natal) => chart.yearlyPalaceByName(3, 4, api.PalaceName.Ming),
  ];
  for (const query of queries) {
    const chart = api.Ziwei.fromBirth(birth);
    const palace = query(chart);
    assert.ok(Object.isFrozen(palace));
    assert.strictEqual(query(chart), palace);
    assert.strictEqual(
      chart.palaces.find((entry) => entry.branch === palace.branch),
      palace,
    );
    assert.strictEqual(query(chart), palace);
  }
  const chart = api.Ziwei.fromBirth(birth);
  const selected = [chart.palace(api.Branch.Zi), chart.palaceByStar(api.StarName.WuQu)];
  for (const palace of selected) {
    assert.strictEqual(
      chart.palaces.find((entry) => entry.branch === palace.branch),
      palace,
    );
  }
  assert.strictEqual(
    chart.palaceByStar(api.StarName.WuQu).star(api.StarName.WuQu),
    chart.star(api.StarName.WuQu),
  );
});

test("star queries retain the same values across repeated lookups and later chart reads", () => {
  const chart = api.Ziwei.fromBirth(birth);
  const first = chart.star(api.StarName.WuQu);
  for (let index = 0; index < 72; index++) {
    const name = api.StarName.ALL[index % api.StarName.ALL.length]!;
    assert.strictEqual(chart.star(name), chart.palaceByStar(name).star(name));
  }
  assert.strictEqual(chart.star(api.StarName.WuQu), first);
  assert.strictEqual(chart.palaceByStar(api.StarName.WuQu).star(api.StarName.WuQu), first);
  for (const located of chart.birthTransformations()) {
    assert.strictEqual(chart.star(located.star.name), located.star);
    assert.strictEqual(chart.palaceByStar(located.star.name), located.palace);
  }
});

test("first birth transformations materialize only their palaces and retain chart identities", () => {
  const chart = api.Ziwei.fromBirth(birth);
  const first = chart.birthTransformations();
  assert.equal(first.length, 4);
  assert.ok(Object.isFrozen(first));
  assert.strictEqual(chart.birthTransformations(), first);
  for (const located of first) {
    assert.ok(Object.isFrozen(located));
    assert.strictEqual(chart.palaceByStar(located.star.name), located.palace);
    assert.strictEqual(chart.star(located.star.name), located.star);
  }
  const palaces = chart.palaces;
  for (const located of first) {
    assert.strictEqual(
      palaces.find((palace) => palace.branch === located.palace.branch),
      located.palace,
    );
  }
});

test("first self transformations retain palace and star identities after completing the chart", () => {
  const chart = api.Ziwei.fromBirth(birth);
  const first = chart.selfTransformations();
  assert.ok(Object.isFrozen(first));
  const palaces = chart.palaces;
  for (const located of first) {
    assert.ok(Object.isFrozen(located));
    assert.strictEqual(chart.palaceByStar(located.star.name), located.palace);
    assert.strictEqual(chart.star(located.star.name), located.star);
    assert.strictEqual(
      palaces.find((palace) => palace.branch === located.palace.branch),
      located.palace,
    );
  }
  const second = chart.selfTransformations();
  assert.deepEqual(second, first);
  assert.notStrictEqual(second, first);
  for (let index = 0; index < first.length; index++) {
    assert.notStrictEqual(second[index], first[index]);
  }
});

test("sanfang and sizheng keep branch order and palace identities after completing the chart", () => {
  for (const source of api.Branch.ALL) {
    for (const includeSelf of [false, true]) {
      const chart = api.Ziwei.fromBirth(birth);
      const selected = chart.sanfangPalaces(source, includeSelf);
      const related = [(source + 4) % 12, (source + 8) % 12, (source + 6) % 12];
      assert.deepEqual(
        selected.map((palace) => palace.branch),
        includeSelf ? [source, ...related] : related,
      );
      assert.ok(Object.isFrozen(selected));
      const palaces = chart.palaces;
      for (const palace of selected) {
        assert.strictEqual(
          palaces.find((entry) => entry.branch === palace.branch),
          palace,
        );
      }
      if (includeSelf) assert.deepEqual(chart.sizhengPalaces(source), selected);
    }
  }
});

test("shared star values keep each chart's own palace lookup", () => {
  const first = api.Ziwei.fromBirth(birth);
  const second = api.Ziwei.fromBirth({ ...birth, birthDay: 7 });
  for (const chart of [first, second]) {
    for (const name of api.StarName.ALL) {
      const star = chart.star(name);
      assert.strictEqual(chart.palaceByStar(name).star(name), star);
    }
  }
  assert.notStrictEqual(first.palaces, second.palaces);
});

test("repeated charts retain separate frozen palaces", () => {
  const charts = Array.from({ length: 3 }, () => api.Ziwei.fromBirth(birth));
  const palaces = charts.map((chart) => chart.palaces);
  assert.notStrictEqual(palaces[0], palaces[1]);
  assert.notStrictEqual(palaces[1], palaces[2]);
  for (let index = 0; index < 12; index++) {
    assert.notStrictEqual(palaces[0]![index], palaces[1]![index]);
    assert.notStrictEqual(palaces[1]![index], palaces[2]![index]);
    assert.deepEqual(palaces[0]![index]!.stars, palaces[2]![index]!.stars);
    assert.ok(Object.isFrozen(palaces[2]![index]!.stars));
  }
  for (const chart of charts) {
    for (const name of api.StarName.ALL) {
      assert.strictEqual(chart.palaceByStar(name).star(name), chart.star(name));
    }
  }
});

test("star self transformations agree with palace transformation relations", () => {
  for (const birthStem of api.Stem.ALL) {
    for (const ziweiBranch of api.Branch.ALL) {
      for (const birthHour of [api.Branch.Zi, api.Branch.Mao, api.Branch.Shen]) {
        const chart = api.Ziwei.fromParameters({
          gender: api.Gender.Male,
          birthStem,
          birthBranch: api.Branch.ALL[birthStem % 2]!,
          birthMonth: ziweiBranch + 1,
          birthHour,
          ziweiBranch,
        });
        const expected = new Map<
          api.StarName,
          { inward: api.Transformation | null; outward: api.Transformation | null }
        >();
        for (const source of chart.palaces) {
          for (const relation of chart.palaceTransformations(source.branch)) {
            const value = expected.get(relation.star) ?? { inward: null, outward: null };
            if (relation.targetBranch === source.branch) value.outward = relation.transformation;
            if (relation.targetBranch === (source.branch + 6) % 12)
              value.inward = relation.transformation;
            expected.set(relation.star, value);
          }
        }
        for (const name of api.StarName.ALL) {
          assert.deepEqual(
            chart.star(name).selfTransformations,
            expected.get(name) ?? {
              inward: null,
              outward: null,
            },
          );
        }
      }
    }
  }
});

test("year bounds and invalid inputs follow V1 domain limits", () => {
  for (const [year, first, last] of [
    [-2_147_483_648, -2_147_483_645, -2_147_483_526],
    [0, 4, 123],
    [2_147_483_647, 2_147_483_650, 2_147_483_769],
  ]) {
    const natal = api.Ziwei.fromBirth({ ...birth, birthYear: year });
    assert.equal(natal.decadeYears(0)[0]?.year, first);
    assert.equal(natal.decadeYears(11)[9]?.year, last);
  }
  for (const invalid of [NaN, Infinity, 1.5, "1", null, undefined]) {
    assert.throws(
      () => api.Ziwei.fromBirth({ ...birth, birthMonth: invalid as number }),
      api.ZiweiError,
    );
  }
  assert.throws(() => api.Ziwei.fromBirth({ ...birth, birthYear: 2_147_483_648 }), api.ZiweiError);
  assert.throws(() => api.Ziwei.fromBirth({ ...birth, birthYear: -2_147_483_649 }), api.ZiweiError);
  assert.throws(
    () => api.Ziwei.fromBirth({ ...birth, birthHour: 12 as api.Branch }),
    api.ZiweiError,
  );
  assert.throws(() => api.Ziwei.fromBirth({ ...birth, extra: 1 } as typeof birth), api.ZiweiError);
});

test("input capture rejects accessors and ignores inherited data", () => {
  let reads = 0;
  const withAccessor = {
    ...birth,
    get birthMonth() {
      reads++;
      return 1;
    },
  };
  assert.throws(() => api.Ziwei.fromBirth(withAccessor), api.ZiweiError);
  assert.equal(reads, 0);
  const inherited = Object.create({ birthMonth: 1 }) as typeof birth;
  Object.assign(inherited, { gender: 1, birthYear: 1984, birthDay: 6, birthHour: 0 });
  assert.throws(() => api.Ziwei.fromBirth(inherited), api.ZiweiError);
  assert.throws(() => api.Ziwei.fromBirth({ ...birth, [Symbol("extra")]: 1 }), api.ZiweiError);
  const withHiddenExtra = { ...birth };
  Object.defineProperty(withHiddenExtra, "extra", { value: 1 });
  assert.throws(() => api.Ziwei.fromBirth(withHiddenExtra), api.ZiweiError);
  const guarded = new Proxy(birth, {
    get() {
      throw new Error("input property getter must not be used");
    },
  });
  assert.deepEqual(api.Ziwei.fromBirth(guarded).profile, api.Ziwei.fromBirth(birth).profile);
  const reordered = {
    birthHour: birth.birthHour,
    birthDay: birth.birthDay,
    birthMonth: birth.birthMonth,
    birthYear: birth.birthYear,
    gender: birth.gender,
  };
  assert.deepEqual(api.Ziwei.fromBirth(reordered).profile, api.Ziwei.fromBirth(birth).profile);
  const hiddenKey = new Proxy(birth, {
    ownKeys(target) {
      return Reflect.ownKeys(target).map((key) => (key === "birthHour" ? "extra" : key));
    },
  });
  assert.throws(() => api.Ziwei.fromBirth(hiddenKey), api.ZiweiError);
  assert.throws(() => api.branchZodiac(12 as api.Branch), api.ZiweiError);
  assert.throws(() => api.stemYinYang(-1 as api.Stem), api.ZiweiError);
});
