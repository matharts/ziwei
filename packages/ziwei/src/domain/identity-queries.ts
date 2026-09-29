import { integer, invalid } from "./constraints.js";
import {
  Branch,
  Gender,
  STAR_ORDINAL,
  StarName,
  Stem,
  YinYang,
  ZODIAC_BY_BRANCH,
  type Zodiac,
} from "./identities.js";

export function stemYinYang(stem: Stem): YinYang {
  return integer(stem, "stem", 0, 9) % 2 === 0 ? YinYang.Yang : YinYang.Yin;
}

export function branchYinYang(branch: Branch): YinYang {
  return integer(branch, "branch", 0, 11) % 2 === 0 ? YinYang.Yang : YinYang.Yin;
}

export function genderYinYang(gender: Gender): YinYang {
  return integer(gender, "gender", 0, 1) as YinYang;
}

export function branchZodiac(branch: Branch): Zodiac {
  return ZODIAC_BY_BRANCH[integer(branch, "branch", 0, 11)]!;
}

export function checkedStarOrdinal(value: unknown): number {
  const ordinal =
    typeof value === "string" ? (STAR_ORDINAL as Record<string, number>)[value] : undefined;
  if (typeof ordinal !== "number") invalid("name", value);
  return ordinal;
}

export function starName(value: unknown): StarName {
  checkedStarOrdinal(value);
  return value as StarName;
}
