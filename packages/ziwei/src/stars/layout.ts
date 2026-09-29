import {
  Branch,
  STAR_ORDINAL,
  StarName,
  branchAtYinIndex,
  cycle,
  yinIndex,
} from "../domain/identities.js";

const STAR_COUNT = StarName.ALL.length;
const ZIWEI_OFFSETS = [0, -1, -3, -4, -5, -8] as const;
const TIANFU_OFFSETS = [0, 1, 2, 3, 4, 5, 6, 10] as const;
export const STAR_LAYOUT_ROWS = 12 * 12 * 12;
export const { masks: STAR_MASKS_BY_LAYOUT, palaceIndices: STAR_PALACE_INDICES_BY_LAYOUT } =
  (() => {
    const placements = new Uint8Array(STAR_COUNT);
    const masks = new Uint32Array(STAR_LAYOUT_ROWS * 12);
    const palaceIndices = new Uint8Array(STAR_LAYOUT_ROWS * STAR_COUNT);
    for (const ziwei of Branch.ALL) {
      const tianfu = cycle(4 - ziwei);
      const major = new Uint8Array(ZIWEI_OFFSETS.length + TIANFU_OFFSETS.length);
      for (let index = 0; index < ZIWEI_OFFSETS.length; index++) {
        major[index] = yinIndex(cycle(ziwei + ZIWEI_OFFSETS[index]!) as Branch);
      }
      for (let index = 0; index < TIANFU_OFFSETS.length; index++) {
        major[ZIWEI_OFFSETS.length + index] = yinIndex(
          cycle(tianfu + TIANFU_OFFSETS[index]!) as Branch,
        );
      }
      for (let month = 1; month <= 12; month++) {
        const zuofu = yinIndex(cycle(month + 3) as Branch);
        const youbi = yinIndex(cycle(11 - month) as Branch);
        for (const hour of Branch.ALL) {
          const row = (ziwei * 12 + month - 1) * 12 + hour;
          const placementOffset = row * STAR_COUNT;
          for (let index = 0; index < major.length; index++) {
            placements[index] = major[index]!;
          }
          placements[STAR_ORDINAL.ZuoFu] = zuofu;
          placements[STAR_ORDINAL.YouBi] = youbi;
          placements[STAR_ORDINAL.WenChang] = yinIndex(cycle(10 - hour) as Branch);
          placements[STAR_ORDINAL.WenQu] = yinIndex(cycle(4 + hour) as Branch);
          for (let index = 0; index < STAR_COUNT; index++) {
            const palaceIndex = placements[index]!;
            masks[row * 12 + palaceIndex]! |= 1 << index;
            palaceIndices[placementOffset + index] = palaceIndex;
          }
        }
      }
    }
    return { masks, palaceIndices };
  })();
export function starMaskAtBranch(layoutRow: number, branch: Branch): number {
  return STAR_MASKS_BY_LAYOUT[layoutRow * 12 + yinIndex(branch)]!;
}
export function starLayoutRow(ziwei: Branch, month: number, hour: Branch): number {
  return (ziwei * 12 + month - 1) * 12 + hour;
}
export function starBranchAt(layoutRow: number, starIndex: number): Branch {
  return branchAtYinIndex(starPalaceIndexAt(layoutRow, starIndex));
}
export function starPalaceIndexAt(layoutRow: number, starIndex: number): number {
  return STAR_PALACE_INDICES_BY_LAYOUT[layoutRow * STAR_COUNT + starIndex]!;
}
