import { Branch, Stem, type FiveElementBureau } from "./identities.js";

const FIVE_TIGER_START = [2, 4, 6, 8, 0] as const;
const BUREAU: readonly (readonly FiveElementBureau[])[] = [
  [4, 2, 6, 4, 2, 6],
  [2, 6, 5, 2, 6, 5],
  [6, 5, 3, 6, 5, 3],
  [5, 3, 4, 5, 3, 4],
  [3, 4, 2, 3, 4, 2],
];
const PALACE_STEMS_BY_YEAR: readonly (readonly Stem[])[] = Object.freeze(
  Stem.ALL.map((yearStem) => {
    const initial = FIVE_TIGER_START[yearStem % 5]!;
    return Object.freeze(
      Array.from({ length: 12 }, (_, index) => ((initial + index) % 10) as Stem),
    );
  }),
);

export function bureauAt(stem: Stem, branch: Branch): FiveElementBureau {
  return BUREAU[Math.floor(stem / 2)]![Math.floor(branch / 2)]!;
}

export function palaceStems(yearStem: Stem): readonly Stem[] {
  return PALACE_STEMS_BY_YEAR[yearStem]!;
}
