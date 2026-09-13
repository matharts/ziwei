import type {
  Gender,
  Branch,
  Stem,
  PalaceName,
  StarName,
  StarCategory,
  StarGalaxy,
  Transformation,
} from "./identity-types.js";

export type BirthMonth = number;
export type BirthDay = number;

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

/** 两端均包含的虚岁区间。 */
export type DecadeAgeRange = readonly [start: number, end: number];

export interface Palace {
  readonly name: PalaceName;
  readonly nameHans: string;
  readonly nameHant: string;
  readonly branch: Branch;
  readonly stem: Stem;
  readonly stars: readonly Star[];
  readonly decadeAgeRange: DecadeAgeRange;
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

// Private transport shapes. Each generated binding must structurally satisfy these tuples.
type StarTuple = readonly [
  name: StarName,
  nameHans: string,
  nameHant: string,
  abbrHans: string,
  abbrHant: string,
  category: StarCategory,
  galaxy: StarGalaxy,
  birthTransformation: Transformation | null,
  inward: Transformation | null,
  outward: Transformation | null,
];

type PalaceTuple = readonly [
  name: PalaceName,
  nameHans: string,
  nameHant: string,
  branch: Branch,
  stem: Stem,
  stars: readonly StarTuple[],
  decadeAgeRange: DecadeAgeRange,
];

/** Normalize Node's omitted fields and Wasm's nulls without owning a handle or cache. */
export function projectProfile(
  raw: ProfileBase & {
    readonly birthYear?: number | null | undefined;
    readonly birthDay?: BirthDay | null | undefined;
  },
): Profile {
  const base = {
    gender: raw.gender,
    birthStem: raw.birthStem,
    birthBranch: raw.birthBranch,
    birthMonth: raw.birthMonth,
    birthHour: raw.birthHour,
  };
  // The union is established by runtime checks, not asserted into existence.
  if (raw.birthYear == null && raw.birthDay == null) {
    return Object.freeze({ ...base, birthYear: null, birthDay: null });
  } else if (raw.birthYear != null && raw.birthDay != null) {
    return Object.freeze({
      ...base,
      birthYear: raw.birthYear,
      birthDay: raw.birthDay,
    });
  } else {
    throw new Error("原生出生档案的年份与日期状态不一致");
  }
}

/** Decode a binding-owned tuple once; only named, frozen data escapes. */
export function projectStar(raw: StarTuple): Star {
  const [
    name,
    nameHans,
    nameHant,
    abbrHans,
    abbrHant,
    category,
    galaxy,
    birthTransformation,
    inward,
    outward,
  ] = raw;
  return Object.freeze({
    name,
    nameHans,
    nameHant,
    abbrHans,
    abbrHant,
    category,
    galaxy,
    birthTransformation,
    selfTransformations: Object.freeze({ inward, outward }),
  });
}

/** Accept detached binding output; its age array is retained and frozen in place. */
export function projectPalace(raw: PalaceTuple): Palace {
  const [name, nameHans, nameHant, branch, stem, stars, decadeAgeRange] = raw;
  return Object.freeze({
    name,
    nameHans,
    nameHant,
    branch,
    stem,
    stars: Object.freeze(stars.map(projectStar)),
    decadeAgeRange: Object.freeze(decadeAgeRange),
  });
}

export function projectLocatedStar(raw: {
  readonly palace: PalaceTuple;
  readonly star: StarTuple;
}): LocatedStar {
  return Object.freeze({ palace: projectPalace(raw.palace), star: projectStar(raw.star) });
}

export function projectPalaceTransformation(raw: PalaceTransformation): PalaceTransformation {
  return Object.freeze({
    sourceBranch: raw.sourceBranch,
    targetBranch: raw.targetBranch,
    transformation: raw.transformation,
    star: raw.star,
  });
}
