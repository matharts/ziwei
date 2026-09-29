import { StarName, Stem, Transformation } from "../domain/identities.js";
import { palaceStems } from "../domain/sexagenary.js";
import type { SelfTransformations, Star } from "../domain/types.js";
import { STAR_DEFINITIONS, TRANSFORMATION_STAR_INDICES } from "./catalog.js";
import {
  STAR_MASKS_BY_LAYOUT,
  STAR_PALACE_INDICES_BY_LAYOUT,
  STAR_LAYOUT_ROWS,
  starPalaceIndexAt,
} from "./layout.js";

const TRANSFORMATION_VALUES: readonly (Transformation | null)[] = [null, ...Transformation.ALL];
const TRANSFORMATION_OPTIONS = TRANSFORMATION_VALUES.length;
const SELF_COMBINATIONS = TRANSFORMATION_OPTIONS * TRANSFORMATION_OPTIONS;
const STAR_CACHE_STRIDE = TRANSFORMATION_OPTIONS * SELF_COMBINATIONS;
const SELF_TRANSFORMATIONS: readonly SelfTransformations[] = Object.freeze(
  Array.from({ length: SELF_COMBINATIONS }, (_, key) =>
    Object.freeze({
      inward: TRANSFORMATION_VALUES[Math.floor(key / TRANSFORMATION_OPTIONS)] ?? null,
      outward: TRANSFORMATION_VALUES[key % TRANSFORMATION_OPTIONS] ?? null,
    }),
  ),
);
const STAR_COUNT = StarName.ALL.length;
const STAR_CACHE: (Star | undefined)[] = Array(STAR_COUNT * STAR_CACHE_STRIDE);
const SINGLE_STAR_ARRAYS: (readonly Star[] | undefined)[] = Array(STAR_CACHE.length);
const MULTI_STAR_ARRAYS = new Map<number, readonly Star[]>();
export const EMPTY_STARS: readonly Star[] = Object.freeze([]);
/** Bounded index table: 10 year stems × 12 palace positions × 18 stars. */
const { indicesByStem: STAR_CACHE_INDICES, activeMasksByStem: SELF_ACTIVE_MASKS } = (() => {
  const transformationKinds = TRANSFORMATION_STAR_INDICES.map((row) => {
    const kinds = Array<number>(STAR_COUNT).fill(0);
    for (let index = 0; index < row.length; index++) kinds[row[index]!] = index + 1;
    return kinds;
  });
  const indicesByStem: Uint16Array[] = Array(Stem.ALL.length);
  const activeMasksByStem: Uint32Array[] = Array(Stem.ALL.length);
  for (const yearStem of Stem.ALL) {
    const stems = palaceStems(yearStem);
    const birthKinds = transformationKinds[yearStem]!;
    const indices = new Uint16Array(12 * STAR_COUNT);
    const activeMasks = new Uint32Array(12);
    for (let palaceIndex = 0; palaceIndex < 12; palaceIndex++) {
      const outward = transformationKinds[stems[palaceIndex]!]!;
      const inward = transformationKinds[stems[(palaceIndex + 6) % 12]!]!;
      let activeMask = 0;
      for (let starIndex = 0; starIndex < STAR_COUNT; starIndex++) {
        const selfIndex = inward[starIndex]! * TRANSFORMATION_OPTIONS + outward[starIndex]!;
        if (selfIndex !== 0) activeMask |= 1 << starIndex;
        const birthIndex = birthKinds[starIndex]!;
        const cacheIndex =
          starIndex * STAR_CACHE_STRIDE + birthIndex * SELF_COMBINATIONS + selfIndex;
        indices[palaceIndex * STAR_COUNT + starIndex] = cacheIndex;
        if (STAR_CACHE[cacheIndex] === undefined) {
          const name = StarName.ALL[starIndex]!;
          const [nameHans, nameHant, abbrHans, abbrHant, category, galaxy] = STAR_DEFINITIONS[name];
          STAR_CACHE[cacheIndex] = Object.freeze({
            name,
            nameHans,
            nameHant,
            abbrHans,
            abbrHant,
            category,
            galaxy,
            birthTransformation: TRANSFORMATION_VALUES[birthIndex]!,
            selfTransformations: SELF_TRANSFORMATIONS[selfIndex]!,
          });
        }
      }
      activeMasks[palaceIndex] = activeMask;
    }
    indicesByStem[yearStem] = indices;
    activeMasksByStem[yearStem] = activeMasks;
  }
  return { indicesByStem, activeMasksByStem };
})();

const GROUPED_STARS_CACHE: (readonly (readonly Star[] | undefined)[] | undefined)[] = Array(
  Stem.ALL.length * STAR_LAYOUT_ROWS,
);
/** Promote a combination to a twelve-palace cache only after repeat use. */
const GROUPED_STARS_SEEN = new Uint8Array(GROUPED_STARS_CACHE.length);
export function starAtOrdinal(yearStem: Stem, layoutRow: number, ordinal: number): Star {
  const palaceIndex = starPalaceIndexAt(layoutRow, ordinal);
  const cacheIndex = STAR_CACHE_INDICES[yearStem]![palaceIndex * STAR_COUNT + ordinal]!;
  return STAR_CACHE[cacheIndex]!;
}
export function starAtPalaceOrdinal(yearStem: Stem, palaceIndex: number, ordinal: number): Star {
  return STAR_CACHE[STAR_CACHE_INDICES[yearStem]![palaceIndex * STAR_COUNT + ordinal]!]!;
}
export function selfMaskAt(yearStem: Stem, layoutRow: number, palaceIndex: number): number {
  return (
    STAR_MASKS_BY_LAYOUT[layoutRow * 12 + palaceIndex]! & SELF_ACTIVE_MASKS[yearStem]![palaceIndex]!
  );
}
export function starValues(yearStem: Stem, layoutRow: number): readonly Star[] {
  const values = Array<Star>(STAR_COUNT);
  const indices = STAR_CACHE_INDICES[yearStem]!;
  const branchBase = layoutRow * STAR_COUNT;
  for (let ordinal = 0; ordinal < STAR_COUNT; ordinal++) {
    const palaceIndex = STAR_PALACE_INDICES_BY_LAYOUT[branchBase + ordinal]!;
    values[ordinal] = STAR_CACHE[indices[palaceIndex * STAR_COUNT + ordinal]!]!;
  }
  return values;
}
/** Star bits are ordered by their ordinal in StarName.ALL. */
function firstStarOrdinal(mask: number): number {
  return 31 - Math.clz32(mask & -mask);
}
/** The single-palace and full-snapshot paths share one group materialization rule. */
function starsAtGroup(
  yearStem: Stem,
  row: number,
  palaceIndex: number,
  cacheIndices: Uint16Array,
): readonly Star[] {
  const mask = STAR_MASKS_BY_LAYOUT[row * 12 + palaceIndex]!;
  if (mask === 0) return EMPTY_STARS;
  const cacheBase = palaceIndex * STAR_COUNT;
  if ((mask & (mask - 1)) === 0) {
    const starIndex = firstStarOrdinal(mask);
    const cacheIndex = cacheIndices[cacheBase + starIndex]!;
    return (SINGLE_STAR_ARRAYS[cacheIndex] ??= Object.freeze([STAR_CACHE[cacheIndex]!]));
  }
  const groupKey = ((yearStem * 12 + palaceIndex) << STAR_COUNT) | mask;
  const shared = MULTI_STAR_ARRAYS.get(groupKey);
  if (shared !== undefined) return shared;
  const stars: Star[] = [];
  for (let remaining = mask; remaining !== 0; remaining &= remaining - 1) {
    const starIndex = firstStarOrdinal(remaining);
    stars.push(STAR_CACHE[cacheIndices[cacheBase + starIndex]!]!);
  }
  const frozen = Object.freeze(stars);
  MULTI_STAR_ARRAYS.set(groupKey, frozen);
  return frozen;
}
export function groupedStars(
  yearStem: Stem,
  row: number,
): readonly (readonly Star[] | undefined)[] {
  const cacheKey = yearStem * STAR_LAYOUT_ROWS + row;
  const cached = GROUPED_STARS_CACHE[cacheKey];
  if (cached !== undefined) return cached;
  const result = Array<readonly Star[] | undefined>(12);
  const cacheIndices = STAR_CACHE_INDICES[yearStem]!;
  for (let palaceIndex = 0; palaceIndex < 12; palaceIndex++) {
    const stars = starsAtGroup(yearStem, row, palaceIndex, cacheIndices);
    if (stars !== EMPTY_STARS) result[palaceIndex] = stars;
  }
  if (GROUPED_STARS_SEEN[cacheKey]) GROUPED_STARS_CACHE[cacheKey] = result;
  else GROUPED_STARS_SEEN[cacheKey] = 1;
  return result;
}
export function starsAtPalace(yearStem: Stem, row: number, palaceIndex: number): readonly Star[] {
  const cacheKey = yearStem * STAR_LAYOUT_ROWS + row;
  const cached = GROUPED_STARS_CACHE[cacheKey];
  if (cached !== undefined) return cached[palaceIndex] ?? EMPTY_STARS;
  if (GROUPED_STARS_SEEN[cacheKey]) return groupedStars(yearStem, row)[palaceIndex] ?? EMPTY_STARS;
  GROUPED_STARS_SEEN[cacheKey] = 1;
  return starsAtGroup(yearStem, row, palaceIndex, STAR_CACHE_INDICES[yearStem]!);
}
