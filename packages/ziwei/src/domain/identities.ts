// Stable domain identities. Display labels are not rule keys.
export const YinYang = Object.freeze({ Yin: 0, Yang: 1 } as const);
export type YinYang = 0 | 1;
export const Gender = Object.freeze({ Female: 0, Male: 1 } as const);
export type Gender = 0 | 1;
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
  ALL: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const),
} as const);
export type Stem = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
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
  ALL: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const),
} as const);
export type Branch = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
/** Wrap a signed rule offset into a nonnegative cycle index. */
export const cycle = (value: number, divisor = 12): number => {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder + 0;
};
/** Convert a branch to its index in the palace order starting at Yin. */
export const yinIndex = (branch: Branch): number => (branch < 2 ? branch + 10 : branch - 2);
/** Convert a palace-order index back to the corresponding branch. */
export const branchAtYinIndex = (index: number): Branch =>
  (index < 10 ? index + 2 : index - 10) as Branch;
export const FiveElement = Object.freeze({
  Water: "Water",
  Wood: "Wood",
  Metal: "Metal",
  Earth: "Earth",
  Fire: "Fire",
} as const);
export type FiveElement = (typeof FiveElement)[keyof typeof FiveElement];
export const FiveElementBureau = Object.freeze({
  WaterTwo: 2,
  WoodThree: 3,
  MetalFour: 4,
  EarthFive: 5,
  FireSix: 6,
} as const);
export type FiveElementBureau = 2 | 3 | 4 | 5 | 6;
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
export const ZODIAC_BY_BRANCH: readonly Zodiac[] = Object.freeze(Object.values(Zodiac));
export const PalaceName = Object.freeze({
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
  ALL: Object.freeze([
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
  ] as const),
} as const);
export type PalaceName = (typeof PalaceName.ALL)[number];
export const PALACE_ORDINAL: Readonly<Record<PalaceName, number>> = Object.freeze(
  Object.setPrototypeOf(
    Object.fromEntries(PalaceName.ALL.map((name, index) => [name, index])),
    null,
  ) as Record<PalaceName, number>,
);
export const StarName = Object.freeze({
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
  ALL: Object.freeze([
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
  ] as const),
} as const);
export type StarName = (typeof StarName.ALL)[number];
export const STAR_ORDINAL: Readonly<Record<StarName, number>> = Object.freeze(
  Object.setPrototypeOf(
    Object.fromEntries(StarName.ALL.map((name, index) => [name, index])),
    null,
  ) as Record<StarName, number>,
);
export const StarCategory = Object.freeze({
  Major: "Major",
  Minor: "Minor",
  Auxiliary: "Auxiliary",
} as const);
export type StarCategory = (typeof StarCategory)[keyof typeof StarCategory];
export const StarGalaxy = Object.freeze({
  South: "South",
  Central: "Central",
  North: "North",
} as const);
export type StarGalaxy = (typeof StarGalaxy)[keyof typeof StarGalaxy];
export const Transformation = Object.freeze({
  A: "A",
  B: "B",
  C: "C",
  D: "D",
  ALL: Object.freeze(["A", "B", "C", "D"] as const),
} as const);
export type Transformation = (typeof Transformation.ALL)[number];
