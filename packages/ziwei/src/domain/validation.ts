import { integer, invalid } from "./constraints.js";
import { ZiweiError } from "./errors.js";
import { Branch, PALACE_ORDINAL, PalaceName, Transformation } from "./identities.js";
import type { DecadeIndex, YearlyIndex } from "./types.js";
export function branch(value: unknown, field = "branch"): Branch {
  return integer(value, field, 0, 11) as Branch;
}
export function palaceNameOrdinal(value: unknown): number {
  if (typeof value !== "string") invalid("name", value);
  const index = PALACE_ORDINAL[value as PalaceName];
  if (typeof index !== "number") invalid("name", value);
  return index;
}
export function transformationOrdinal(value: unknown): 0 | 1 | 2 | 3 {
  switch (value) {
    case Transformation.A:
      return 0;
    case Transformation.B:
      return 1;
    case Transformation.C:
      return 2;
    case Transformation.D:
      return 3;
    default:
      invalid("kind", value);
  }
}
export function decadeIndex(value: unknown): DecadeIndex {
  const index = integer(value, "decade", 0, 255);
  if (index > 11)
    throw new ZiweiError("INVALID_DECADE_INDEX", `无效大限序号：${index}`, { value: index });
  return index;
}
export function yearlyIndex(value: unknown): YearlyIndex {
  const index = integer(value, "yearly", 0, 255);
  if (index > 9)
    throw new ZiweiError("INVALID_YEARLY_INDEX", `无效流年序号：${index}`, { value: index });
  return index;
}
