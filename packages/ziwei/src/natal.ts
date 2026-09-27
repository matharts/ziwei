import {
  engineError,
  unwrap,
  unwrapQuery,
  arity,
  projectProfile,
  projectStar as star,
  projectPalace as palace,
  projectLocatedStar as locatedStar,
  projectPalaceTransformation as relation,
} from "@matharts/ziwei-shared";

import type * as engine from "./engine/index.js";
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
  #engine: engine.EngineNatal;
  #profile: Profile | undefined;
  #palaces: readonly Palace[] | undefined;

  constructor(value: engine.EngineNatal) {
    this.#engine = value;
    Object.freeze(this);
  }

  // Private method access checks the receiver before classifying missing arguments.
  #arity(count: number, ...names: string[]): void {
    arity(count, ...names);
  }

  get zodiac(): Zodiac {
    return this.#engine.zodiac;
  }

  toJSON(): NatalSnapshot {
    const locations = this.#engine.snapshotLocations();
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
    return palace(unwrap(this.#engine.palace(branch)));
  }

  periodIndicesAtAge(age: number): PeriodIndices | null {
    this.#arity(arguments.length, "age");
    const raw = unwrap(this.#engine.periodIndicesAtAge(age));
    return raw == null ? null : Object.freeze({ decade: raw.decade, yearly: raw.yearly });
  }

  decade(index: DecadeIndex): readonly Decade[] {
    this.#arity(arguments.length, "index");
    return Object.freeze(unwrap(this.#engine.decade(index)).map(periodPalace));
  }

  decadeByBranch(decade: DecadeIndex, branch: Branch): Decade {
    return periodPalace(
      unwrapQuery(
        this.#engine.decadeByBranch(decade, branch),
        arguments.length,
        "decade",
        "branch",
      ),
    );
  }

  decadePalaceByName(decade: DecadeIndex, name: PalaceName): Palace {
    return palace(
      unwrapQuery(
        this.#engine.decadePalaceByName(decade, name),
        arguments.length,
        "decade",
        "name",
      ),
    );
  }

  decadeYears(decade: DecadeIndex): readonly DecadeYear[] {
    this.#arity(arguments.length, "decade");
    return Object.freeze(
      unwrap(this.#engine.decadeYears(decade)).map((raw) =>
        Object.freeze({ age: raw.age, year: raw.year ?? null }),
      ),
    );
  }

  yearly(decade: DecadeIndex, index: YearlyIndex): readonly Yearly[] {
    return Object.freeze(
      unwrapQuery(this.#engine.yearly(decade, index), arguments.length, "decade", "index").map(
        periodPalace,
      ),
    );
  }

  yearlyByBranch(decade: DecadeIndex, yearly: YearlyIndex, branch: Branch): Yearly {
    return periodPalace(
      unwrapQuery(
        this.#engine.yearlyByBranch(decade, yearly, branch),
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
        this.#engine.yearlyPalaceByName(decade, yearly, name),
        arguments.length,
        "decade",
        "yearly",
        "name",
      ),
    );
  }

  oppositePalace(branch: Branch): Palace {
    this.#arity(arguments.length, "branch");
    return palace(unwrap(this.#engine.oppositePalace(branch)));
  }

  sanfangPalaces(branch: Branch, includeSelf: boolean): readonly Palace[] {
    return Object.freeze(
      unwrapQuery(
        this.#engine.sanfangPalaces(branch, includeSelf),
        arguments.length,
        "branch",
        "includeSelf",
      ).map(palace),
    );
  }

  sizhengPalaces(branch: Branch): readonly Palace[] {
    this.#arity(arguments.length, "branch");
    return Object.freeze(unwrap(this.#engine.sizhengPalaces(branch)).map(palace));
  }

  mingPalace(): Palace {
    return palace(this.#engine.mingPalace());
  }
  shenPalace(): Palace {
    return palace(this.#engine.shenPalace());
  }
  originPalace(): Palace {
    return palace(this.#engine.originPalace());
  }
  ziweiPalace(): Palace {
    return palace(this.#engine.ziweiPalace());
  }

  birthTransformations(): readonly LocatedStar[] {
    return Object.freeze(this.#engine.birthTransformations().map(locatedStar));
  }

  selfTransformations(): readonly LocatedStar[] {
    return Object.freeze(this.#engine.selfTransformations().map(locatedStar));
  }

  palaceTransformation(sourceBranch: Branch, kind: Transformation): PalaceTransformation {
    return relation(
      unwrapQuery(
        this.#engine.palaceTransformation(sourceBranch, kind),
        arguments.length,
        "sourceBranch",
        "kind",
      ),
    );
  }

  palaceTransformations(sourceBranch: Branch): readonly PalaceTransformation[] {
    this.#arity(arguments.length, "sourceBranch");
    return Object.freeze(unwrap(this.#engine.palaceTransformations(sourceBranch)).map(relation));
  }

  palaceTransformationSources(targetBranch: Branch): readonly PalaceTransformation[] {
    this.#arity(arguments.length, "targetBranch");
    return Object.freeze(
      unwrap(this.#engine.palaceTransformationSources(targetBranch)).map(relation),
    );
  }

  palaceByName(name: PalaceName): Palace {
    this.#arity(arguments.length, "name");
    return palace(unwrap(this.#engine.palaceByName(name)));
  }

  palaceByStar(name: StarName): Palace {
    this.#arity(arguments.length, "name");
    return palace(unwrap(this.#engine.palaceByStar(name)));
  }

  star(name: StarName): Star {
    this.#arity(arguments.length, "name");
    return star(unwrap(this.#engine.star(name)));
  }

  palaceStar(branch: Branch, name: StarName): Star | null {
    const raw = unwrapQuery(
      this.#engine.palaceStar(branch, name),
      arguments.length,
      "branch",
      "name",
    );
    return raw == null ? null : star(raw);
  }

  get fiveElementBureau(): FiveElementBureau {
    return this.#engine.fiveElementBureau;
  }

  get palaces(): readonly Palace[] {
    if (this.#palaces === undefined) {
      this.#palaces = Object.freeze(this.#engine.palaces.map(palace));
    }
    return this.#palaces;
  }

  get profile(): Profile {
    if (this.#profile !== undefined) return this.#profile;
    this.#profile = projectProfile(this.#engine.profile);
    return this.#profile;
  }
}

// Keep the holder and its constructor inaccessible through prototype traversal.
Object.defineProperty(NatalHandle.prototype, "constructor", { value: undefined });
Object.freeze(NatalHandle.prototype);

function periodPalace(raw: engine.EnginePeriodPalace): Decade | Yearly {
  return Object.freeze({ name: raw.name, nameHans: raw.nameHans, nameHant: raw.nameHant });
}

export function natal(result: engine.EngineConstruction): Natal {
  if (result.error != null) throw engineError(result.error);
  if (result.natal == null) throw new Error("排盘引擎未返回命盘或预期错误");
  return new NatalHandle(result.natal);
}
