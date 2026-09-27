import type {
  Branch,
  Gender,
  PalaceName,
  StarName,
  Stem,
  Transformation,
} from "@matharts/ziwei-shared";

import { createPeriodQueries, type PeriodQueries } from "./periods.js";
import { argumentFailure, domainFailure, isFailure, type EngineFailure } from "./validation.js";
export type { EngineFailure } from "./validation.js";

export type EngineYinYang = 0 | 1;
export type EngineZodiac =
  | "Rat"
  | "Ox"
  | "Tiger"
  | "Rabbit"
  | "Dragon"
  | "Snake"
  | "Horse"
  | "Goat"
  | "Monkey"
  | "Rooster"
  | "Dog"
  | "Pig";
export type EngineFiveElementBureau = 2 | 3 | 4 | 5 | 6;
export type EngineTransformation = Transformation;
export type EnginePalaceName = PalaceName;
export type EngineStarName = StarName;
export type EngineStarCategory = "Major" | "Minor" | "Auxiliary";
export type EngineStarGalaxy = "South" | "Central" | "North";
export type EngineStar = readonly [
  EngineStarName,
  string,
  string,
  string,
  string,
  EngineStarCategory,
  EngineStarGalaxy,
  EngineTransformation | null,
  EngineTransformation | null,
  EngineTransformation | null,
];
export type EnginePalace = readonly [
  EnginePalaceName,
  string,
  string,
  Branch,
  Stem,
  readonly EngineStar[],
  readonly [number, number],
];
export interface EngineProfile {
  readonly gender: Gender;
  readonly birthYear?: number;
  readonly birthStem: Stem;
  readonly birthBranch: Branch;
  readonly birthMonth: number;
  readonly birthDay?: number;
  readonly birthHour: Branch;
}
export interface EngineLocatedStar {
  palace: EnginePalace;
  star: EngineStar;
}
export interface EnginePalaceTransformation {
  sourceBranch: Branch;
  targetBranch: Branch;
  transformation: Transformation;
  star: StarName;
}
export interface EngineSnapshotLocations {
  mingPalaceBranch: Branch;
  shenPalaceBranch: Branch;
  originPalaceBranch: Branch;
  ziweiBranch: Branch;
}
export interface EngineConstruction {
  natal?: EngineNatal;
  error?: EngineFailure;
}
export interface EngineDecadeYear {
  age: number;
  year?: number;
}
export interface EnginePeriodIndices {
  decade: number;
  yearly: number;
}
export interface EnginePeriodPalace {
  name: PalaceName;
  nameHans: string;
  nameHant: string;
}

export interface EngineData {
  readonly profile: EngineProfile;
  readonly zodiac: EngineZodiac;
  readonly fiveElementBureau: EngineFiveElementBureau;
  readonly palaces: readonly EnginePalace[];
  readonly mingPalaceBranch: Branch;
  readonly shenPalaceBranch: Branch;
  readonly originPalaceBranch: Branch;
  readonly ziweiBranch: Branch;
  readonly shenPalaceName: PalaceName;
  readonly originPalaceName: PalaceName;
  readonly ziweiPalaceName: PalaceName;
  readonly decadeDirection: 1 | -1;
}

const PALACE_NAMES = Object.freeze([
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
] as const);
const PALACE_HANS = Object.freeze([
  "命宫",
  "兄弟",
  "夫妻",
  "子女",
  "财帛",
  "疾厄",
  "迁移",
  "交友",
  "官禄",
  "田宅",
  "福德",
  "父母",
]);
const PALACE_HANT = Object.freeze([
  "命宮",
  "兄弟",
  "夫妻",
  "子女",
  "財帛",
  "疾厄",
  "遷移",
  "交友",
  "官祿",
  "田宅",
  "福德",
  "父母",
]);
const STAR_NAMES = Object.freeze([
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
] as const);
const STAR_HANS = Object.freeze([
  "紫微",
  "天机",
  "太阳",
  "武曲",
  "天同",
  "廉贞",
  "天府",
  "太阴",
  "贪狼",
  "巨门",
  "天相",
  "天梁",
  "七杀",
  "破军",
  "左辅",
  "右弼",
  "文昌",
  "文曲",
]);
const STAR_HANT = Object.freeze([
  "紫微",
  "天機",
  "太陽",
  "武曲",
  "天同",
  "廉貞",
  "天府",
  "太陰",
  "貪狼",
  "巨門",
  "天相",
  "天梁",
  "七殺",
  "破軍",
  "左輔",
  "右弼",
  "文昌",
  "文曲",
]);
const STAR_ABBR_HANS = Object.freeze([
  "紫",
  "机",
  "阳",
  "武",
  "同",
  "廉",
  "府",
  "阴",
  "贪",
  "巨",
  "相",
  "梁",
  "杀",
  "破",
  "辅",
  "弼",
  "昌",
  "曲",
]);
const STAR_ABBR_HANT = Object.freeze([
  "紫",
  "機",
  "陽",
  "武",
  "同",
  "廉",
  "府",
  "陰",
  "貪",
  "巨",
  "相",
  "梁",
  "殺",
  "破",
  "輔",
  "弼",
  "昌",
  "曲",
]);
const ZODIACS = Object.freeze([
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
] as const);
const TRANSFORMATIONS = Object.freeze(["A", "B", "C", "D"] as const);
const TRANSFORM_STARS: readonly (readonly StarName[])[] = Object.freeze([
  ["LianZhen", "PoJun", "WuQu", "TaiYang"],
  ["TianJi", "TianLiang", "ZiWei", "TaiYin"],
  ["TianTong", "TianJi", "WenChang", "LianZhen"],
  ["TaiYin", "TianTong", "TianJi", "JuMen"],
  ["TanLang", "TaiYin", "YouBi", "TianJi"],
  ["WuQu", "TanLang", "TianLiang", "WenQu"],
  ["TaiYang", "WuQu", "TaiYin", "TianTong"],
  ["JuMen", "TaiYang", "WenQu", "WenChang"],
  ["TianLiang", "ZiWei", "ZuoFu", "WuQu"],
  ["PoJun", "JuMen", "TaiYin", "TanLang"],
]);
const FIVE_TIGER: readonly (readonly Stem[])[] = Object.freeze([
  [2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3],
  [4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7],
  [8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1],
]);
const BUREAU: readonly (readonly EngineFiveElementBureau[])[] = Object.freeze([
  [4, 2, 6, 4, 2, 6],
  [2, 6, 5, 2, 6, 5],
  [6, 5, 3, 6, 5, 3],
  [5, 3, 4, 5, 3, 4],
  [3, 4, 2, 3, 4, 2],
]);
const ORIGIN_BRANCH: readonly Branch[] = Object.freeze([10, 9, 8, 7, 6, 5, 4, 3, 2, 11]);
const STAR_CATEGORY: readonly EngineStarCategory[] = Object.freeze([
  "Major",
  "Major",
  "Major",
  "Major",
  "Major",
  "Major",
  "Major",
  "Major",
  "Major",
  "Major",
  "Major",
  "Major",
  "Major",
  "Major",
  "Minor",
  "Minor",
  "Minor",
  "Minor",
]);
const STAR_GALAXY: readonly EngineStarGalaxy[] = Object.freeze([
  "Central",
  "North",
  "North",
  "North",
  "North",
  "North",
  "Central",
  "South",
  "South",
  "South",
  "Central",
  "South",
  "Central",
  "South",
  "Central",
  "Central",
  "Central",
  "Central",
]);

function mod(value: number, base = 12): number {
  return ((value % base) + base) % base;
}
function branchIndexFromYin(branch: number): number {
  return mod(branch - 2);
}
function branchFromYin(index: number): Branch {
  return mod(index + 2) as Branch;
}
function stemIndex(stem: Stem): number {
  return stem;
}
function branchId(branch: Branch): number {
  return branch;
}
function nameFromBranch(index: number): Branch {
  return mod(index) as Branch;
}
function fiveTigerGroup(stem: number): number {
  return [0, 1, 2, 3, 4, 0, 1, 2, 3, 4][stem] as number;
}
function bureauFor(stem: number, branch: number): EngineFiveElementBureau {
  const sg = Math.floor(stem / 2);
  const bg =
    branch < 2 ? 0 : branch < 4 ? 1 : branch < 6 ? 2 : branch < 8 ? 3 : branch < 10 ? 4 : 5;
  return BUREAU[sg]?.[bg] ?? 2;
}
function mingShen(month: number, hour: number): [Branch, Branch] {
  const monthIndex = 2 + month - 1;
  return [nameFromBranch(monthIndex - hour), nameFromBranch(monthIndex + hour)];
}
function palaceNames(mingBranch: number): PalaceName[] {
  const ming = branchIndexFromYin(mingBranch);
  return Array.from({ length: 12 }, (_, i) => PALACE_NAMES[mod(ming - i)] as PalaceName);
}
function ziweiBranch(bureau: number, day: number): Branch {
  const quotient = Math.ceil(day / bureau);
  const shortfall = quotient * bureau - day;
  const corrected = shortfall % 2 === 0 ? shortfall : -shortfall;
  return nameFromBranch(2 + quotient - 1 + corrected);
}
function starsAt(ziwei: number, month: number, hour: number): number[] {
  const ziweiIndex = ziwei;
  const tianfu = 4 - ziweiIndex;
  const offsets = [0, -1, -3, -4, -5, -8, 0, 1, 2, 3, 4, 5, 6, 10];
  const major = offsets.map((offset, index) =>
    nameFromBranch(index < 6 ? ziweiIndex + offset : tianfu + offset),
  );
  const zuofu = mod(4 + month - 1);
  const youbi = mod(10 - (month - 1));
  const wenchang = mod(10 - hour);
  const wenqu = mod(4 + hour);
  return [...major, zuofu, youbi, wenchang, wenqu];
}
function buildStars(
  birthStem: number,
  palaceStems: readonly Stem[],
  starBranches: readonly number[],
): EngineStar[] {
  const birth = TRANSFORM_STARS[birthStem] ?? [];
  const birthMap = new Map<StarName, Transformation>();
  birth.forEach((star, index) => birthMap.set(star, TRANSFORMATIONS[index] as Transformation));
  const inward = new Map<StarName, Transformation>();
  const outward = new Map<StarName, Transformation>();
  for (let palace = 0; palace < 12; palace++) {
    const stem = stemIndex(palaceStems[palace] as Stem);
    const targets = TRANSFORM_STARS[stem] ?? [];
    for (let i = 0; i < 4; i++) {
      const star = targets[i] as StarName;
      const targetBranch =
        starBranches[STAR_NAMES.indexOf(star as (typeof STAR_NAMES)[number])] ?? -1;
      const target = branchIndexFromYin(targetBranch);
      if (target === palace) outward.set(star, TRANSFORMATIONS[i] as Transformation);
      if (target === (palace + 6) % 12) inward.set(star, TRANSFORMATIONS[i] as Transformation);
    }
  }
  return STAR_NAMES.map((name, index) => [
    name,
    STAR_HANS[index] as string,
    STAR_HANT[index] as string,
    STAR_ABBR_HANS[index] as string,
    STAR_ABBR_HANT[index] as string,
    STAR_CATEGORY[index] as EngineStarCategory,
    STAR_GALAXY[index] as EngineStarGalaxy,
    birthMap.get(name) ?? null,
    inward.get(name) ?? null,
    outward.get(name) ?? null,
  ]);
}

function readInt(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number") throw argumentFailure(path, "type", value);
  if (!Number.isFinite(value)) throw argumentFailure(path, "non_finite", value);
  if (!Number.isInteger(value)) throw argumentFailure(path, "non_integer", value);
  if (value < min || value > max) throw argumentFailure(path, "out_of_range", value);
  return value === 0 ? 0 : value;
}
function readMember<const T extends readonly string[]>(
  value: unknown,
  members: T,
  path: string,
): T[number] {
  if (typeof value !== "string") throw argumentFailure(path, "type", value);
  if (!members.includes(value)) throw argumentFailure(path, "not_member", value);
  return value as T[number];
}
function invalidSexagenary(stem: number, branch: number): never {
  throw domainFailure("INVALID_SEXAGENARY_YEAR", stem, branch);
}
function makeData(input: {
  gender: Gender;
  birthYear?: number;
  birthStem: Stem;
  birthBranch: Branch;
  birthMonth: number;
  birthDay?: number;
  birthHour: Branch;
  ziwei: Branch;
}): EngineData {
  const [ming, shen] = mingShen(input.birthMonth, branchId(input.birthHour));
  const palaceStems = FIVE_TIGER[fiveTigerGroup(stemIndex(input.birthStem))] as readonly Stem[];
  const names = palaceNames(branchId(ming));
  const bureau = bureauFor(
    stemIndex(palaceStems[branchIndexFromYin(branchId(ming))] as Stem),
    branchId(ming),
  );
  const stars = starsAt(branchId(input.ziwei), input.birthMonth, branchId(input.birthHour));
  const starObjects = buildStars(stemIndex(input.birthStem), palaceStems, stars);
  const direction: 1 | -1 =
    (input.gender === 1) === (stemIndex(input.birthStem) % 2 === 0) ? 1 : -1;
  const palaces: EnginePalace[] = Array.from({ length: 12 }, (_, index) => {
    const branch = branchFromYin(index);
    const placed = starObjects.filter(
      (_, starIndex) => branchIndexFromYin(stars[starIndex] as number) === index,
    );
    const position = mod((index - branchIndexFromYin(branchId(ming))) * direction);
    const start = bureau + 10 * position;
    return [
      names[index] as PalaceName,
      PALACE_HANS[PALACE_NAMES.indexOf(names[index] as PalaceName)] as string,
      PALACE_HANT[PALACE_NAMES.indexOf(names[index] as PalaceName)] as string,
      branch,
      palaceStems[index] as Stem,
      placed,
      [start, start + 9],
    ];
  });
  const origin = ORIGIN_BRANCH[stemIndex(input.birthStem)] as Branch;
  const palaceNameAt = (branch: Branch) => palaces[branchIndexFromYin(branch)]?.[0] as PalaceName;
  return Object.freeze({
    profile: Object.freeze({
      gender: input.gender,
      ...(input.birthYear === undefined ? {} : { birthYear: input.birthYear }),
      birthStem: input.birthStem,
      birthBranch: input.birthBranch,
      birthMonth: input.birthMonth,
      ...(input.birthDay === undefined ? {} : { birthDay: input.birthDay }),
      birthHour: input.birthHour,
    }),
    zodiac: ZODIACS[branchId(input.birthBranch)] as EngineZodiac,
    fiveElementBureau: bureau,
    palaces: Object.freeze(palaces),
    mingPalaceBranch: ming,
    shenPalaceBranch: shen,
    originPalaceBranch: origin,
    ziweiBranch: input.ziwei,
    shenPalaceName: palaceNameAt(shen),
    originPalaceName: palaceNameAt(origin),
    ziweiPalaceName: palaceNameAt(input.ziwei),
    decadeDirection: direction,
  });
}

export class EngineNatal {
  readonly data: EngineData;
  readonly #periods: PeriodQueries<EnginePalace>;
  constructor(data: EngineData) {
    this.data = data;
    this.#periods = createPeriodQueries<EnginePalace>(data);
    Object.freeze(this);
  }
  get profile(): EngineProfile {
    return this.data.profile;
  }
  get zodiac(): EngineZodiac {
    return this.data.zodiac;
  }
  get fiveElementBureau(): EngineFiveElementBureau {
    return this.data.fiveElementBureau;
  }
  get palaces(): EnginePalace[] {
    return [...this.data.palaces];
  }
  snapshotLocations(): EngineSnapshotLocations {
    return {
      mingPalaceBranch: this.data.mingPalaceBranch,
      shenPalaceBranch: this.data.shenPalaceBranch,
      originPalaceBranch: this.data.originPalaceBranch,
      ziweiBranch: this.data.ziweiBranch,
    };
  }
  private branch(branch: unknown, path = "branch"): number {
    return readInt(branch, path, 0, 11);
  }
  private palaceAt(branch: number): EnginePalace {
    return this.data.palaces[branchIndexFromYin(branch)] as EnginePalace;
  }
  private safe<T>(run: () => T): T | EngineFailure {
    try {
      return run();
    } catch (error) {
      if (isFailure(error)) return error;
      throw error;
    }
  }
  palace(branch: unknown): EnginePalace | EngineFailure {
    return this.safe(() => this.palaceAt(this.branch(branch)));
  }
  palaceByName(name: unknown): EnginePalace | EngineFailure {
    return this.safe(() => {
      const member = readMember(name, PALACE_NAMES, "name");
      return this.data.palaces.find((p) => p[0] === member) as EnginePalace;
    });
  }
  palaceByStar(name: unknown): EnginePalace | EngineFailure {
    return this.safe(() => {
      const member = readMember(name, STAR_NAMES, "name");
      return this.data.palaces.find((p) => p[5].some((s) => s[0] === member)) as EnginePalace;
    });
  }
  star(name: unknown): EngineStar | EngineFailure {
    return this.safe(() => {
      const p = this.palaceByStar(name);
      if (isFailure(p)) throw p;
      return p[5].find((s) => s[0] === name) as EngineStar;
    });
  }
  palaceStar(branch: unknown, name: unknown): EngineStar | null | EngineFailure {
    return this.safe(() => {
      const b = this.branch(branch);
      const member = readMember(name, STAR_NAMES, "name");
      return (this.palaceAt(b)[5].find((s) => s[0] === member) as EngineStar | undefined) ?? null;
    });
  }
  oppositePalace(branch: unknown): EnginePalace | EngineFailure {
    return this.safe(() => this.palaceAt(nameFromBranch(this.branch(branch) + 6)));
  }
  sanfangPalaces(branch: unknown, includeSelf: unknown): EnginePalace[] | EngineFailure {
    return this.safe(() => {
      const b = this.branch(branch);
      if (typeof includeSelf !== "boolean")
        throw argumentFailure("includeSelf", "type", includeSelf);
      const i = branchIndexFromYin(b);
      const all = [0, 4, 8, 6].map((x) => this.palaceAt(branchFromYin(i + x)));
      return includeSelf ? all : all.slice(1);
    });
  }
  sizhengPalaces(branch: unknown): EnginePalace[] | EngineFailure {
    return this.safe(() => {
      const i = branchIndexFromYin(this.branch(branch));
      return [0, 4, 8, 6].map((x) => this.palaceAt(branchFromYin(i + x)));
    });
  }
  mingPalace(): EnginePalace {
    return this.palaceAt(this.data.mingPalaceBranch);
  }
  shenPalace(): EnginePalace {
    return this.palaceAt(this.data.shenPalaceBranch);
  }
  originPalace(): EnginePalace {
    return this.palaceAt(this.data.originPalaceBranch);
  }
  ziweiPalace(): EnginePalace {
    return this.palaceAt(this.data.ziweiBranch);
  }
  birthTransformations(): EngineLocatedStar[] {
    return (TRANSFORM_STARS[stemIndex(this.data.profile.birthStem)] ?? []).map((name) => {
      const star = this.star(name) as EngineStar;
      const palace = this.palaceByStar(name) as EnginePalace;
      return { palace, star };
    });
  }
  selfTransformations(): EngineLocatedStar[] {
    return this.data.palaces.flatMap((palace) =>
      palace[5]
        .filter((star) => star[8] !== null || star[9] !== null)
        .map((star) => ({ palace, star })),
    );
  }
  palaceTransformation(
    sourceBranch: unknown,
    kind: unknown,
  ): EnginePalaceTransformation | EngineFailure {
    return this.safe(() => {
      const b = this.branch(sourceBranch, "sourceBranch");
      const member = readMember(kind, TRANSFORMATIONS, "kind");
      const i = TRANSFORMATIONS.indexOf(member);
      const stem = stemIndex(this.palaceAt(b)[4]);
      const star = TRANSFORM_STARS[stem]?.[i] as StarName;
      const target = this.palaceByStar(star);
      if (isFailure(target)) throw target;
      return { sourceBranch: b as Branch, targetBranch: target[3], transformation: member, star };
    });
  }
  palaceTransformations(sourceBranch: unknown): EnginePalaceTransformation[] | EngineFailure {
    return this.safe(() =>
      TRANSFORMATIONS.map((kind) => {
        const value = this.palaceTransformation(sourceBranch, kind);
        if (isFailure(value)) throw value;
        return value;
      }),
    );
  }
  palaceTransformationSources(targetBranch: unknown): EnginePalaceTransformation[] | EngineFailure {
    return this.safe(() => {
      const target = this.branch(targetBranch, "targetBranch");
      const values: EnginePalaceTransformation[] = [];
      for (let source = 0; source < 12; source++)
        for (const relation of this.palaceTransformations(
          branchFromYin(source),
        ) as EnginePalaceTransformation[])
          if (relation.targetBranch === target) values.push(relation);
      return values;
    });
  }
  periodIndicesAtAge(age: unknown): EnginePeriodIndices | undefined | null | EngineFailure {
    return this.#periods.periodIndicesAtAge(age);
  }
  decade(index: unknown): EnginePeriodPalace[] | EngineFailure {
    return this.#periods.decade(index);
  }
  decadeByBranch(decade: unknown, branch: unknown): EnginePeriodPalace | EngineFailure {
    return this.#periods.decadeByBranch(decade, branch);
  }
  decadePalaceByName(decade: unknown, name: unknown): EnginePalace | EngineFailure {
    return this.#periods.decadePalaceByName(decade, name);
  }
  decadeYears(decade: unknown): EngineDecadeYear[] | EngineFailure {
    return this.#periods.decadeYears(decade);
  }
  yearly(decade: unknown, index: unknown): EnginePeriodPalace[] | EngineFailure {
    return this.#periods.yearly(decade, index);
  }
  yearlyByBranch(
    decade: unknown,
    yearly: unknown,
    branch: unknown,
  ): EnginePeriodPalace | EngineFailure {
    return this.#periods.yearlyByBranch(decade, yearly, branch);
  }
  yearlyPalaceByName(
    decade: unknown,
    yearly: unknown,
    name: unknown,
  ): EnginePalace | EngineFailure {
    return this.#periods.yearlyPalaceByName(decade, yearly, name);
  }
}

export function fromParameters(
  gender: unknown,
  birthStem: unknown,
  birthBranch: unknown,
  birthMonth: unknown,
  ziwei: unknown,
  birthHour: unknown,
): EngineConstruction {
  return attempt(() => {
    const g = readInt(gender, "gender", 0, 1) as Gender;
    const s = readInt(birthStem, "birthStem", 0, 9) as Stem;
    const b = readInt(birthBranch, "birthBranch", 0, 11) as Branch;
    const m = readInt(birthMonth, "birthMonth", 0, 255);
    if (m < 1 || m > 12) throw domainFailure("INVALID_LUNISOLAR_MONTH", m);
    const z = readInt(ziwei, "ziweiBranch", 0, 11) as Branch;
    const h = readInt(birthHour, "birthHour", 0, 11) as Branch;
    if (s % 2 !== b % 2) invalidSexagenary(s, b);
    return new EngineNatal(
      makeData({ gender: g, birthStem: s, birthBranch: b, birthMonth: m, ziwei: z, birthHour: h }),
    );
  });
}

export function fromBirth(
  gender: unknown,
  birthYear: unknown,
  birthMonth: unknown,
  birthDay: unknown,
  birthHour: unknown,
): EngineConstruction {
  return attempt(() => {
    const g = readInt(gender, "gender", 0, 1) as Gender;
    const year = readInt(birthYear, "birthYear", -2_147_483_648, 2_147_483_647);
    const month = readInt(birthMonth, "birthMonth", 0, 255);
    if (month < 1 || month > 12) throw domainFailure("INVALID_LUNISOLAR_MONTH", month);
    const day = readInt(birthDay, "birthDay", 0, 255);
    if (day < 1 || day > 30) throw domainFailure("INVALID_LUNISOLAR_DAY", day);
    const hour = readInt(birthHour, "birthHour", 0, 11) as Branch;
    const stem = mod(year + 6, 10) as Stem;
    const branch = mod(year + 8) as Branch;
    const [ming] = mingShen(month, branchId(hour));
    const palaceStems = FIVE_TIGER[fiveTigerGroup(stem)] as readonly Stem[];
    const bureau = bureauFor(
      stemIndex(palaceStems[branchIndexFromYin(branchIndex(ming))] as Stem),
      branchIndex(ming),
    );
    return new EngineNatal(
      makeData({
        gender: g,
        birthYear: year,
        birthStem: stem,
        birthBranch: branch,
        birthMonth: month,
        birthDay: day,
        birthHour: hour,
        ziwei: ziweiBranch(bureau, day),
      }),
    );
  });
}

function branchIndex(branch: Branch): number {
  return branchId(branch);
}
function attempt(make: () => EngineNatal): EngineConstruction {
  try {
    return { natal: make() };
  } catch (error) {
    if (isFailure(error)) return { error };
    throw error;
  }
}

export function identities() {
  return {
    stems: Array.from({ length: 10 }, (_, i) => i),
    branches: Array.from({ length: 12 }, (_, i) => i),
    palaces: [...PALACE_NAMES],
    stars: [...STAR_NAMES],
    transformations: [...TRANSFORMATIONS],
  };
}
export function genderYinYang(value: unknown): EngineYinYang | EngineFailure {
  return unary(value, 0, 1, "value", (n) => n as EngineYinYang);
}
export function stemYinYang(value: unknown): EngineYinYang | EngineFailure {
  return unary(value, 0, 9, "value", (n) => (n % 2 === 0 ? 1 : 0));
}
export function branchYinYang(value: unknown): EngineYinYang | EngineFailure {
  return unary(value, 0, 11, "value", (n) => (n % 2 === 0 ? 1 : 0));
}
export function branchZodiac(value: unknown): EngineZodiac | EngineFailure {
  return unary(value, 0, 11, "value", (n) => ZODIACS[n] as EngineZodiac);
}
function unary<T>(
  value: unknown,
  min: number,
  max: number,
  path: string,
  convert: (n: number) => T,
): T | EngineFailure {
  try {
    return convert(readInt(value, path, min, max));
  } catch (error) {
    if (isFailure(error)) return error;
    throw error;
  }
}
