import { unwrap } from "./error.js";
import { arity } from "./input.js";
import type {
  YinYang,
  Gender,
  Stem,
  Branch,
  Zodiac,
  PalaceName,
  StarName,
  Transformation,
} from "./types.js";

export function createIdentities(
  native: typeof import("../generated/ziwei_wasm.js"),
): import("./types.js").IdentityRuntime {
  const identities = native.identities();

  const YinYang = Object.freeze({ Yin: 0, Yang: 1 } as const);

  const FiveElement = Object.freeze({
    Water: "Water",
    Wood: "Wood",
    Metal: "Metal",
    Earth: "Earth",
    Fire: "Fire",
  } as const);

  const Gender = Object.freeze({
    Female: 0,
    Male: 1,
    yinYang(value: Gender): YinYang {
      arity(arguments.length, "value");
      return unwrap(native.genderYinYang(value));
    },
  } as const);

  const Stem = Object.freeze({
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

  /** 子 = 0；时辰不是 0..23 的钟表小时。 */
  const Branch = Object.freeze({
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

  const Zodiac = Object.freeze({
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

  const FiveElementBureau = Object.freeze({
    WaterTwo: 2,
    WoodThree: 3,
    MetalFour: 4,
    EarthFive: 5,
    FireSix: 6,
  } as const);

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
  const PalaceName = Object.freeze({
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
  const StarName = Object.freeze({
    ...starNames,
    ALL: Object.freeze<StarName[]>(identities.stars),
  });

  const StarCategory = Object.freeze({
    Major: "Major",
    Minor: "Minor",
    Auxiliary: "Auxiliary",
  } as const);

  const StarGalaxy = Object.freeze({
    South: "South",
    Central: "Central",
    North: "North",
  } as const);

  const transformations = {
    A: "A",
    B: "B",
    C: "C",
    D: "D",
  } as const;
  const Transformation = Object.freeze({
    ...transformations,
    ALL: Object.freeze<Transformation[]>(identities.transformations),
  });

  return Object.freeze({
    YinYang,
    FiveElement,
    Gender,
    Stem,
    Branch,
    Zodiac,
    FiveElementBureau,
    PalaceName,
    StarName,
    StarCategory,
    StarGalaxy,
    Transformation,
  });
}
