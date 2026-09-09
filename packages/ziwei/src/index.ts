import * as native from "../native/binding.cjs";
import { capture } from "./input.js";
import { natal } from "./natal.js";
import type { Birth, Parameters, Natal } from "./types.js";

export { Gender, Stem, Branch, Zodiac, FiveElementBureau } from "./types.js";
export { YinYang, FiveElement } from "./types.js";
export { PalaceName, StarName, StarCategory, StarGalaxy, Transformation } from "./types.js";
export type { Palace, Star, SelfTransformations, DecadeAgeRange } from "./types.js";
export type { LocatedStar, PalaceTransformation } from "./types.js";
export type {
  Decade,
  Yearly,
  DecadeYear,
  PeriodIndices,
  DecadeIndex,
  YearlyIndex,
} from "./types.js";
export type { NatalSnapshot } from "./types.js";
export type { Birth, Parameters, Profile, Natal, BirthMonth, BirthDay } from "./types.js";
export { ZiweiError } from "./error.js";
export type {
  ArgumentFailureReason,
  ReceivedValue,
  ZiweiErrorCode,
  ZiweiErrorDetail,
} from "./error.js";

const birthFields = ["gender", "birthYear", "birthMonth", "birthDay", "birthHour"];
const parameterFields = [
  "gender",
  "birthStem",
  "birthBranch",
  "birthMonth",
  "ziweiBranch",
  "birthHour",
];

/** Frozen, receiver-independent entry points. No constructor or implicit async work. */
export const Ziwei = Object.freeze({
  fromBirth(birth: Birth): Natal {
    const [gender, year, month, day, hour] = capture(birth, birthFields, arguments.length === 0);
    return natal(native.fromBirth(gender, year, month, day, hour));
  },
  fromParameters(parameters: Parameters): Natal {
    const [gender, stem, branch, month, ziweiBranch, hour] = capture(
      parameters,
      parameterFields,
      arguments.length === 0,
    );
    return natal(native.fromParameters(gender, stem, branch, month, ziweiBranch, hour));
  },
});
