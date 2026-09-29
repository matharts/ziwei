import { STAR_ORDINAL, StarCategory, StarGalaxy, StarName } from "../domain/identities.js";

type StarDefinition = readonly [
  hans: string,
  hant: string,
  abbrHans: string,
  abbrHant: string,
  category: StarCategory,
  galaxy: StarGalaxy,
];

/** Display data is keyed by domain identity, never by its position in an unrelated array. */
export const STAR_DEFINITIONS: Readonly<Record<StarName, StarDefinition>> = {
  ZiWei: ["紫微", "紫微", "紫", "紫", StarCategory.Major, StarGalaxy.Central],
  TianJi: ["天机", "天機", "机", "機", StarCategory.Major, StarGalaxy.North],
  TaiYang: ["太阳", "太陽", "阳", "陽", StarCategory.Major, StarGalaxy.North],
  WuQu: ["武曲", "武曲", "武", "武", StarCategory.Major, StarGalaxy.North],
  TianTong: ["天同", "天同", "同", "同", StarCategory.Major, StarGalaxy.North],
  LianZhen: ["廉贞", "廉貞", "廉", "廉", StarCategory.Major, StarGalaxy.North],
  TianFu: ["天府", "天府", "府", "府", StarCategory.Major, StarGalaxy.Central],
  TaiYin: ["太阴", "太陰", "阴", "陰", StarCategory.Major, StarGalaxy.South],
  TanLang: ["贪狼", "貪狼", "贪", "貪", StarCategory.Major, StarGalaxy.South],
  JuMen: ["巨门", "巨門", "巨", "巨", StarCategory.Major, StarGalaxy.South],
  TianXiang: ["天相", "天相", "相", "相", StarCategory.Major, StarGalaxy.Central],
  TianLiang: ["天梁", "天梁", "梁", "梁", StarCategory.Major, StarGalaxy.South],
  QiSha: ["七杀", "七殺", "杀", "殺", StarCategory.Major, StarGalaxy.Central],
  PoJun: ["破军", "破軍", "破", "破", StarCategory.Major, StarGalaxy.South],
  ZuoFu: ["左辅", "左輔", "辅", "輔", StarCategory.Minor, StarGalaxy.Central],
  YouBi: ["右弼", "右弼", "弼", "弼", StarCategory.Minor, StarGalaxy.Central],
  WenChang: ["文昌", "文昌", "昌", "昌", StarCategory.Minor, StarGalaxy.Central],
  WenQu: ["文曲", "文曲", "曲", "曲", StarCategory.Minor, StarGalaxy.Central],
};

/** Stem row, then A/B/C/D. This is the V1 fixed four-transformation table. */
export const TRANSFORMATION_STARS: readonly (readonly StarName[])[] = [
  [StarName.LianZhen, StarName.PoJun, StarName.WuQu, StarName.TaiYang],
  [StarName.TianJi, StarName.TianLiang, StarName.ZiWei, StarName.TaiYin],
  [StarName.TianTong, StarName.TianJi, StarName.WenChang, StarName.LianZhen],
  [StarName.TaiYin, StarName.TianTong, StarName.TianJi, StarName.JuMen],
  [StarName.TanLang, StarName.TaiYin, StarName.YouBi, StarName.TianJi],
  [StarName.WuQu, StarName.TanLang, StarName.TianLiang, StarName.WenQu],
  [StarName.TaiYang, StarName.WuQu, StarName.TaiYin, StarName.TianTong],
  [StarName.JuMen, StarName.TaiYang, StarName.WenQu, StarName.WenChang],
  [StarName.TianLiang, StarName.ZiWei, StarName.ZuoFu, StarName.WuQu],
  [StarName.PoJun, StarName.JuMen, StarName.TaiYin, StarName.TanLang],
];

/** Numeric projection of the fixed transformation table, shared by value and query paths. */
export const TRANSFORMATION_STAR_INDICES: readonly (readonly number[])[] = Object.freeze(
  TRANSFORMATION_STARS.map((row) => Object.freeze(row.map((name) => STAR_ORDINAL[name]))),
);
