/** 只验证声明；@ts-expect-error 必须对应真实类型错误。不要执行。 */
import { Branch, Gender, PalaceName, StarName, Stem, Transformation, Ziwei, ZiweiError } from './index.js';
import type { Natal, Profile, ZiweiErrorDetail } from './index.js';

declare const natal: Natal;
declare const unknownError: unknown;

// 普通表单 number 不需要品牌包装；范围正确性由未来运行时检查。
const dynamicMonth: number = Number('8');
Ziwei.fromBirth({ gender: Gender.Female, birthYear: 1992, birthMonth: dynamicMonth, birthDay: 15, birthHour: Branch.Mao });
natal.decade(Number('0'));

const profile = natal.profile;
if (profile.birthYear === null) {
  const missingDay: null = profile.birthDay;
  void missingDay;
} else {
  const day: number = profile.birthDay;
  void day;
}

// @ts-expect-error Natal 只导出类型，不能自行构造命盘。
new Natal();
// @ts-expect-error Ziwei 不是构造器。
new Ziwei();
// @ts-expect-error ZiweiError 不公开构造器。
new ZiweiError();
// @ts-expect-error Birth 不能遗漏出生日。
Ziwei.fromBirth({ gender: Gender.Female, birthYear: 1992, birthMonth: 8, birthHour: Branch.Mao });
// @ts-expect-error Parameters 没有 birthDay。
Ziwei.fromParameters({ gender: 0, birthStem: Stem.Ren, birthBranch: Branch.Shen, birthMonth: 8, ziweiBranch: Branch.You, birthHour: Branch.Mao, birthDay: 15 });
// @ts-expect-error 不接受字符串性别。
Ziwei.fromBirth({ gender: 'Female', birthYear: 1992, birthMonth: 8, birthDay: 15, birthHour: 3 });
// @ts-expect-error 地支枚举不包含 12。
natal.palace(12);
// @ts-expect-error 不能将宫职身份当作地支。
natal.palace(PalaceName.Ming);
// @ts-expect-error 必须区分字段缺失与 null，不能用 undefined 表示年份缺失。
const invalidProfile: Profile = { gender: 0, birthStem: 0, birthBranch: 0, birthMonth: 1, birthHour: 0, birthYear: undefined, birthDay: null };
// @ts-expect-error 数字年份与出生日必须同时存在。
const halfProfile: Profile = { gender: 0, birthStem: 0, birthBranch: 0, birthMonth: 1, birthHour: 0, birthYear: 1992, birthDay: null };
// @ts-expect-error 顶层属性只读。
natal.palaces = [];
// @ts-expect-error 数组只读。
natal.palaces.pop();
const palace = natal.palace(Branch.Yin);
// @ts-expect-error 宫位字段只读。
palace.nameHans = '其他名称';
// @ts-expect-error 嵌套星曜数组只读。
palace.stars.push(natal.star(StarName.ZiWei));
// @ts-expect-error 嵌套自化字段只读。
natal.star(StarName.ZiWei).selfTransformations.inward = Transformation.A;
// @ts-expect-error 年龄区间只读。
palace.decadeAgeRange[0] = 0;
// @ts-expect-error Palace 是普通记录，不携带原生查询方法。
palace.star(StarName.ZiWei);
// @ts-expect-error 宫内查星可能没有结果。
const definitelyPresent: import('./index.js').Star = natal.palaceStar(Branch.Yin, StarName.ZuoFu);
// @ts-expect-error 常量全集只读。
Branch.ALL.reverse();
// @ts-expect-error 创建入口不可替换。
Ziwei.fromBirth = Ziwei.fromBirth;

if (unknownError instanceof ZiweiError) {
  const detail = unknownError.detail;
  if (detail.code === 'INVALID_SEXAGENARY_YEAR') {
    const stem: Stem = detail.stem;
    void stem;
    // @ts-expect-error 干支配对错误没有 value 载荷。
    detail.value;
  }
  if (detail.code === 'INVALID_ARGUMENT' && detail.received.type === 'number') {
    const original: number = detail.received.value;
    void original;
    // @ts-expect-error 错误定位路径也必须只读。
    detail.path.push('changed');
  }
}

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type CoreErrorCodesCovered = Assert<Equal<Exclude<ZiweiErrorDetail['code'], 'INVALID_ARGUMENT'>,
  'INVALID_SEXAGENARY_YEAR' | 'INVALID_LUNISOLAR_MONTH' | 'INVALID_LUNISOLAR_DAY'
  | 'INVALID_DECADE_INDEX' | 'INVALID_YEARLY_INDEX'>>;
type OnlyTwoConstructionMethods = Assert<Equal<keyof typeof Ziwei, 'fromBirth' | 'fromParameters'>>;
type ExistingNatalMethodsCovered = Assert<Equal<Exclude<keyof Natal, 'palaceStar' | 'toJSON'>,
  | 'profile' | 'zodiac' | 'fiveElementBureau' | 'palaces'
  | 'palace' | 'oppositePalace' | 'sanfangPalaces' | 'sizhengPalaces' | 'palaceByName'
  | 'mingPalace' | 'shenPalace' | 'originPalace' | 'ziweiPalace' | 'palaceByStar' | 'star'
  | 'birthTransformations' | 'selfTransformations' | 'palaceTransformation'
  | 'palaceTransformations' | 'palaceTransformationSources' | 'periodIndicesAtAge'
  | 'decade' | 'decadeByBranch' | 'decadePalaceByName' | 'decadeYears'
  | 'yearly' | 'yearlyByBranch' | 'yearlyPalaceByName'>>;

void invalidProfile;
void halfProfile;
void definitelyPresent;
export type TypeAssertions = [CoreErrorCodesCovered, OnlyTwoConstructionMethods, ExistingNatalMethodsCovered];
