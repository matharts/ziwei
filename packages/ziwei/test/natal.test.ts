import assert from 'node:assert/strict';
import { test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { Ziwei } from '@matharts/ziwei';
import type { Birth, Natal, Star, Branch } from '@matharts/ziwei';

test('both entry points expose the confirmed zodiac and five-element bureau identities', () => {
  // First-month Zi-hour anchors: fixtures/README.md. Zodiac follows the explicit year branch.
  const cases = [
    [1984, 0, 0, 'Rat', 6], [1985, 1, 1, 'Ox', 5],
    [1986, 2, 2, 'Tiger', 3], [1987, 3, 3, 'Rabbit', 4],
    [1988, 4, 4, 'Dragon', 2], [1989, 5, 5, 'Snake', 6],
    [1990, 6, 6, 'Horse', 5], [1991, 7, 7, 'Goat', 3],
    [1992, 8, 8, 'Monkey', 4], [1993, 9, 9, 'Rooster', 2],
    [1994, 0, 10, 'Dog', 6], [1995, 1, 11, 'Pig', 5],
  ] as const;
  for (const [birthYear, birthStem, birthBranch, zodiac, bureau] of cases) {
    for (const natal of [
      Ziwei.fromBirth({ gender: 1, birthYear, birthMonth: 1, birthDay: 6, birthHour: 0 }),
      Ziwei.fromParameters({ gender: 1, birthStem, birthBranch, birthMonth: 1, ziweiBranch: 2, birthHour: 0 }),
    ]) {
      assert.equal(natal.zodiac, zodiac);
      assert.equal(natal.fiveElementBureau, bureau);
      // @ts-expect-error Deliberately test a frozen output write at runtime.
      assert.throws(() => { natal.zodiac = 'Dog'; }, TypeError);
      // @ts-expect-error Deliberately test a frozen output write at runtime.
      assert.throws(() => { natal.fiveElementBureau = 2; }, TypeError);
    }
  }
});

test('both entry points expose the complete hand-derived Jia Zi palace and star facts', () => {
  // Fixed project-rule example, not an engine-generated snapshot.
  const expectedPalaces = [
    ['Ming', '命宫', '命宮', 2, 2, [6, 15], ['ZiWei', 'TianFu']],
    ['FuMu', '父母', '父母', 3, 3, [16, 25], ['TaiYin']],
    ['FuDe', '福德', '福德', 4, 4, [26, 35], ['TanLang', 'ZuoFu', 'WenQu']],
    ['TianZhai', '田宅', '田宅', 5, 5, [36, 45], ['JuMen']],
    ['GuanLu', '官禄', '官祿', 6, 6, [46, 55], ['LianZhen', 'TianXiang']],
    ['JiaoYou', '交友', '交友', 7, 7, [56, 65], ['TianLiang']],
    ['QianYi', '迁移', '遷移', 8, 8, [66, 75], ['QiSha']],
    ['JiE', '疾厄', '疾厄', 9, 9, [76, 85], ['TianTong']],
    ['CaiBo', '财帛', '財帛', 10, 0, [86, 95], ['WuQu', 'YouBi', 'WenChang']],
    ['ZiNv', '子女', '子女', 11, 1, [96, 105], ['TaiYang']],
    ['FuQi', '夫妻', '夫妻', 0, 2, [106, 115], ['PoJun']],
    ['XiongDi', '兄弟', '兄弟', 1, 3, [116, 125], ['TianJi']],
  ];
  const metadata: Record<string, readonly string[]> = {
    ZiWei: ['紫微', '紫微', '紫', '紫', 'Major', 'Central'],
    TianJi: ['天机', '天機', '机', '機', 'Major', 'North'],
    TaiYang: ['太阳', '太陽', '阳', '陽', 'Major', 'North'],
    WuQu: ['武曲', '武曲', '武', '武', 'Major', 'North'],
    TianTong: ['天同', '天同', '同', '同', 'Major', 'North'],
    LianZhen: ['廉贞', '廉貞', '廉', '廉', 'Major', 'North'],
    TianFu: ['天府', '天府', '府', '府', 'Major', 'Central'],
    TaiYin: ['太阴', '太陰', '阴', '陰', 'Major', 'South'],
    TanLang: ['贪狼', '貪狼', '贪', '貪', 'Major', 'South'],
    JuMen: ['巨门', '巨門', '巨', '巨', 'Major', 'South'],
    TianXiang: ['天相', '天相', '相', '相', 'Major', 'Central'],
    TianLiang: ['天梁', '天梁', '梁', '梁', 'Major', 'South'],
    QiSha: ['七杀', '七殺', '杀', '殺', 'Major', 'Central'],
    PoJun: ['破军', '破軍', '破', '破', 'Major', 'South'],
    ZuoFu: ['左辅', '左輔', '辅', '輔', 'Minor', 'Central'],
    YouBi: ['右弼', '右弼', '弼', '弼', 'Minor', 'Central'],
    WenChang: ['文昌', '文昌', '昌', '昌', 'Minor', 'Central'],
    WenQu: ['文曲', '文曲', '曲', '曲', 'Minor', 'Central'],
  };
  const branches: Record<string, Branch> = { Zi: 0, Chou: 1, Yin: 2, Mao: 3, Chen: 4, Si: 5, Wu: 6, Wei: 7, Shen: 8, You: 9, Xu: 10, Hai: 11 };
  const fixture = readFileSync(new URL('../../../crates/ziwei/tests/fixtures/jia_zi_fire_six.csv', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split(','));
  assert.equal(fixture.length, 18);
  const optional = (value: string) => value === '-' ? null : value;
  for (const natal of [
    Ziwei.fromBirth({ gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0 }),
    Ziwei.fromParameters({ gender: 1, birthStem: 0, birthBranch: 0, birthMonth: 1, ziweiBranch: 2, birthHour: 0 }),
  ]) {
    assert.equal(Array.isArray(natal.palaces), true);
    assert.deepEqual(natal.palaces.map(p => [p.name, p.nameHans, p.nameHant, p.branch, p.stem, p.decadeAgeRange, p.stars.map(s => s.name)]), expectedPalaces);
    const located = new Map<string, { branch: Branch; star: Star }>(natal.palaces.flatMap(p => p.stars.map(s => [s.name, { branch: p.branch, star: s }] as const)));
    assert.equal(located.size, 18);
    for (const [name, branch, birth, inward, outward] of fixture) {
      const found = located.get(name);
      assert.ok(found);
      const { branch: actualBranch, star } = found;
      assert.equal(actualBranch, branches[branch]);
      assert.deepEqual(star, {
        name, nameHans: metadata[name][0], nameHant: metadata[name][1],
        abbrHans: metadata[name][2], abbrHant: metadata[name][3],
        category: metadata[name][4], galaxy: metadata[name][5],
        birthTransformation: optional(birth),
        selfTransformations: { inward: optional(inward), outward: optional(outward) },
      });
    }
  }
});

test('palace snapshots are deeply readonly, stable per chart and detached from chart and input', () => {
  const birth: { -readonly [K in keyof Birth]: Birth[K] } = { gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0 };
  let natal: Natal | null = Ziwei.fromBirth(birth);
  const palaces = natal.palaces;
  const profile = natal.profile;
  assert.equal(natal.palaces, palaces);
  assert.equal(natal.profile, profile);
  assert.ok(Object.isFrozen(palaces));
  for (const palace of palaces) {
    assert.equal(Object.getPrototypeOf(palace), Object.prototype);
    for (const value of [palace, palace.stars, palace.decadeAgeRange]) assert.ok(Object.isFrozen(value));
    for (const star of palace.stars) {
      assert.equal(Object.getPrototypeOf(star), Object.prototype);
      assert.ok(Object.isFrozen(star));
      assert.ok(Object.isFrozen(star.selfTransformations));
    }
  }
  // @ts-expect-error Deliberately test a frozen output write at runtime.
  assert.throws(() => { natal!.palaces = []; }, TypeError);
  // @ts-expect-error Deliberately test a frozen output write at runtime.
  assert.throws(() => { palaces.push(palaces[0]); }, TypeError);
  // @ts-expect-error Deliberately test a frozen output write at runtime.
  assert.throws(() => { palaces[0] = palaces[1]; }, TypeError);
  // @ts-expect-error Deliberately test a frozen output write at runtime.
  assert.throws(() => { palaces[0].nameHans = 'changed'; }, TypeError);
  // @ts-expect-error Deliberately test a frozen output write at runtime.
  assert.throws(() => { palaces[0].stars.pop(); }, TypeError);
  // @ts-expect-error Deliberately test a frozen output write at runtime.
  assert.throws(() => { palaces[0].decadeAgeRange[0] = 99; }, TypeError);
  // @ts-expect-error Deliberately test a frozen output write at runtime.
  assert.throws(() => { palaces[0].stars[0].birthTransformation = 'A'; }, TypeError);
  // @ts-expect-error Deliberately test a frozen output write at runtime.
  assert.throws(() => { palaces[0].stars[0].selfTransformations.inward = null; }, TypeError);
  const other = Ziwei.fromBirth(birth).palaces;
  assert.deepEqual(other, palaces);
  for (const [left, right] of [
    [palaces, other], [palaces[0], other[0]], [palaces[0].stars, other[0].stars],
    [palaces[0].stars[0], other[0].stars[0]],
    [palaces[0].stars[0].selfTransformations, other[0].stars[0].selfTransformations],
  ]) assert.notEqual(left, right);
  birth.birthYear = 1992;
  natal = null;
  assert.equal(profile.birthYear, 1984);
  assert.equal(palaces[0].stars[0].name, 'ZiWei');
  assert.deepEqual(structuredClone(palaces), palaces);
});

test('Ren Shen female charts preserve empty palaces, reverse decade ages and simultaneous transformations', () => {
  // Same independent worked example documented in core tests/public_api.rs and fixtures/README.md.
  const expected = [
    [2, 'CaiBo', 8, [42, 51], []], [3, 'ZiNv', 9, [32, 41], ['YouBi']],
    [4, 'FuQi', 0, [22, 31], ['TianTong']], [5, 'XiongDi', 1, [12, 21], ['WuQu', 'PoJun']],
    [6, 'Ming', 2, [2, 11], ['TaiYang']], [7, 'FuMu', 3, [112, 121], ['TianFu', 'WenChang', 'WenQu']],
    [8, 'FuDe', 4, [102, 111], ['TianJi', 'TaiYin']], [9, 'TianZhai', 5, [92, 101], ['ZiWei', 'TanLang']],
    [10, 'GuanLu', 6, [82, 91], ['JuMen']], [11, 'JiaoYou', 7, [72, 81], ['TianXiang', 'ZuoFu']],
    [0, 'QianYi', 8, [62, 71], ['TianLiang']], [1, 'JiE', 9, [52, 61], ['LianZhen', 'QiSha']],
  ];
  for (const natal of [
    Ziwei.fromBirth({ gender: 0, birthYear: 1992, birthMonth: 8, birthDay: 17, birthHour: 3 }),
    Ziwei.fromParameters({ gender: 0, birthStem: 8, birthBranch: 8, birthMonth: 8, ziweiBranch: 9, birthHour: 3 }),
  ]) {
    assert.equal(natal.zodiac, 'Monkey');
    assert.equal(natal.fiveElementBureau, 2);
    assert.deepEqual(natal.palaces.map(p => [p.branch, p.name, p.stem, p.decadeAgeRange, p.stars.map(s => s.name)]), expected);
    const stars = natal.palaces.flatMap(p => p.stars);
    assert.deepEqual(stars.filter(s => s.birthTransformation !== null).map(s => [s.name, s.birthTransformation]), [
      ['WuQu', 'D'], ['ZiWei', 'B'], ['ZuoFu', 'C'], ['TianLiang', 'A'],
    ]);
    for (const [name, inward, outward] of [
      ['ZiWei', null, null], ['TianTong', 'D', null], ['TianJi', null, 'D'],
      ['TanLang', 'D', 'B'], ['TianLiang', null, 'A'],
    ]) assert.deepEqual(stars.find(s => s.name === name)?.selfTransformations, { inward, outward });
    assert.ok(Object.isFrozen(natal.palaces[0].stars));
  }
});

test('profile and palace materialization are independent and a failed freeze can be retried', () => {
  const birth: { -readonly [K in keyof Birth]: Birth[K] } = { gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0 };
  const first = Ziwei.fromBirth(birth);
  const second = Ziwei.fromBirth(birth);
  const freeze = Object.freeze;
  const failure = new Error('injected freeze failure');
  let palaces;
  let profile;
  // Inject a host failure through a built-in, without inspecting private fields or mocking native methods.
  try {
    Object.freeze = <T>(value: T): Readonly<T> => {
      if (value && typeof value === 'object' && 'gender' in value && 'birthYear' in value) throw failure;
      return freeze(value);
    };
    palaces = first.palaces;
    assert.throws(() => first.profile, error => error === failure);
    Object.freeze = <T>(value: T): Readonly<T> => {
      if (Array.isArray(value) && value.length === 12) throw failure;
      return freeze(value);
    };
    profile = second.profile;
    assert.throws(() => second.palaces, error => error === failure);
  } finally {
    Object.freeze = freeze;
  }
  assert.equal(first.palaces, palaces);
  assert.equal(second.profile, profile);
  assert.equal(first.profile.birthYear, 1984);
  assert.deepEqual(second.palaces, palaces);
  assert.equal(second.palaces, second.palaces);
  assert.ok(Object.isFrozen(second.palaces));
});

test('every star projection owns its nullable fields and exposes only frozen plain data', () => {
  const fieldNames = [
    'name', 'nameHans', 'nameHant', 'abbrHans', 'abbrHant',
    'category', 'galaxy', 'birthTransformation', 'selfTransformations',
  ].sort();
  for (const natal of [
    Ziwei.fromBirth({ gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0 }),
    Ziwei.fromParameters({ gender: 0, birthStem: 8, birthBranch: 8, birthMonth: 8, ziweiBranch: 9, birthHour: 3 }),
  ]) {
    const located = [...natal.birthTransformations(), ...natal.selfTransformations()];
    const stars = [
      ...natal.palaces.flatMap(p => p.stars), ...natal.palace(2).stars,
      natal.star('ZiWei'), natal.palaceStar(natal.ziweiPalace().branch, 'ZiWei'),
      ...located.flatMap(value => [value.star, ...value.palace.stars]),
    ];
    for (const star of stars) {
      assert.ok(star);
      assert.deepEqual(Reflect.ownKeys(star).sort(), fieldNames);
      assert.equal(Object.getPrototypeOf(star), Object.prototype);
      assert.deepEqual(Reflect.ownKeys(star.selfTransformations).sort(), ['inward', 'outward']);
      for (const [value, key] of [
        [star, 'birthTransformation'], [star.selfTransformations, 'inward'],
        [star.selfTransformations, 'outward'],
      ] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        assert.ok(descriptor);
        assert.equal(descriptor.enumerable, true);
        assert.equal(descriptor.writable, false);
        assert.equal(descriptor.configurable, false);
        assert.ok(descriptor.value === null || ['A', 'B', 'C', 'D'].includes(descriptor.value));
      }
    }
  }
});

test('all palace projections retain named, frozen own data properties', () => {
  const natal = Ziwei.fromBirth({ gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0 });
  const fields = ['name', 'nameHans', 'nameHant', 'branch', 'stem', 'stars', 'decadeAgeRange'].sort();
  const palaces = [
    ...natal.palaces, ...natal.toJSON().palaces,
    natal.mingPalace(), natal.shenPalace(), natal.originPalace(), natal.ziweiPalace(),
    natal.palace(2), natal.palaceByName('Ming'), natal.palaceByStar('ZiWei'),
    natal.oppositePalace(2), ...natal.sanfangPalaces(2, true), ...natal.sizhengPalaces(2),
    natal.decadePalaceByName(11, 'Ming'), natal.yearlyPalaceByName(11, 9, 'Ming'),
    ...natal.birthTransformations().map(value => value.palace),
    ...natal.selfTransformations().map(value => value.palace),
  ];
  for (const palace of palaces) {
    assert.equal(Object.getPrototypeOf(palace), Object.prototype);
    assert.deepEqual(Reflect.ownKeys(palace).sort(), fields);
    for (const key of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(palace, key);
      assert.ok(descriptor);
      assert.ok(Object.hasOwn(descriptor, 'value'));
      assert.equal(descriptor.enumerable, true);
      assert.equal(descriptor.writable, false);
      assert.equal(descriptor.configurable, false);
    }
    assert.ok(Object.isFrozen(palace.stars));
    assert.ok(Object.isFrozen(palace.decadeAgeRange));
  }
});

test('missing transformations remain null with inherited numeric properties', () => {
  const natal = Ziwei.fromBirth({ gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0 });
  const expected = natal.palaces.flatMap(palace => palace.stars);
  const keys = ['7', '8', '9'];
  const original = keys.map(key => Object.getOwnPropertyDescriptor(Array.prototype, key));
  let actual;
  try {
    for (const key of keys) Object.defineProperty(Array.prototype, key, {
      value: 'unexpected inherited value', writable: true, configurable: true,
    });
    actual = expected.map(star => natal.star(star.name));
  } finally {
    for (let i = 0; i < keys.length; i++) {
      const descriptor = original[i];
      if (descriptor) Object.defineProperty(Array.prototype, keys[i], descriptor);
      else Reflect.deleteProperty(Array.prototype, keys[i]);
    }
  }
  assert.deepEqual(actual, expected);
});
