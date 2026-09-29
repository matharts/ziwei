import {
  Branch,
  PalaceName,
  cycle,
  yinIndex,
  type FiveElementBureau,
} from "../domain/identities.js";
import type { Decade, DecadeYear, PeriodIndices, PeriodPalace, Yearly } from "../domain/types.js";
import { PALACE_LABELS } from "./catalog.js";

const PERIOD_HANS = PalaceName.ALL.map((name) => PALACE_LABELS[name][2]);
const PERIOD_HANT = PalaceName.ALL.map((name) => PALACE_LABELS[name][3]);

function names(prefix: "大" | "流"): readonly PeriodPalace[] {
  return Object.freeze(
    PalaceName.ALL.map((name, index) =>
      Object.freeze({
        name,
        nameHans: prefix + PERIOD_HANS[index],
        nameHant: prefix + PERIOD_HANT[index],
      }),
    ),
  );
}

function layouts(values: readonly PeriodPalace[]): readonly (readonly PeriodPalace[])[] {
  return Object.freeze(
    Branch.ALL.map((ming) =>
      Object.freeze(Branch.ALL.map((actual) => values[cycle(ming - actual)]!)),
    ),
  );
}

const DECADE_LAYOUTS = layouts(names("大"));
const YEARLY_LAYOUTS = layouts(names("流"));
const PERIOD_INDICES_BY_OFFSET: readonly PeriodIndices[] = Object.freeze(
  Array.from({ length: 120 }, (_, offset) =>
    Object.freeze({ decade: Math.floor(offset / 10), yearly: offset % 10 }),
  ),
);
/** firstAge is below 128; an i32 birth year keeps this key exactly representable. */
const DECADE_YEARS_CACHE = new Map<number, readonly DecadeYear[]>();
const DECADE_YEARS_CACHE_LIMIT = 8192;
const NULL_BIRTH_YEAR_KEY = 2_147_483_648;

export const periodIndicesAtOffset = (offset: number): PeriodIndices =>
  PERIOD_INDICES_BY_OFFSET[offset]!;

export function decadeYearsAt(birthYear: number | null, firstAge: number): readonly DecadeYear[] {
  const key = (birthYear ?? NULL_BIRTH_YEAR_KEY) * 128 + firstAge;
  const shared = DECADE_YEARS_CACHE.get(key);
  if (shared !== undefined) return shared;
  const years = Array<DecadeYear>(10);
  for (let yearly = 0; yearly < 10; yearly++) {
    const age = firstAge + yearly;
    years[yearly] = Object.freeze({
      age,
      year: birthYear === null ? null : birthYear + age - 1,
    });
  }
  const result = Object.freeze(years);
  if (DECADE_YEARS_CACHE.size < DECADE_YEARS_CACHE_LIMIT) DECADE_YEARS_CACHE.set(key, result);
  return result;
}

export function decadeMing(mingBranch: Branch, direction: 1 | -1, index: number): number {
  const yin = yinIndex(mingBranch);
  const position = yin + direction * index;
  return position < 0 ? position + 12 : position >= 12 ? position - 12 : position;
}

export function yearlyMing(
  birthBranch: Branch,
  bureau: FiveElementBureau,
  decade: number,
  yearly: number,
): number {
  // yinIndex(cycle(x)) = cycle(x - 2); adding 12 keeps the validated range nonnegative.
  return (birthBranch + bureau + 10 * decade + yearly + 9) % 12;
}

export const decadeLayout = (ming: number): readonly Decade[] => DECADE_LAYOUTS[ming]!;
export const yearlyLayout = (ming: number): readonly Yearly[] => YEARLY_LAYOUTS[ming]!;
export const decadeAtBranch = (ming: number, actualBranch: Branch): Decade =>
  DECADE_LAYOUTS[ming]![yinIndex(actualBranch)]!;
export const yearlyAtBranch = (ming: number, actualBranch: Branch): Yearly =>
  YEARLY_LAYOUTS[ming]![yinIndex(actualBranch)]!;

export function palaceIndexAtName(ming: number, ordinal: number): number {
  const index = ming - ordinal;
  return index < 0 ? index + 12 : index;
}
