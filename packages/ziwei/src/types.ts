import { unwrap, arity } from "@matharts/ziwei-shared";
import type {
  Gender as SharedGender,
  BirthMonth,
  BirthDay,
  Profile,
  Stem as SharedStem,
  Branch as SharedBranch,
  PalaceName as SharedPalaceName,
  StarName as SharedStarName,
  StarCategory as SharedStarCategory,
  StarGalaxy as SharedStarGalaxy,
  Transformation as SharedTransformation,
  Star,
  Palace,
  LocatedStar,
  PalaceTransformation,
} from "@matharts/ziwei-shared";

export type {
  BirthMonth,
  BirthDay,
  Profile,
  Star,
  Palace,
  SelfTransformations,
  DecadeAgeRange,
  LocatedStar,
  PalaceTransformation,
} from "@matharts/ziwei-shared";

import * as native from "../native/binding.cjs";

const identities = native.identities();

export const YinYang = Object.freeze({ Yin: 0, Yang: 1 } as const);
export type YinYang = 0 | 1;

export const FiveElement = Object.freeze({
  Water: "Water",
  Wood: "Wood",
  Metal: "Metal",
  Earth: "Earth",
  Fire: "Fire",
} as const);
export type FiveElement = (typeof FiveElement)[keyof typeof FiveElement];

export type Gender = SharedGender;
export const Gender = Object.freeze({
  Female: 0,
  Male: 1,
  yinYang(value: Gender): YinYang {
    arity(arguments.length, "value");
    return unwrap(native.genderYinYang(value));
  },
} as const);

export const Stem = Object.freeze({
  Jia: 0,
  Yi: 1,
  Bing: 2,
  Ding: 3,
  Wu: 4,
  Ji: 5,
  Geng: 6,
  Xin: 7,
  Ren: 8,
  Gui: 9,
  ALL: Object.freeze(identities.stems),
  yinYang(value: Stem): YinYang {
    arity(arguments.length, "value");
    return unwrap(native.stemYinYang(value));
  },
} as const);
export type Stem = SharedStem;

/** 子 = 0；时辰不是 0..23 的钟表小时。 */
export const Branch = Object.freeze({
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
  ALL: Object.freeze(identities.branches),
  yinYang(value: Branch): YinYang {
    arity(arguments.length, "value");
    return unwrap(native.branchYinYang(value));
  },
  zodiac(value: Branch): Zodiac {
    arity(arguments.length, "value");
    return unwrap(native.branchZodiac(value));
  },
} as const);
export type Branch = SharedBranch;

export const Zodiac = Object.freeze({
  Rat: "Rat",
  Ox: "Ox",
  Tiger: "Tiger",
  Rabbit: "Rabbit",
  Dragon: "Dragon",
  Snake: "Snake",
  Horse: "Horse",
  Goat: "Goat",
  Monkey: "Monkey",
  Rooster: "Rooster",
  Dog: "Dog",
  Pig: "Pig",
} as const);
export type Zodiac = (typeof Zodiac)[keyof typeof Zodiac];

export const FiveElementBureau = Object.freeze({
  WaterTwo: 2,
  WoodThree: 3,
  MetalFour: 4,
  EarthFive: 5,
  FireSix: 6,
} as const);
export type FiveElementBureau = (typeof FiveElementBureau)[keyof typeof FiveElementBureau];

const palaceNames = {
  Ming: "Ming",
  XiongDi: "XiongDi",
  FuQi: "FuQi",
  ZiNv: "ZiNv",
  CaiBo: "CaiBo",
  JiE: "JiE",
  QianYi: "QianYi",
  JiaoYou: "JiaoYou",
  GuanLu: "GuanLu",
  TianZhai: "TianZhai",
  FuDe: "FuDe",
  FuMu: "FuMu",
} as const;
export type PalaceName = SharedPalaceName;
export const PalaceName = Object.freeze({
  ...palaceNames,
  ALL: Object.freeze<PalaceName[]>(identities.palaces),
});

const starNames = {
  ZiWei: "ZiWei",
  TianJi: "TianJi",
  TaiYang: "TaiYang",
  WuQu: "WuQu",
  TianTong: "TianTong",
  LianZhen: "LianZhen",
  TianFu: "TianFu",
  TaiYin: "TaiYin",
  TanLang: "TanLang",
  JuMen: "JuMen",
  TianXiang: "TianXiang",
  TianLiang: "TianLiang",
  QiSha: "QiSha",
  PoJun: "PoJun",
  ZuoFu: "ZuoFu",
  YouBi: "YouBi",
  WenChang: "WenChang",
  WenQu: "WenQu",
} as const;
export type StarName = SharedStarName;
export const StarName = Object.freeze({
  ...starNames,
  ALL: Object.freeze<StarName[]>(identities.stars),
});

export const StarCategory = Object.freeze({
  Major: "Major",
  Minor: "Minor",
  Auxiliary: "Auxiliary",
} as const);
export type StarCategory = SharedStarCategory;

export const StarGalaxy = Object.freeze({
  South: "South",
  Central: "Central",
  North: "North",
} as const);
export type StarGalaxy = SharedStarGalaxy;

const transformations = {
  A: "A",
  B: "B",
  C: "C",
  D: "D",
} as const;
export type Transformation = SharedTransformation;
export const Transformation = Object.freeze({
  ...transformations,
  ALL: Object.freeze<Transformation[]>(identities.transformations),
});

/** 零基大限序号，运行时验证 0..11。 */
export type DecadeIndex = number;
/** 大限内零基流年序号，运行时验证 0..9。 */
export type YearlyIndex = number;

export interface Birth {
  readonly gender: Gender;
  readonly birthYear: number;
  readonly birthMonth: BirthMonth;
  readonly birthDay: BirthDay;
  readonly birthHour: Branch;
}

export interface Parameters {
  readonly gender: Gender;
  readonly birthStem: Stem;
  readonly birthBranch: Branch;
  readonly birthMonth: BirthMonth;
  readonly ziweiBranch: Branch;
  readonly birthHour: Branch;
}

/** 不可变本命事实与同步、按需查询；只能通过 Ziwei 创建。 */
export interface Natal {
  readonly profile: Profile;
  readonly zodiac: Zodiac;
  readonly fiveElementBureau: FiveElementBureau;
  readonly palaces: readonly Palace[];
  palace(branch: Branch): Palace;
  palaceByName(name: PalaceName): Palace;
  palaceByStar(name: StarName): Palace;
  star(name: StarName): Star;
  palaceStar(branch: Branch, name: StarName): Star | null;
  oppositePalace(branch: Branch): Palace;
  sanfangPalaces(branch: Branch, includeSelf: boolean): readonly Palace[];
  sizhengPalaces(branch: Branch): readonly Palace[];
  mingPalace(): Palace;
  shenPalace(): Palace;
  originPalace(): Palace;
  ziweiPalace(): Palace;
  birthTransformations(): readonly LocatedStar[];
  selfTransformations(): readonly LocatedStar[];
  palaceTransformation(sourceBranch: Branch, kind: Transformation): PalaceTransformation;
  palaceTransformations(sourceBranch: Branch): readonly PalaceTransformation[];
  palaceTransformationSources(targetBranch: Branch): readonly PalaceTransformation[];
  periodIndicesAtAge(age: number): PeriodIndices | null;
  decade(index: DecadeIndex): readonly Decade[];
  decadeByBranch(decade: DecadeIndex, branch: Branch): Decade;
  decadePalaceByName(decade: DecadeIndex, name: PalaceName): Palace;
  decadeYears(decade: DecadeIndex): readonly DecadeYear[];
  yearly(decade: DecadeIndex, index: YearlyIndex): readonly Yearly[];
  yearlyByBranch(decade: DecadeIndex, yearly: YearlyIndex, branch: Branch): Yearly;
  yearlyPalaceByName(decade: DecadeIndex, yearly: YearlyIndex, name: PalaceName): Palace;
  toJSON(): NatalSnapshot;
}

export interface NatalSnapshot {
  readonly profile: Profile;
  readonly zodiac: Zodiac;
  readonly fiveElementBureau: FiveElementBureau;
  readonly palaces: readonly Palace[];
  readonly mingPalaceBranch: Branch;
  readonly shenPalaceBranch: Branch;
  readonly originPalaceBranch: Branch;
  readonly ziweiBranch: Branch;
}

export interface Decade {
  readonly name: PalaceName;
  readonly nameHans: string;
  readonly nameHant: string;
}

export interface Yearly {
  readonly name: PalaceName;
  readonly nameHans: string;
  readonly nameHant: string;
}

export interface DecadeYear {
  readonly age: number;
  readonly year: number | null;
}

export interface PeriodIndices {
  readonly decade: DecadeIndex;
  readonly yearly: YearlyIndex;
}
