// Compile only: exact comparison of generated public declarations with the full design.
import { Ziwei, ZiweiError, Gender, Branch } from '@ziweijs/core';
import * as Actual from '@ziweijs/core';
import type {
  Birth, Parameters, Profile, Natal, ZiweiErrorDetail, Palace, Star, SelfTransformations,
  DecadeAgeRange, Zodiac, FiveElementBureau, PalaceName, StarName, StarCategory, StarGalaxy, Transformation,
} from '@ziweijs/core';
import type * as Design from '../../../docs/architecture/node-api/index.js';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
export type Contract = [Assert<Equal<Birth, Design.Birth>>, Assert<Equal<Parameters, Design.Parameters>>,
  Assert<Equal<Profile, Design.Profile>>, Assert<Equal<ZiweiErrorDetail, Design.ZiweiErrorDetail>>,
  Assert<Equal<Natal, Design.Natal>>,
  Assert<Equal<Palace, Design.Palace>>, Assert<Equal<Star, Design.Star>>,
  Assert<Equal<SelfTransformations, Design.SelfTransformations>>, Assert<Equal<DecadeAgeRange, Design.DecadeAgeRange>>,
  Assert<Equal<Zodiac, Design.Zodiac>>, Assert<Equal<FiveElementBureau, Design.FiveElementBureau>>,
  Assert<Equal<PalaceName, Design.PalaceName>>, Assert<Equal<StarName, Design.StarName>>,
  Assert<Equal<StarCategory, Design.StarCategory>>, Assert<Equal<StarGalaxy, Design.StarGalaxy>>,
  Assert<Equal<Transformation, Design.Transformation>>,
  Assert<Equal<typeof Actual.Zodiac, typeof Design.Zodiac>>,
  Assert<Equal<typeof Actual.FiveElementBureau, typeof Design.FiveElementBureau>>,
  Assert<Equal<typeof Actual.StarCategory, typeof Design.StarCategory>>,
  Assert<Equal<typeof Actual.StarGalaxy, typeof Design.StarGalaxy>>,
  Assert<Equal<typeof Actual.PalaceName, typeof Design.PalaceName>>,
  Assert<Equal<typeof Actual.StarName, typeof Design.StarName>>,
  Assert<Equal<typeof Actual.Transformation, typeof Design.Transformation>>,
  Assert<Equal<typeof Actual.YinYang, typeof Design.YinYang>>,
  Assert<Equal<typeof Actual.Gender, typeof Design.Gender>>,
  Assert<Equal<typeof Actual.Stem, typeof Design.Stem>>,
  Assert<Equal<typeof Actual.Branch, typeof Design.Branch>>,
  Assert<Equal<typeof Actual.FiveElement, typeof Design.FiveElement>>,
  Assert<Equal<typeof Actual.Ziwei, typeof Design.Ziwei>>,
  Assert<Equal<keyof typeof Actual, keyof typeof Design>>,
  Assert<Equal<Actual.NatalSnapshot, Design.NatalSnapshot>>,
  Assert<Equal<Actual.LocatedStar, Design.LocatedStar>>,
  Assert<Equal<Actual.PalaceTransformation, Design.PalaceTransformation>>,
  Assert<Equal<Actual.Decade, Design.Decade>>,
  Assert<Equal<Actual.Yearly, Design.Yearly>>,
  Assert<Equal<Actual.DecadeYear, Design.DecadeYear>>,
  Assert<Equal<Actual.PeriodIndices, Design.PeriodIndices>>,
  Assert<Equal<Actual.ZiweiErrorCode, Design.ZiweiErrorCode>>,
  Assert<Equal<Actual.ReceivedValue, Design.ReceivedValue>>,
  Assert<Equal<Actual.ArgumentFailureReason, Design.ArgumentFailureReason>>,
];

const input: Birth = { gender: Gender.Male, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: Branch.Zi };
const natal: Natal = Ziwei.fromBirth(input);
if (natal.profile.birthYear !== null) {
  const day: number = natal.profile.birthDay;
  void day;
}
// @ts-expect-error Natal is only a type.
new Natal();
// @ts-expect-error Ziwei is not a constructor.
new Ziwei();
// @ts-expect-error Errors are not publicly constructable.
new ZiweiError();
// @ts-expect-error Profile is readonly at the package interface.
natal.profile.birthYear = 0;
// @ts-expect-error Entry points are readonly.
Ziwei.fromBirth = () => natal;
// @ts-expect-error Unknown birth property.
Ziwei.fromBirth({ ...input, leapMonth: true });
// @ts-expect-error Clock hours are not branch identities.
Ziwei.fromBirth({ ...input, birthHour: 23 });
// @ts-expect-error Parameters do not carry a birth day.
const extraDay: Parameters = { gender: 1, birthStem: 0, birthBranch: 0, birthMonth: 1, ziweiBranch: 2, birthHour: 0, birthDay: 6 };
// @ts-expect-error Year and day absence must agree.
const partial: Profile = { gender: 1, birthStem: 0, birthBranch: 0, birthMonth: 1, birthHour: 0, birthYear: null, birthDay: 6 };
// @ts-expect-error Display strings are not palace identities.
natal.palaceByName('命宫');
// @ts-expect-error Explicit boolean required, no truthiness coercion.
natal.sanfangPalaces(Branch.Yin, 1);
// @ts-expect-error ALL is a readonly array.
Actual.StarName.ALL.push(Actual.StarName.ZiWei);
// @ts-expect-error Palace arrays are readonly.
natal.palaces.push(natal.palaces[0]);
// @ts-expect-error Scalar properties are readonly.
natal.zodiac = Actual.Zodiac.Rat;
// @ts-expect-error FiveElementBureau remains a numeric identity, not a string.
const invalidBureau: FiveElementBureau = 'FireSix';
// @ts-expect-error Missing the ending age.
const invalidRange: DecadeAgeRange = [6];
const validRange = [6, 15] satisfies DecadeAgeRange;
const palace = natal.palaces[0];
if (palace !== undefined) {
  // @ts-expect-error Nested palace facts are readonly.
  palace.nameHans = 'changed';
  // @ts-expect-error Age tuples are readonly.
  palace.decadeAgeRange[0] = validRange[0];
  const star = palace.stars[0];
  if (star !== undefined) {
    // @ts-expect-error Nested star facts are readonly.
    star.birthTransformation = null;
    // @ts-expect-error Self transformations are deeply readonly.
    star.selfTransformations.inward = null;
  }
}
void invalidBureau;
void invalidRange;
declare const error: ZiweiError;
if (error.detail.code === 'INVALID_SEXAGENARY_YEAR') {
  const stem: Design.Stem = error.detail.stem;
  void stem;
  // @ts-expect-error Error payloads narrow by detail.code.
  error.detail.value;
}
void extraDay;
void partial;

natal.palace(Branch.Yin);
const snapshot: Design.NatalSnapshot = natal.toJSON();
const periods: readonly Design.Decade[] = natal.decade(0);
const years: readonly Design.DecadeYear[] = natal.decadeYears(0);
const starOrNull = natal.palaceStar(Branch.Yin, Actual.StarName.WuQu);
// @ts-expect-error A palace-local lookup can miss.
const alwaysStar: Star = starOrNull;
if (starOrNull !== null) {
  const star: Star = starOrNull;
  void star;
}
// @ts-expect-error Snapshot fields are readonly.
snapshot.mingPalaceBranch = Branch.Zi;
// @ts-expect-error Period arrays are readonly.
periods.pop();
if (years[0] !== undefined) {
  // @ts-expect-error Years can be absent for Parameters input.
  const present: number = years[0].year;
  // @ts-expect-error Query DTO fields are readonly.
  years[0].age = 10;
  void present;
}
// @ts-expect-error Wrong identity family.
natal.star(Actual.PalaceName.Ming);
// @ts-expect-error Unknown transformation identity.
natal.palaceTransformation(Branch.Yin, '禄');
// @ts-expect-error Internal native holder is not public.
Actual.NativeNatal;
// @ts-expect-error Snapshot is not a rehydration constructor input.
Actual.Ziwei.fromJSON(snapshot);
void alwaysStar;
