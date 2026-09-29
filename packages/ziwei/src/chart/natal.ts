import { integer } from "../domain/constraints.js";
import { ZiweiError } from "../domain/errors.js";
import {
  Branch,
  PalaceName,
  StarName,
  Transformation,
  yinIndex,
  type Zodiac,
  type FiveElementBureau,
} from "../domain/identities.js";
import { checkedStarOrdinal } from "../domain/identity-queries.js";
import { validateBirth, validateParameters } from "../domain/inputs.js";
import {
  type Birth,
  type Parameters,
  type Profile,
  type Palace,
  type Star,
  type LocatedStar,
  type PalaceTransformation,
  type PeriodIndices,
  type Decade,
  type Yearly,
  type DecadeYear,
} from "../domain/types.js";
import {
  branch,
  decadeIndex,
  palaceNameOrdinal,
  transformationOrdinal,
  yearlyIndex,
} from "../domain/validation.js";
import {
  decadeAtBranch,
  decadeLayout,
  decadeMing,
  decadeYearsAt,
  palaceIndexAtName,
  periodIndicesAtOffset,
  yearlyAtBranch,
  yearlyLayout,
  yearlyMing,
} from "../palaces/periods.js";
import { materializePalace, materializePalaces } from "../palaces/values.js";
import { starMaskAtBranch, starPalaceIndexAt } from "../stars/layout.js";
import {
  birthTransformationOrdinals,
  palaceTransformation,
  palaceTransformations,
  palaceTransformationSources,
  selfTransformations,
} from "../stars/transformations.js";
import { starAtPalaceOrdinal, starAtOrdinal, starValues } from "../stars/values.js";
import { birthFacts, parameterFacts, type NatalFacts } from "./facts.js";

/** An immutable natal chart. Period layouts are calculated on demand. */
export class NatalHandle {
  readonly #facts: NatalFacts;
  #palaces: readonly Palace[] | undefined;
  #partialPalaces: (Palace | undefined)[] | undefined;
  #starQueries = 0;
  #starsByName: readonly Star[] | undefined;
  #birthTransformationsCache: readonly LocatedStar[] | undefined;
  #selfQueryCount = 0;
  /** Alternating palace and star references; populated after the second query. */
  #selfReferences: readonly (Palace | Star)[] | undefined;
  #decadeYearsCache: (readonly DecadeYear[] | undefined)[] | undefined;
  /** @internal Use Ziwei to construct a chart. */
  constructor(facts: NatalFacts) {
    this.#facts = facts;
    Object.freeze(this);
  }
  get profile(): Profile {
    return this.#facts.profile;
  }
  get zodiac(): Zodiac {
    return this.#facts.zodiac;
  }
  get fiveElementBureau(): FiveElementBureau {
    return this.#facts.fiveElementBureau;
  }
  get palaces(): readonly Palace[] {
    const cached = this.#palaces;
    if (cached !== undefined) return cached;
    const palaces = materializePalaces(this.#facts, this.#partialPalaces);
    this.#palaces = palaces;
    this.#partialPalaces = undefined;
    return palaces;
  }
  #palaceAt(index: number): Palace {
    const palaces = this.#palaces;
    if (palaces !== undefined) return palaces[index]!;
    const partial = (this.#partialPalaces ??= Array<Palace | undefined>(12));
    return (partial[index] ??= materializePalace(this.#facts, index));
  }
  palace(actualBranch: Branch): Palace {
    const selected = branch(actualBranch);
    return this.#palaceAt(yinIndex(selected));
  }
  oppositePalace(actualBranch: Branch): Palace {
    const selected = branch(actualBranch);
    return this.#palaceAt(selected < 8 ? selected + 4 : selected - 8);
  }
  sanfangPalaces(actualBranch: Branch, includeSelf: boolean): readonly Palace[] {
    const selected = branch(actualBranch);
    const index = yinIndex(selected);
    if (typeof includeSelf !== "boolean")
      throw new ZiweiError("INVALID_ARGUMENT", "无效参数：includeSelf", {
        field: "includeSelf",
        value: includeSelf,
      });
    const fourth = index + 4;
    const eighth = index + 8;
    const sixth = index + 6;
    const oppositeIndex = fourth < 12 ? fourth : fourth - 12;
    const trineIndex = eighth < 12 ? eighth : eighth - 12;
    const adjacentIndex = sixth < 12 ? sixth : sixth - 12;
    const opposite = this.#palaceAt(oppositeIndex);
    const trine = this.#palaceAt(trineIndex);
    const adjacent = this.#palaceAt(adjacentIndex);
    return Object.freeze(
      includeSelf
        ? [this.#palaceAt(index), opposite, trine, adjacent]
        : [opposite, trine, adjacent],
    );
  }
  sizhengPalaces(actualBranch: Branch): readonly Palace[] {
    return this.sanfangPalaces(actualBranch, true);
  }
  palaceByName(name: PalaceName): Palace {
    return this.#palaceAt(
      palaceIndexAtName(yinIndex(this.#facts.mingBranch), palaceNameOrdinal(name)),
    );
  }
  mingPalace(): Palace {
    return this.palace(this.#facts.mingBranch);
  }
  shenPalace(): Palace {
    return this.palace(this.#facts.shenBranch);
  }
  originPalace(): Palace {
    return this.palace(this.#facts.originBranch);
  }
  ziweiPalace(): Palace {
    return this.palace(this.#facts.ziweiBranch);
  }
  palaceByStar(name: StarName): Palace {
    const ordinal = checkedStarOrdinal(name);
    return this.#palaceAt(starPalaceIndexAt(this.#facts.starLayoutRow, ordinal));
  }
  star(name: StarName): Star {
    const ordinal = checkedStarOrdinal(name);
    const indexed = this.#starsByName;
    if (indexed !== undefined) return indexed[ordinal]!;
    // Sparse queries read the shared star cache directly; repeated queries build a local index.
    if (++this.#starQueries < 32) {
      return starAtOrdinal(this.#facts.profile.birthStem, this.#facts.starLayoutRow, ordinal);
    }
    const values = starValues(this.#facts.profile.birthStem, this.#facts.starLayoutRow);
    this.#starsByName = values;
    return values[ordinal]!;
  }
  birthTransformations(): readonly LocatedStar[] {
    const cached = this.#birthTransformationsCache;
    if (cached !== undefined) return cached;
    const facts = this.#facts;
    const ordinals = birthTransformationOrdinals(facts.profile.birthStem);
    const row = facts.starLayoutRow;
    const indexed = this.#starsByName;
    const located = Array<LocatedStar>(4);
    for (let index = 0; index < 4; index++) {
      const ordinal = ordinals[index]!;
      const palaceIndex = starPalaceIndexAt(row, ordinal);
      located[index] = Object.freeze({
        palace: this.#palaceAt(palaceIndex),
        star:
          indexed === undefined
            ? starAtPalaceOrdinal(facts.profile.birthStem, palaceIndex, ordinal)
            : indexed[ordinal]!,
      });
    }
    return (this.#birthTransformationsCache = Object.freeze(located));
  }
  selfTransformations(): readonly LocatedStar[] {
    const cached = this.#selfReferences;
    if (cached === undefined) {
      const located = selfTransformations(
        this.#facts.profile.birthStem,
        this.#facts.starLayoutRow,
        (index) => this.#palaceAt(index),
      );
      if (++this.#selfQueryCount === 2) {
        const references = Array<Palace | Star>(located.length * 2);
        for (let index = 0; index < located.length; index++) {
          references[index * 2] = located[index]!.palace;
          references[index * 2 + 1] = located[index]!.star;
        }
        this.#selfReferences = references;
      }
      return located;
    }
    const located = Array<LocatedStar>(cached.length / 2);
    for (let index = 0; index < cached.length; index += 2) {
      located[index / 2] = Object.freeze({
        palace: cached[index] as Palace,
        star: cached[index + 1] as Star,
      });
    }
    return Object.freeze(located);
  }
  palaceTransformation(sourceBranch: Branch, kind: Transformation): PalaceTransformation {
    const source = branch(sourceBranch, "sourceBranch");
    const selected = transformationOrdinal(kind);
    const facts = this.#facts;
    return palaceTransformation(
      source,
      facts.pendingStems[yinIndex(source)]!,
      selected,
      facts.starLayoutRow,
    );
  }
  palaceTransformations(sourceBranch: Branch): readonly PalaceTransformation[] {
    const source = branch(sourceBranch, "sourceBranch");
    const facts = this.#facts;
    return palaceTransformations(
      source,
      facts.pendingStems[yinIndex(source)]!,
      facts.starLayoutRow,
    );
  }
  palaceTransformationSources(targetBranch: Branch): readonly PalaceTransformation[] {
    const target = branch(targetBranch, "targetBranch");
    const targetMask = starMaskAtBranch(this.#facts.starLayoutRow, target);
    return palaceTransformationSources(this.#facts.profile.birthStem, target, targetMask);
  }
  periodIndicesAtAge(age: number): PeriodIndices | null {
    const value = integer(age, "age", 0, 255) - this.fiveElementBureau;
    return value < 0 || value >= 120 ? null : periodIndicesAtOffset(value);
  }
  decade(index: number): readonly Decade[] {
    return decadeLayout(
      decadeMing(this.#facts.mingBranch, this.#facts.decadeDirection, decadeIndex(index)),
    );
  }
  decadeByBranch(decade: number, actualBranch: Branch): Decade {
    const ming = decadeMing(
      this.#facts.mingBranch,
      this.#facts.decadeDirection,
      decadeIndex(decade),
    );
    return decadeAtBranch(ming, branch(actualBranch));
  }
  decadePalaceByName(decade: number, name: PalaceName): Palace {
    const ming = decadeMing(
      this.#facts.mingBranch,
      this.#facts.decadeDirection,
      decadeIndex(decade),
    );
    return this.#palaceAt(palaceIndexAtName(ming, palaceNameOrdinal(name)));
  }
  decadeYears(decade: number): readonly DecadeYear[] {
    const index = decadeIndex(decade);
    const cached = this.#decadeYearsCache?.[index];
    if (cached !== undefined) return cached;
    const birthYear = this.profile.birthYear;
    const firstAge = this.fiveElementBureau + 10 * index;
    const result = decadeYearsAt(birthYear, firstAge);
    (this.#decadeYearsCache ??= Array(12))[index] = result;
    return result;
  }
  yearly(decade: number, index: number): readonly Yearly[] {
    return yearlyLayout(
      yearlyMing(
        this.profile.birthBranch,
        this.fiveElementBureau,
        decadeIndex(decade),
        yearlyIndex(index),
      ),
    );
  }
  yearlyByBranch(decade: number, index: number, actualBranch: Branch): Yearly {
    const ming = yearlyMing(
      this.profile.birthBranch,
      this.fiveElementBureau,
      decadeIndex(decade),
      yearlyIndex(index),
    );
    return yearlyAtBranch(ming, branch(actualBranch));
  }
  yearlyPalaceByName(decade: number, index: number, name: PalaceName): Palace {
    const ming = yearlyMing(
      this.profile.birthBranch,
      this.fiveElementBureau,
      decadeIndex(decade),
      yearlyIndex(index),
    );
    return this.#palaceAt(palaceIndexAtName(ming, palaceNameOrdinal(name)));
  }
}

export const Ziwei = Object.freeze({
  fromBirth(birth: Birth): NatalHandle {
    return new NatalHandle(birthFacts(validateBirth(birth)));
  },
  fromParameters(parameters: Parameters): NatalHandle {
    return new NatalHandle(parameterFacts(validateParameters(parameters)));
  },
});
export type Natal = NatalHandle;
