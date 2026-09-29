import type {
  Branch,
  Gender,
  PalaceName,
  StarName,
  Stem,
  Transformation,
  StarCategory,
  StarGalaxy,
} from "./identities.js";

export type BirthMonth = number;
export type BirthDay = number;
export type DecadeIndex = number;
export type YearlyIndex = number;
export interface Birth {
  readonly gender: Gender;
  readonly birthYear: number;
  readonly birthMonth: BirthMonth;
  readonly birthDay: BirthDay;
  readonly birthHour: Branch;
}
export interface Parameters {
  readonly gender: Gender;
  readonly birthStem: Stem;
  readonly birthBranch: Branch;
  readonly birthMonth: BirthMonth;
  readonly ziweiBranch: Branch;
  readonly birthHour: Branch;
}
interface ProfileBase {
  readonly gender: Gender;
  readonly birthStem: Stem;
  readonly birthBranch: Branch;
  readonly birthMonth: BirthMonth;
  readonly birthHour: Branch;
}
export type Profile = ProfileBase &
  (
    | { readonly birthYear: number; readonly birthDay: BirthDay }
    | { readonly birthYear: null; readonly birthDay: null }
  );
export interface SelfTransformations {
  readonly inward: Transformation | null;
  readonly outward: Transformation | null;
}
export type DecadeAgeRange = readonly [start: number, end: number];

export interface Star {
  readonly name: StarName;
  readonly nameHans: string;
  readonly nameHant: string;
  readonly abbrHans: string;
  readonly abbrHant: string;
  readonly category: StarCategory;
  readonly galaxy: StarGalaxy;
  readonly birthTransformation: Transformation | null;
  readonly selfTransformations: SelfTransformations;
}

export interface Palace {
  readonly name: PalaceName;
  readonly nameHans: string;
  readonly nameHant: string;
  readonly branch: Branch;
  readonly stem: Stem;
  readonly stars: readonly Star[];
  readonly decadeAgeRange: DecadeAgeRange;
  star(name: StarName): Star | null;
}

export interface LocatedStar {
  readonly palace: Palace;
  readonly star: Star;
}
export interface PalaceTransformation {
  readonly sourceBranch: Branch;
  readonly targetBranch: Branch;
  readonly transformation: Transformation;
  readonly star: StarName;
}
export interface PeriodPalace {
  readonly name: PalaceName;
  readonly nameHans: string;
  readonly nameHant: string;
}
export interface Decade extends PeriodPalace {}
export interface Yearly extends PeriodPalace {}
export interface DecadeYear {
  readonly age: number;
  readonly year: number | null;
}
export interface PeriodIndices {
  readonly decade: DecadeIndex;
  readonly yearly: YearlyIndex;
}
