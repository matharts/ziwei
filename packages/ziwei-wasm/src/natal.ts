import {
  nativeError,
  unwrap,
  unwrapQuery,
  arity,
  projectProfile,
  projectStar as star,
  projectPalace as palace,
  projectLocatedStar as locatedStar,
  projectPalaceTransformation as relation,
} from "@matharts/ziwei-shared";

import type * as native from "../generated/ziwei_wasm.js";
import { ZiweiLifecycleError } from "./lifecycle.js";
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
  #handle: native.NativeNatal | null;
  #profile: Profile | undefined;
  #palaces: readonly Palace[] | undefined;

  constructor(value: native.NativeNatal) {
    this.#handle = value;
    Object.freeze(this);
  }

  get #native(): native.NativeNatal {
    if (this.#handle === null) throw new ZiweiLifecycleError();
    return this.#handle;
  }

  dispose(): void {
    const handle = this.#handle;
    if (handle === null) return;
    this.#handle = null;
    this.#profile = undefined;
    this.#palaces = undefined;
    handle.free();
  }

  // Private method access checks the receiver and liveness before argument classification.
  #arity(count: number, ...names: string[]): void {
    void this.#native;
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
    return periodPalace(
      unwrapQuery(
        this.#native.decadeByBranch(decade, branch),
        arguments.length,
        "decade",
        "branch",
      ),
    );
  }

  decadePalaceByName(decade: DecadeIndex, name: PalaceName): Palace {
    return palace(
      unwrapQuery(
        this.#native.decadePalaceByName(decade, name),
        arguments.length,
        "decade",
        "name",
      ),
    );
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
    return Object.freeze(
      unwrapQuery(this.#native.yearly(decade, index), arguments.length, "decade", "index").map(
        periodPalace,
      ),
    );
  }

  yearlyByBranch(decade: DecadeIndex, yearly: YearlyIndex, branch: Branch): Yearly {
    return periodPalace(
      unwrapQuery(
        this.#native.yearlyByBranch(decade, yearly, branch),
        arguments.length,
        "decade",
        "yearly",
        "branch",
      ),
    );
  }

  yearlyPalaceByName(decade: DecadeIndex, yearly: YearlyIndex, name: PalaceName): Palace {
    return palace(
      unwrapQuery(
        this.#native.yearlyPalaceByName(decade, yearly, name),
        arguments.length,
        "decade",
        "yearly",
        "name",
      ),
    );
  }

  oppositePalace(branch: Branch): Palace {
    this.#arity(arguments.length, "branch");
    return palace(unwrap(this.#native.oppositePalace(branch)));
  }

  sanfangPalaces(branch: Branch, includeSelf: boolean): readonly Palace[] {
    return Object.freeze(
      unwrapQuery(
        this.#native.sanfangPalaces(branch, includeSelf),
        arguments.length,
        "branch",
        "includeSelf",
      ).map(palace),
    );
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
    return relation(
      unwrapQuery(
        this.#native.palaceTransformation(sourceBranch, kind),
        arguments.length,
        "sourceBranch",
        "kind",
      ),
    );
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
    const raw = unwrapQuery(
      this.#native.palaceStar(branch, name),
      arguments.length,
      "branch",
      "name",
    );
    return raw == null ? null : star(raw);
  }

  get fiveElementBureau(): FiveElementBureau {
    return this.#native.fiveElementBureau;
  }

  get palaces(): readonly Palace[] {
    const value = this.#native;
    if (this.#palaces === undefined) {
      this.#palaces = Object.freeze(value.palaces.map(palace));
    }
    return this.#palaces;
  }

  get profile(): Profile {
    const value = this.#native;
    if (this.#profile !== undefined) return this.#profile;
    this.#profile = projectProfile(value.profile);
    return this.#profile;
  }
}

// Keep the holder and its constructor inaccessible through prototype traversal.
Object.defineProperty(NatalHandle.prototype, "constructor", { value: undefined });
Object.freeze(NatalHandle.prototype);

function periodPalace(raw: native.NativePeriodPalace): Decade | Yearly {
  return Object.freeze({ name: raw.name, nameHans: raw.nameHans, nameHant: raw.nameHant });
}

export function natal(result: native.NativeConstruction): Natal {
  if (result.error != null) throw nativeError(result.error);
  if (result.natal == null) throw new Error("原生建盘未返回命盘或预期错误");
  try {
    return new NatalHandle(result.natal);
  } catch (error) {
    result.natal.free();
    throw error;
  }
}
