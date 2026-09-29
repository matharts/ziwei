import {
  Branch,
  PalaceName,
  StarName,
  Stem,
  branchAtYinIndex,
  yinIndex,
  type FiveElementBureau,
} from "../domain/identities.js";
import { starName } from "../domain/identity-queries.js";
import type { DecadeAgeRange, Palace, Star } from "../domain/types.js";
import { EMPTY_STARS, groupedStars, starsAtPalace } from "../stars/values.js";
import { PALACE_LABELS } from "./catalog.js";

interface PalaceFacts {
  readonly profile: { readonly birthStem: Stem };
  readonly starLayoutRow: number;
  readonly mingBranch: Branch;
  readonly pendingStems: readonly Stem[];
  readonly fiveElementBureau: FiveElementBureau;
  readonly decadeDirection: 1 | -1;
}

const PALACE_HANS = PalaceName.ALL.map((name) => PALACE_LABELS[name][0]);
const PALACE_HANT = PalaceName.ALL.map((name) => PALACE_LABELS[name][1]);
const AGE_RANGES: readonly DecadeAgeRange[] = Object.freeze(
  Array.from({ length: 120 }, (_, start) => Object.freeze([start, start + 9] as const)),
);
function palaceStar(this: Palace, name: StarName): Star | null {
  const identity = starName(name);
  const stars = this.stars;
  for (let index = 0; index < stars.length; index++) {
    const star = stars[index]!;
    if (star.name === identity) return star;
  }
  return null;
}
function palaceAtIndex(
  facts: PalaceFacts,
  mingIndex: number,
  index: number,
  stars: readonly Star[],
): Palace {
  const nameIndex = mingIndex >= index ? mingIndex - index : mingIndex - index + 12;
  const position =
    facts.decadeDirection === 1
      ? index >= mingIndex
        ? index - mingIndex
        : index - mingIndex + 12
      : nameIndex;
  return Object.freeze({
    name: PalaceName.ALL[nameIndex]!,
    nameHans: PALACE_HANS[nameIndex]!,
    nameHant: PALACE_HANT[nameIndex]!,
    branch: branchAtYinIndex(index),
    stem: facts.pendingStems[index]!,
    stars,
    decadeAgeRange: AGE_RANGES[facts.fiveElementBureau + 10 * position]!,
    star: palaceStar,
  });
}
export function materializePalace(facts: PalaceFacts, index: number): Palace {
  const stars = starsAtPalace(facts.profile.birthStem, facts.starLayoutRow, index);
  return palaceAtIndex(facts, yinIndex(facts.mingBranch), index, stars);
}
/** Complete the public snapshot while retaining palaces already returned by single queries. */
export function materializePalaces(
  facts: PalaceFacts,
  existing?: readonly (Palace | undefined)[],
): readonly Palace[] {
  const starsByPalace = groupedStars(facts.profile.birthStem, facts.starLayoutRow);
  const mingIndex = yinIndex(facts.mingBranch);
  const result = Array<Palace>(12);
  for (let index = 0; index < 12; index++) {
    const retained = existing?.[index];
    if (retained !== undefined) {
      result[index] = retained;
      continue;
    }
    result[index] = palaceAtIndex(facts, mingIndex, index, starsByPalace[index] ?? EMPTY_STARS);
  }
  return Object.freeze(result);
}
