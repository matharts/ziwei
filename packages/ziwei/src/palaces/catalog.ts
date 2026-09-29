import type { PalaceName } from "../domain/identities.js";

type PalaceLabels = readonly [hans: string, hant: string, shortHans: string, shortHant: string];

/** One source for natal and period labels, keyed by palace identity. */
export const PALACE_LABELS: Readonly<Record<PalaceName, PalaceLabels>> = {
  Ming: ["命宫", "命宮", "命", "命"],
  XiongDi: ["兄弟", "兄弟", "兄", "兄"],
  FuQi: ["夫妻", "夫妻", "夫", "夫"],
  ZiNv: ["子女", "子女", "子", "子"],
  CaiBo: ["财帛", "財帛", "财", "財"],
  JiE: ["疾厄", "疾厄", "疾", "疾"],
  QianYi: ["迁移", "遷移", "迁", "遷"],
  JiaoYou: ["交友", "交友", "友", "友"],
  GuanLu: ["官禄", "官祿", "官", "官"],
  TianZhai: ["田宅", "田宅", "田", "田"],
  FuDe: ["福德", "福德", "福", "福"],
  FuMu: ["父母", "父母", "父", "父"],
};
