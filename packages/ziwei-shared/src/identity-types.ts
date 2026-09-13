/** Shared identities used by errors and projections; runtime values remain in each adapter. */
export type Gender = 0 | 1;
export type Stem = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Branch = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type PalaceName =
  | "Ming"
  | "XiongDi"
  | "FuQi"
  | "ZiNv"
  | "CaiBo"
  | "JiE"
  | "QianYi"
  | "JiaoYou"
  | "GuanLu"
  | "TianZhai"
  | "FuDe"
  | "FuMu";
export type StarName =
  | "ZiWei"
  | "TianJi"
  | "TaiYang"
  | "WuQu"
  | "TianTong"
  | "LianZhen"
  | "TianFu"
  | "TaiYin"
  | "TanLang"
  | "JuMen"
  | "TianXiang"
  | "TianLiang"
  | "QiSha"
  | "PoJun"
  | "ZuoFu"
  | "YouBi"
  | "WenChang"
  | "WenQu";
export type StarCategory = "Major" | "Minor" | "Auxiliary";
export type StarGalaxy = "South" | "Central" | "North";
export type Transformation = "A" | "B" | "C" | "D";
