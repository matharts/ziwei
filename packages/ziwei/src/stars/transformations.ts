import { Branch, StarName, Stem, Transformation, branchAtYinIndex } from "../domain/identities.js";
import { palaceStems } from "../domain/sexagenary.js";
import type { LocatedStar, Palace, PalaceTransformation } from "../domain/types.js";
import { TRANSFORMATION_STARS, TRANSFORMATION_STAR_INDICES } from "./catalog.js";
import { STAR_LAYOUT_ROWS, starBranchAt } from "./layout.js";
import { selfMaskAt, starAtPalaceOrdinal } from "./values.js";

const TRANSFORMATION_STAR_BITS: readonly (readonly number[])[] = TRANSFORMATION_STAR_INDICES.map(
  (row) => row.map((index) => 1 << index),
);
const TRANSFORMATION_ROW_MASKS: readonly number[] = TRANSFORMATION_STAR_BITS.map(
  (row) => row[0]! | row[1]! | row[2]! | row[3]!,
);
const SOURCE_BRANCHES: readonly Branch[] = Object.freeze(
  Branch.ALL.map((_, index) => branchAtYinIndex(index)),
);
/** Cached results serve as source templates; their targetBranch is replaced on each read. */
const SOURCE_RELATION_CACHE = new Map<number, readonly PalaceTransformation[]>();
const SOURCE_RELATION_CACHE_LIMIT = 4096;
const SOURCE_MASK_STRIDE = 1 << StarName.ALL.length;
const OUTGOING_RELATION_CACHE = new Map<number, readonly PalaceTransformation[]>();
const OUTGOING_RELATION_CACHE_LIMIT = 8192;
const SOURCE_STEM_BRANCH_COMBINATIONS = Stem.ALL.length * Branch.ALL.length;
const OUTGOING_RELATION_SEEN = new Uint8Array(STAR_LAYOUT_ROWS * SOURCE_STEM_BRANCH_COMBINATIONS);
const RELATION_UNSEEN = 0;
const RELATION_SEEN = 1;
const RELATION_CACHED = 2;

export function birthTransformationOrdinals(birthStem: Stem): readonly number[] {
  return TRANSFORMATION_STAR_INDICES[birthStem]!;
}

export function selfTransformations(
  yearStem: Stem,
  layoutRow: number,
  palaceAt: (index: number) => Palace,
): readonly LocatedStar[] {
  const located: LocatedStar[] = [];
  for (let palaceIndex = 0; palaceIndex < 12; palaceIndex++) {
    let mask = selfMaskAt(yearStem, layoutRow, palaceIndex);
    if (mask === 0) continue;
    const palace = palaceAt(palaceIndex);
    while (mask !== 0) {
      const bit = mask & -mask;
      const ordinal = 31 - Math.clz32(bit);
      located.push(
        Object.freeze({ palace, star: starAtPalaceOrdinal(yearStem, palaceIndex, ordinal) }),
      );
      mask ^= bit;
    }
  }
  return Object.freeze(located);
}

export function palaceTransformation(
  sourceBranch: Branch,
  sourceStem: Stem,
  kindIndex: 0 | 1 | 2 | 3,
  layoutRow: number,
): PalaceTransformation {
  const star = TRANSFORMATION_STARS[sourceStem]![kindIndex]!;
  return Object.freeze({
    sourceBranch,
    targetBranch: starBranchAt(layoutRow, TRANSFORMATION_STAR_INDICES[sourceStem]![kindIndex]!),
    transformation: Transformation.ALL[kindIndex]!,
    star,
  });
}

export function palaceTransformations(
  sourceBranch: Branch,
  sourceStem: Stem,
  layoutRow: number,
): readonly PalaceTransformation[] {
  const key =
    layoutRow * SOURCE_STEM_BRANCH_COMBINATIONS + sourceStem * Branch.ALL.length + sourceBranch;
  const state = OUTGOING_RELATION_SEEN[key];
  if (state === RELATION_CACHED) return OUTGOING_RELATION_CACHE.get(key)!;
  const stars = TRANSFORMATION_STARS[sourceStem]!;
  const indices = TRANSFORMATION_STAR_INDICES[sourceStem]!;
  const result = Object.freeze([
    Object.freeze({
      sourceBranch,
      targetBranch: starBranchAt(layoutRow, indices[0]!),
      transformation: Transformation.A,
      star: stars[0]!,
    }),
    Object.freeze({
      sourceBranch,
      targetBranch: starBranchAt(layoutRow, indices[1]!),
      transformation: Transformation.B,
      star: stars[1]!,
    }),
    Object.freeze({
      sourceBranch,
      targetBranch: starBranchAt(layoutRow, indices[2]!),
      transformation: Transformation.C,
      star: stars[2]!,
    }),
    Object.freeze({
      sourceBranch,
      targetBranch: starBranchAt(layoutRow, indices[3]!),
      transformation: Transformation.D,
      star: stars[3]!,
    }),
  ]);
  if (state === RELATION_SEEN && OUTGOING_RELATION_CACHE.size < OUTGOING_RELATION_CACHE_LIMIT) {
    OUTGOING_RELATION_CACHE.set(key, result);
    OUTGOING_RELATION_SEEN[key] = RELATION_CACHED;
  } else if (state === RELATION_UNSEEN) {
    OUTGOING_RELATION_SEEN[key] = RELATION_SEEN;
  }
  return result;
}

export function palaceTransformationSources(
  yearStem: Stem,
  targetBranch: Branch,
  targetMask: number,
): readonly PalaceTransformation[] {
  if (targetMask === 0) return Object.freeze([]);
  const key = yearStem * SOURCE_MASK_STRIDE + targetMask;
  const cached = SOURCE_RELATION_CACHE.get(key);
  if (cached !== undefined) {
    const sources = Array<PalaceTransformation>(cached.length);
    for (let index = 0; index < cached.length; index++) {
      const relation = cached[index]!;
      sources[index] = Object.freeze({
        sourceBranch: relation.sourceBranch,
        targetBranch,
        transformation: relation.transformation,
        star: relation.star,
      });
    }
    return Object.freeze(sources);
  }
  const sources: PalaceTransformation[] = [];
  const stems = palaceStems(yearStem);
  for (let sourceIndex = 0; sourceIndex < 12; sourceIndex++) {
    const stem = stems[sourceIndex]!;
    if ((targetMask & TRANSFORMATION_ROW_MASKS[stem]!) === 0) continue;
    const stars = TRANSFORMATION_STARS[stem]!;
    const bits = TRANSFORMATION_STAR_BITS[stem]!;
    for (let index = 0; index < stars.length; index++) {
      const star = stars[index]!;
      if ((targetMask & bits[index]!) !== 0) {
        sources.push(
          Object.freeze({
            sourceBranch: SOURCE_BRANCHES[sourceIndex]!,
            targetBranch,
            transformation: Transformation.ALL[index]!,
            star,
          }),
        );
      }
    }
  }
  const result = Object.freeze(sources);
  if (SOURCE_RELATION_CACHE.size < SOURCE_RELATION_CACHE_LIMIT)
    SOURCE_RELATION_CACHE.set(key, result);
  return result;
}
