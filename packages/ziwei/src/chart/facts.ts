import {
  Branch,
  Gender,
  Stem,
  ZODIAC_BY_BRANCH,
  cycle,
  yinIndex,
  type FiveElementBureau,
  type Zodiac,
} from "../domain/identities.js";
import { bureauAt, palaceStems } from "../domain/sexagenary.js";
import type { Birth, Parameters, Profile } from "../domain/types.js";
import { starLayoutRow } from "../stars/layout.js";

/** Internal facts retained by a handle for lazy projections and queries. */
export interface NatalFacts {
  readonly profile: Profile;
  readonly zodiac: Zodiac;
  readonly fiveElementBureau: FiveElementBureau;
  readonly pendingStems: readonly Stem[];
  readonly mingBranch: Branch;
  readonly shenBranch: Branch;
  readonly originBranch: Branch;
  readonly ziweiBranch: Branch;
  readonly starLayoutRow: number;
  readonly decadeDirection: 1 | -1;
}

const ORIGIN = [10, 9, 8, 7, 6, 5, 4, 3, 2, 11] as const;
function mingShen(month: number, hour: Branch): readonly [Branch, Branch] {
  const monthBranch = month + 1;
  return [cycle(monthBranch - hour) as Branch, cycle(monthBranch + hour) as Branch];
}
const ZIWEI_BY_BUREAU_DAY = (() => {
  const values = new Uint8Array(7 * 31);
  for (const bureau of [2, 3, 4, 5, 6]) {
    for (let day = 1; day <= 30; day++) {
      const quotient = Math.ceil(day / bureau);
      const remaining = quotient * bureau - day;
      const adjustment = remaining % 2 === 0 ? remaining : -remaining;
      values[bureau * 31 + day] = cycle(quotient + 1 + adjustment);
    }
  }
  return values;
})();
function ziweiFromDay(bureau: FiveElementBureau, day: number): Branch {
  return ZIWEI_BY_BUREAU_DAY[bureau * 31 + day]! as Branch;
}
export function birthFacts(birth: Birth): NatalFacts {
  const yearStem = cycle(birth.birthYear + 6, 10) as Stem;
  const yearBranch = cycle(birth.birthYear + 8) as Branch;
  const [ming, shen] = mingShen(birth.birthMonth, birth.birthHour);
  const stems = palaceStems(yearStem);
  const bureau = bureauAt(stems[yinIndex(ming)]!, ming);
  const ziweiBranch = ziweiFromDay(bureau, birth.birthDay);
  const profile: Profile = Object.freeze({
    gender: birth.gender,
    birthStem: yearStem,
    birthBranch: yearBranch,
    birthMonth: birth.birthMonth,
    birthHour: birth.birthHour,
    birthYear: birth.birthYear,
    birthDay: birth.birthDay,
  });
  return buildFacts(profile, ziweiBranch, stems, bureau, ming, shen);
}
export function parameterFacts(parameters: Parameters): NatalFacts {
  const [ming, shen] = mingShen(parameters.birthMonth, parameters.birthHour);
  const stems = palaceStems(parameters.birthStem);
  const bureau = bureauAt(stems[yinIndex(ming)]!, ming);
  const profile: Profile = Object.freeze({
    gender: parameters.gender,
    birthStem: parameters.birthStem,
    birthBranch: parameters.birthBranch,
    birthMonth: parameters.birthMonth,
    birthHour: parameters.birthHour,
    birthYear: null,
    birthDay: null,
  });
  return buildFacts(profile, parameters.ziweiBranch, stems, bureau, ming, shen);
}
function buildFacts(
  profile: Profile,
  ziweiBranch: Branch,
  stems: readonly Stem[],
  bureau: FiveElementBureau,
  mingBranch: Branch,
  shenBranch: Branch,
): NatalFacts {
  const yearStem = profile.birthStem;
  const originBranch = ORIGIN[yearStem]! as Branch;
  const forward = (profile.gender === Gender.Male) === (yearStem % 2 === 0);
  const decadeDirection: 1 | -1 = forward ? 1 : -1;
  // Only the handle retains these readonly facts; public values are frozen separately.
  return {
    profile,
    zodiac: ZODIAC_BY_BRANCH[profile.birthBranch]!,
    fiveElementBureau: bureau,
    mingBranch,
    shenBranch,
    originBranch,
    ziweiBranch,
    starLayoutRow: starLayoutRow(ziweiBranch, profile.birthMonth, profile.birthHour),
    decadeDirection,
    pendingStems: stems,
  };
}
