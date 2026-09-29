// Compile-only consumer contract for the TypeScript-native public API.
import { Branch, Gender, PalaceName, StarName, Ziwei, ZiweiError } from "@matharts/ziwei";
import type {
  Birth,
  Parameters,
  Natal,
  Palace,
  Star,
  PeriodIndices,
  DecadeYear,
} from "@matharts/ziwei";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type Methods = {
  [K in keyof Natal]: Natal[K] extends (...args: never[]) => unknown ? K : never;
}[keyof Natal];
type RustQueries =
  | "palace"
  | "oppositePalace"
  | "sanfangPalaces"
  | "sizhengPalaces"
  | "palaceByName"
  | "mingPalace"
  | "shenPalace"
  | "originPalace"
  | "ziweiPalace"
  | "palaceByStar"
  | "star"
  | "birthTransformations"
  | "selfTransformations"
  | "palaceTransformation"
  | "palaceTransformations"
  | "palaceTransformationSources"
  | "periodIndicesAtAge"
  | "decade"
  | "decadeByBranch"
  | "decadePalaceByName"
  | "decadeYears"
  | "yearly"
  | "yearlyByBranch"
  | "yearlyPalaceByName";
export type Contract = [
  Assert<Equal<Methods, RustQueries>>,
  Assert<Equal<keyof typeof Ziwei, "fromBirth" | "fromParameters">>,
];

const birth: Birth = {
  gender: Gender.Male,
  birthYear: 1984,
  birthMonth: 1,
  birthDay: 6,
  birthHour: Branch.Zi,
};
const natal: Natal = Ziwei.fromBirth(birth);
const palace: Palace = natal.palace(Branch.Yin);
const star: Star | null = palace.star(StarName.ZiWei);
const period: PeriodIndices | null = natal.periodIndicesAtAge(6);
const year: DecadeYear | undefined = natal.decadeYears(0)[0];
const parameters: Parameters = {
  gender: Gender.Male,
  birthStem: 0,
  birthBranch: 0,
  birthMonth: 1,
  ziweiBranch: 2,
  birthHour: 0,
};
Ziwei.fromParameters(parameters);
natal.palaceByName(PalaceName.Ming);
// @ts-expect-error Natal is type-only and cannot be constructed by consumers.
new Natal();
// @ts-expect-error Palace is type-only at the package root.
new Palace();
// @ts-expect-error A palace-local lookup may miss.
const definitelyPresent: Star = palace.star(StarName.ZiWei);
// @ts-expect-error Unknown star identities are rejected statically.
natal.star("Other");
// @ts-expect-error Legacy Node facade convenience method is gone.
natal.palaceStar(Branch.Yin, StarName.ZiWei);
// @ts-expect-error JSON serialization is no longer a public domain operation.
natal.toJSON();
// @ts-expect-error Chart facts are readonly.
natal.profile.birthYear = 0;
// @ts-expect-error Input has no calendar conversion option.
Ziwei.fromBirth({ ...birth, leapMonth: true });
declare const error: unknown;
if (error instanceof ZiweiError) {
  const code: string = error.code;
  void code;
}
void star;
void period;
void year;
void definitelyPresent;
