import { argumentFailure, domainFailure } from "./validation.js";

const palaceNames = [
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
] as const;

type PalaceName = (typeof palaceNames)[number];
type Failure = ReturnType<typeof argumentFailure> | ReturnType<typeof domainFailure>;

export interface PeriodPalace {
  readonly 0: PalaceName;
  readonly 3: number;
}

export interface PeriodData<TPalace extends PeriodPalace> {
  readonly profile: {
    readonly gender: number;
    readonly birthStem: number;
    readonly birthBranch: number;
    readonly birthYear?: number;
  };
  readonly fiveElementBureau: number;
  readonly mingPalaceBranch: number;
  readonly palaces: readonly TPalace[];
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function fromYin(branch: number): number {
  return mod(branch - 2, 12);
}

function isFailure(value: unknown): value is Failure {
  return value !== null && typeof value === "object" && "code" in value;
}

function integer(value: unknown, path: string, max: number): number | Failure {
  if (typeof value !== "number") return argumentFailure(path, "type", value);
  if (!Number.isFinite(value)) return argumentFailure(path, "non_finite", value);
  if (!Number.isInteger(value)) return argumentFailure(path, "non_integer", value);
  if (value < 0 || value > max) return argumentFailure(path, "out_of_range", value);
  return value;
}

function decadeIndex(value: unknown, path: string): number | Failure {
  const index = integer(value, path, 255);
  if (isFailure(index)) return index;
  return index <= 11 ? index : domainFailure("INVALID_DECADE_INDEX", index);
}

function yearlyIndex(value: unknown, path: string): number | Failure {
  const index = integer(value, path, 255);
  if (isFailure(index)) return index;
  return index <= 9 ? index : domainFailure("INVALID_YEARLY_INDEX", index);
}

function branch(value: unknown, path: string): number | Failure {
  return integer(value, path, 11);
}

function palaceName(value: unknown): PalaceName | Failure {
  if (typeof value !== "string") return argumentFailure("name", "type", value);
  return palaceNames.includes(value as PalaceName)
    ? (value as PalaceName)
    : argumentFailure("name", "not_member", value);
}

function periodPalace(name: PalaceName, prefix: "大" | "流") {
  const hans = ["命", "兄", "夫", "子", "财", "疾", "迁", "友", "官", "田", "福", "父"];
  const hant = ["命", "兄", "夫", "子", "財", "疾", "遷", "友", "官", "田", "福", "父"];
  const index = palaceNames.indexOf(name);
  return { name, nameHans: prefix + hans[index], nameHant: prefix + hant[index] };
}

/** Period views are computed from immutable natal facts; no result is cached on a chart. */
export function createPeriodQueries<TPalace extends PeriodPalace>(data: PeriodData<TPalace>) {
  const bureau = data.fiveElementBureau;
  const birth = data.profile;
  const forward = (birth.gender === 1) === (birth.birthStem % 2 === 0);
  const decadeMing = (index: number) => fromYin(data.mingPalaceBranch) + (forward ? index : -index);
  const age = (decade: number, yearly: number) => bureau + 10 * decade + yearly;
  const yearlyMing = (decade: number, yearly: number) =>
    fromYin(mod(birth.birthBranch + age(decade, yearly) - 1, 12));
  const layoutName = (ming: number, palace: number) => palaceNames[mod(ming - palace, 12)]!;
  const layout = (ming: number, prefix: "大" | "流") =>
    Array.from({ length: 12 }, (_, palace) => periodPalace(layoutName(ming, palace), prefix));
  const palaceForName = (ming: number, name: PalaceName): TPalace =>
    data.palaces[mod(ming - palaceNames.indexOf(name), 12)]!;

  return {
    periodIndicesAtAge(rawAge: unknown) {
      const value = integer(rawAge, "age", 255);
      if (isFailure(value)) return value;
      const offset = value - bureau;
      if (offset < 0 || offset >= 120) return null;
      return { decade: Math.floor(offset / 10), yearly: offset % 10 };
    },
    decade(rawIndex: unknown) {
      const index = decadeIndex(rawIndex, "index");
      return isFailure(index) ? index : layout(decadeMing(index), "大");
    },
    decadeByBranch(rawDecade: unknown, rawBranch: unknown) {
      const decade = decadeIndex(rawDecade, "decade");
      if (isFailure(decade)) return decade;
      const target = branch(rawBranch, "branch");
      if (isFailure(target)) return target;
      return periodPalace(layoutName(decadeMing(decade), fromYin(target)), "大");
    },
    decadePalaceByName(rawDecade: unknown, rawName: unknown) {
      const decade = decadeIndex(rawDecade, "decade");
      if (isFailure(decade)) return decade;
      const name = palaceName(rawName);
      return isFailure(name) ? name : palaceForName(decadeMing(decade), name);
    },
    decadeYears(rawDecade: unknown) {
      const decade = decadeIndex(rawDecade, "decade");
      if (isFailure(decade)) return decade;
      return Array.from({ length: 10 }, (_, yearly) => {
        const currentAge = age(decade, yearly);
        return birth.birthYear === undefined
          ? { age: currentAge }
          : { age: currentAge, year: birth.birthYear + currentAge - 1 };
      });
    },
    yearly(rawDecade: unknown, rawIndex: unknown) {
      const decade = decadeIndex(rawDecade, "decade");
      if (isFailure(decade)) return decade;
      const yearly = yearlyIndex(rawIndex, "index");
      return isFailure(yearly) ? yearly : layout(yearlyMing(decade, yearly), "流");
    },
    yearlyByBranch(rawDecade: unknown, rawYearly: unknown, rawBranch: unknown) {
      const decade = decadeIndex(rawDecade, "decade");
      if (isFailure(decade)) return decade;
      const yearly = yearlyIndex(rawYearly, "yearly");
      if (isFailure(yearly)) return yearly;
      const target = branch(rawBranch, "branch");
      if (isFailure(target)) return target;
      return periodPalace(layoutName(yearlyMing(decade, yearly), fromYin(target)), "流");
    },
    yearlyPalaceByName(rawDecade: unknown, rawYearly: unknown, rawName: unknown) {
      const decade = decadeIndex(rawDecade, "decade");
      if (isFailure(decade)) return decade;
      const yearly = yearlyIndex(rawYearly, "yearly");
      if (isFailure(yearly)) return yearly;
      const name = palaceName(rawName);
      return isFailure(name) ? name : palaceForName(yearlyMing(decade, yearly), name);
    },
  };
}

export type PeriodQueries<TPalace extends PeriodPalace> = ReturnType<
  typeof createPeriodQueries<TPalace>
>;
