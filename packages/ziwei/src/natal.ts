import type * as native from "../native/binding.cjs";
import { nativeError, unwrap } from "./error.js";
import { arity } from "./input.js";
import type {
  Branch,
  FiveElementBureau,
  LocatedStar,
  Natal,
  Palace,
  PalaceName,
  PalaceTransformation,
  Profile,
  Star,
  StarName,
  Transformation,
  Zodiac,
} from "./types.js";
import type {
  Decade,
  DecadeIndex,
  DecadeYear,
  NatalSnapshot,
  PeriodIndices,
  Yearly,
  YearlyIndex,
} from "./types.js";

class NatalHandle implements Natal {
  #native: native.NativeNatal;
  #profile: Profile | undefined;
  #palaces: readonly Palace[] | undefined;

  constructor(value: native.NativeNatal) {
    this.#native = value;
    Object.freeze(this);
  }

  // Private method access checks the receiver before classifying missing arguments.
  #arity(count: number, ...names: string[]): void {
    arity(count, ...names);
  }

  get zodiac(): Zodiac {
    return this.#native.zodiac;
  }

  toJSON(): NatalSnapshot {
    const locations = this.#native.snapshotLocations();
    return Object.freeze({
      profile: this.profile,
      zodiac: this.zodiac,
      fiveElementBureau: this.fiveElementBureau,
      palaces: this.palaces,
      mingPalaceBranch: locations.mingPalaceBranch,
      shenPalaceBranch: locations.shenPalaceBranch,
      originPalaceBranch: locations.originPalaceBranch,
      ziweiBranch: locations.ziweiBranch,
    });
  }

  palace(branch: Branch): Palace {
    this.#arity(arguments.length, "branch");
    return palace(unwrap(this.#native.palace(branch)));
  }

  periodIndicesAtAge(age: number): PeriodIndices | null {
    this.#arity(arguments.length, "age");
    const raw = unwrap(this.#native.periodIndicesAtAge(age));
    return raw == null ? null : Object.freeze({ decade: raw.decade, yearly: raw.yearly });
  }

  decade(index: DecadeIndex): readonly Decade[] {
    this.#arity(arguments.length, "index");
    return Object.freeze(unwrap(this.#native.decade(index)).map(periodPalace));
  }

  decadeByBranch(decade: DecadeIndex, branch: Branch): Decade {
    this.#arity(arguments.length, "decade", "branch");
    return periodPalace(unwrap(this.#native.decadeByBranch(decade, branch)));
  }

  decadePalaceByName(decade: DecadeIndex, name: PalaceName): Palace {
    this.#arity(arguments.length, "decade", "name");
    return palace(unwrap(this.#native.decadePalaceByName(decade, name)));
  }

  decadeYears(decade: DecadeIndex): readonly DecadeYear[] {
    this.#arity(arguments.length, "decade");
    return Object.freeze(
      unwrap(this.#native.decadeYears(decade)).map((raw) =>
        Object.freeze({ age: raw.age, year: raw.year ?? null }),
      ),
    );
  }

  yearly(decade: DecadeIndex, index: YearlyIndex): readonly Yearly[] {
    this.#arity(arguments.length, "decade", "index");
    return Object.freeze(unwrap(this.#native.yearly(decade, index)).map(periodPalace));
  }

  yearlyByBranch(decade: DecadeIndex, yearly: YearlyIndex, branch: Branch): Yearly {
    this.#arity(arguments.length, "decade", "yearly", "branch");
    return periodPalace(unwrap(this.#native.yearlyByBranch(decade, yearly, branch)));
  }

  yearlyPalaceByName(decade: DecadeIndex, yearly: YearlyIndex, name: PalaceName): Palace {
    this.#arity(arguments.length, "decade", "yearly", "name");
    return palace(unwrap(this.#native.yearlyPalaceByName(decade, yearly, name)));
  }

  oppositePalace(branch: Branch): Palace {
    this.#arity(arguments.length, "branch");
    return palace(unwrap(this.#native.oppositePalace(branch)));
  }

  sanfangPalaces(branch: Branch, includeSelf: boolean): readonly Palace[] {
    this.#arity(arguments.length, "branch", "includeSelf");
    return Object.freeze(unwrap(this.#native.sanfangPalaces(branch, includeSelf)).map(palace));
  }

  sizhengPalaces(branch: Branch): readonly Palace[] {
    this.#arity(arguments.length, "branch");
    return Object.freeze(unwrap(this.#native.sizhengPalaces(branch)).map(palace));
  }

  mingPalace(): Palace {
    return palace(this.#native.mingPalace());
  }
  shenPalace(): Palace {
    return palace(this.#native.shenPalace());
  }
  originPalace(): Palace {
    return palace(this.#native.originPalace());
  }
  ziweiPalace(): Palace {
    return palace(this.#native.ziweiPalace());
  }

  birthTransformations(): readonly LocatedStar[] {
    return Object.freeze(this.#native.birthTransformations().map(locatedStar));
  }

  selfTransformations(): readonly LocatedStar[] {
    return Object.freeze(this.#native.selfTransformations().map(locatedStar));
  }

  palaceTransformation(sourceBranch: Branch, kind: Transformation): PalaceTransformation {
    this.#arity(arguments.length, "sourceBranch", "kind");
    return relation(unwrap(this.#native.palaceTransformation(sourceBranch, kind)));
  }

  palaceTransformations(sourceBranch: Branch): readonly PalaceTransformation[] {
    this.#arity(arguments.length, "sourceBranch");
    return Object.freeze(unwrap(this.#native.palaceTransformations(sourceBranch)).map(relation));
  }

  palaceTransformationSources(targetBranch: Branch): readonly PalaceTransformation[] {
    this.#arity(arguments.length, "targetBranch");
    return Object.freeze(
      unwrap(this.#native.palaceTransformationSources(targetBranch)).map(relation),
    );
  }

  palaceByName(name: PalaceName): Palace {
    this.#arity(arguments.length, "name");
    return palace(unwrap(this.#native.palaceByName(name)));
  }

  palaceByStar(name: StarName): Palace {
    this.#arity(arguments.length, "name");
    return palace(unwrap(this.#native.palaceByStar(name)));
  }

  star(name: StarName): Star {
    this.#arity(arguments.length, "name");
    return star(unwrap(this.#native.star(name)));
  }

  palaceStar(branch: Branch, name: StarName): Star | null {
    this.#arity(arguments.length, "branch", "name");
    const raw = unwrap(this.#native.palaceStar(branch, name));
    return raw == null ? null : star(raw);
  }

  get fiveElementBureau(): FiveElementBureau {
    return this.#native.fiveElementBureau;
  }

  get palaces(): readonly Palace[] {
    if (this.#palaces === undefined) {
      this.#palaces = Object.freeze(this.#native.palaces.map(palace));
    }
    return this.#palaces;
  }

  get profile(): Profile {
    if (this.#profile !== undefined) return this.#profile;
    const raw = this.#native.profile;
    const base = {
      gender: raw.gender,
      birthStem: raw.birthStem,
      birthBranch: raw.birthBranch,
      birthMonth: raw.birthMonth,
      birthHour: raw.birthHour,
    };
    // The union is established by runtime checks, not asserted into existence.
    if (raw.birthYear == null && raw.birthDay == null) {
      this.#profile = Object.freeze({ ...base, birthYear: null, birthDay: null });
    } else if (raw.birthYear != null && raw.birthDay != null) {
      this.#profile = Object.freeze({
        ...base,
        birthYear: raw.birthYear,
        birthDay: raw.birthDay,
      });
    } else {
      throw new Error("原生出生档案的年份与日期状态不一致");
    }
    return this.#profile;
  }
}

// Keep the holder and its constructor inaccessible through prototype traversal.
Object.defineProperty(NatalHandle.prototype, "constructor", { value: undefined });
Object.freeze(NatalHandle.prototype);

function star(raw: native.NativeStar): Star {
  // Decode the generated private tuple once; only named, frozen data escapes.
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

function palace(raw: native.NativePalace): Palace {
  const [name, nameHans, nameHant, branch, stem, stars, decadeAgeRange] = raw;
  return Object.freeze({
    name,
    nameHans,
    nameHant,
    branch,
    stem,
    stars: Object.freeze(stars.map(star)),
    decadeAgeRange: Object.freeze(decadeAgeRange),
  });
}

function locatedStar(raw: native.NativeLocatedStar): LocatedStar {
  return Object.freeze({ palace: palace(raw.palace), star: star(raw.star) });
}

function relation(raw: native.NativePalaceTransformation): PalaceTransformation {
  return Object.freeze({
    sourceBranch: raw.sourceBranch,
    targetBranch: raw.targetBranch,
    transformation: raw.transformation,
    star: raw.star,
  });
}

function periodPalace(raw: native.NativePeriodPalace): Decade | Yearly {
  return Object.freeze({ name: raw.name, nameHans: raw.nameHans, nameHant: raw.nameHant });
}

export function natal(result: native.NativeConstruction): Natal {
  if (result.error != null) throw nativeError(result.error);
  if (result.natal == null) throw new Error("原生建盘未返回命盘或预期错误");
  return new NatalHandle(result.natal);
}
