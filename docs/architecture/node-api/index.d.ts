/**
 * Node / TypeScript 设计合同；不是已发布包，也不包含运行时实现。
 * 数字入参仍须运行时校验。除明确的属性复用外，不承诺结果引用相等。
 */

export type YinYang = 0 | 1;
export declare const YinYang: {
  readonly Yin: 0; readonly Yang: 1;
};

export type Gender = 0 | 1;
export declare const Gender: {
  readonly Female: 0; readonly Male: 1;
  readonly yinYang: (value: Gender) => YinYang;
};

export type Stem = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export declare const Stem: {
  readonly Jia: 0; readonly Yi: 1; readonly Bing: 2; readonly Ding: 3;
  readonly Wu: 4; readonly Ji: 5; readonly Geng: 6; readonly Xin: 7;
  readonly Ren: 8; readonly Gui: 9;
  readonly ALL: readonly Stem[];
  readonly yinYang: (value: Stem) => YinYang;
};

/** 子 = 0；不是 palaces 数组的寅起下标。 */
export type Branch = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export declare const Branch: {
  readonly Zi: 0; readonly Chou: 1; readonly Yin: 2; readonly Mao: 3;
  readonly Chen: 4; readonly Si: 5; readonly Wu: 6; readonly Wei: 7;
  readonly Shen: 8; readonly You: 9; readonly Xu: 10; readonly Hai: 11;
  readonly ALL: readonly Branch[];
  readonly yinYang: (value: Branch) => YinYang;
  readonly zodiac: (value: Branch) => Zodiac;
};

export type FiveElement = 'Water' | 'Wood' | 'Metal' | 'Earth' | 'Fire';
export declare const FiveElement: {
  readonly Water: 'Water'; readonly Wood: 'Wood'; readonly Metal: 'Metal';
  readonly Earth: 'Earth'; readonly Fire: 'Fire';
};

export type FiveElementBureau = 2 | 3 | 4 | 5 | 6;
export declare const FiveElementBureau: {
  readonly WaterTwo: 2; readonly WoodThree: 3; readonly MetalFour: 4;
  readonly EarthFive: 5; readonly FireSix: 6;
};

export type Zodiac =
  | 'Rat' | 'Ox' | 'Tiger' | 'Rabbit' | 'Dragon' | 'Snake'
  | 'Horse' | 'Goat' | 'Monkey' | 'Rooster' | 'Dog' | 'Pig';
export declare const Zodiac: {
  readonly Rat: 'Rat'; readonly Ox: 'Ox'; readonly Tiger: 'Tiger';
  readonly Rabbit: 'Rabbit'; readonly Dragon: 'Dragon'; readonly Snake: 'Snake';
  readonly Horse: 'Horse'; readonly Goat: 'Goat'; readonly Monkey: 'Monkey';
  readonly Rooster: 'Rooster'; readonly Dog: 'Dog'; readonly Pig: 'Pig';
};

export type PalaceName =
  | 'Ming' | 'XiongDi' | 'FuQi' | 'ZiNv' | 'CaiBo' | 'JiE'
  | 'QianYi' | 'JiaoYou' | 'GuanLu' | 'TianZhai' | 'FuDe' | 'FuMu';
export declare const PalaceName: {
  readonly Ming: 'Ming'; readonly XiongDi: 'XiongDi'; readonly FuQi: 'FuQi';
  readonly ZiNv: 'ZiNv'; readonly CaiBo: 'CaiBo'; readonly JiE: 'JiE';
  readonly QianYi: 'QianYi'; readonly JiaoYou: 'JiaoYou'; readonly GuanLu: 'GuanLu';
  readonly TianZhai: 'TianZhai'; readonly FuDe: 'FuDe'; readonly FuMu: 'FuMu';
  readonly ALL: readonly PalaceName[];
};

export type StarName =
  | 'ZiWei' | 'TianJi' | 'TaiYang' | 'WuQu' | 'TianTong' | 'LianZhen'
  | 'TianFu' | 'TaiYin' | 'TanLang' | 'JuMen' | 'TianXiang' | 'TianLiang'
  | 'QiSha' | 'PoJun' | 'ZuoFu' | 'YouBi' | 'WenChang' | 'WenQu';
export declare const StarName: {
  readonly ZiWei: 'ZiWei'; readonly TianJi: 'TianJi'; readonly TaiYang: 'TaiYang';
  readonly WuQu: 'WuQu'; readonly TianTong: 'TianTong'; readonly LianZhen: 'LianZhen';
  readonly TianFu: 'TianFu'; readonly TaiYin: 'TaiYin'; readonly TanLang: 'TanLang';
  readonly JuMen: 'JuMen'; readonly TianXiang: 'TianXiang'; readonly TianLiang: 'TianLiang';
  readonly QiSha: 'QiSha'; readonly PoJun: 'PoJun'; readonly ZuoFu: 'ZuoFu';
  readonly YouBi: 'YouBi'; readonly WenChang: 'WenChang'; readonly WenQu: 'WenQu';
  readonly ALL: readonly StarName[];
};

export type StarCategory = 'Major' | 'Minor' | 'Auxiliary';
export declare const StarCategory: {
  readonly Major: 'Major'; readonly Minor: 'Minor'; readonly Auxiliary: 'Auxiliary';
};

export type StarGalaxy = 'South' | 'Central' | 'North';
export declare const StarGalaxy: {
  readonly South: 'South'; readonly Central: 'Central'; readonly North: 'North';
};

/** A/B/C/D 分别为禄、权、科、忌；协议值就是这些字母。 */
export type Transformation = 'A' | 'B' | 'C' | 'D';
export declare const Transformation: {
  readonly A: 'A'; readonly B: 'B'; readonly C: 'C'; readonly D: 'D';
  readonly ALL: readonly Transformation[];
};

/** 以下输入范围用 number 表示，避免调用方为了提交表单值而使用类型断言。 */
export type BirthMonth = number; // 整数 1..12。
export type BirthDay = number; // 整数 1..30。
export type DecadeIndex = number; // 整数 0..11；0 为第一大限。
export type YearlyIndex = number; // 整数 0..9；不是数字年份。

export interface Birth {
  readonly gender: Gender;
  /** 已归一化的数字农历年；i32 全范围，包括零年、负年。 */
  readonly birthYear: number;
  readonly birthMonth: BirthMonth;
  readonly birthDay: BirthDay;
  /** 时辰地支，子 = 0；不是 24 小时制小时数。 */
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

/** 两个可缺失字段必须同时存在或同时为 null；不增加来源字段。 */
export type Profile = ProfileBase & (
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

/** 两端均包含的虚岁区间；end = start + 9。 */
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

export interface Decade {
  readonly name: PalaceName;
  readonly nameHans: string;
  readonly nameHant: string;
}

export interface Yearly {
  readonly name: PalaceName;
  readonly nameHans: string;
  readonly nameHant: string;
}

export interface DecadeYear {
  readonly age: number;
  /** 数字年份，不是 Date；当前输出可超过 i32，但仍是安全整数。 */
  readonly year: number | null;
}

export interface PeriodIndices {
  readonly decade: DecadeIndex;
  readonly yearly: YearlyIndex;
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

export interface NatalSnapshot {
  readonly profile: Profile;
  readonly zodiac: Zodiac;
  readonly fiveElementBureau: FiveElementBureau;
  /** 十二项，固定按寅至丑排列。 */
  readonly palaces: readonly Palace[];
  readonly mingPalaceBranch: Branch;
  readonly shenPalaceBranch: Branch;
  readonly originPalaceBranch: Branch;
  readonly ziweiBranch: Branch;
}

/** 仅导出类型；没有公开构造器、原生句柄或可写事实。 */
export interface Natal {
  readonly profile: Profile;
  readonly zodiac: Zodiac;
  readonly fiveElementBureau: FiveElementBureau;
  /** 首次读取成功后复用同一份深层只读数组；查询不强制访问此属性。 */
  readonly palaces: readonly Palace[];

  palace(branch: Branch): Palace;
  oppositePalace(branch: Branch): Palace;
  /** false 顺序为相对偏移 4、8、6；true 为 0、4、8、6。 */
  sanfangPalaces(branch: Branch, includeSelf: boolean): readonly Palace[];
  sizhengPalaces(branch: Branch): readonly Palace[];
  palaceByName(name: PalaceName): Palace;
  mingPalace(): Palace;
  shenPalace(): Palace;
  originPalace(): Palace;
  ziweiPalace(): Palace;
  palaceByStar(name: StarName): Palace;
  star(name: StarName): Star;
  /** 对应 Rust Palace::star；宫内不存在该星时返回 null。 */
  palaceStar(branch: Branch, name: StarName): Star | null;
  /** 四项，依次 A/B/C/D。 */
  birthTransformations(): readonly LocatedStar[];
  selfTransformations(): readonly LocatedStar[];
  palaceTransformation(sourceBranch: Branch, kind: Transformation): PalaceTransformation;
  palaceTransformations(sourceBranch: Branch): readonly PalaceTransformation[];
  palaceTransformationSources(targetBranch: Branch): readonly PalaceTransformation[];

  /** age 必须为整数 0..255；合法但不在十二大限覆盖区间时返回 null。 */
  periodIndicesAtAge(age: number): PeriodIndices | null;
  decade(index: DecadeIndex): readonly Decade[];
  decadeByBranch(decade: DecadeIndex, branch: Branch): Decade;
  decadePalaceByName(decade: DecadeIndex, name: PalaceName): Palace;
  decadeYears(decade: DecadeIndex): readonly DecadeYear[];
  yearly(decade: DecadeIndex, index: YearlyIndex): readonly Yearly[];
  yearlyByBranch(decade: DecadeIndex, yearly: YearlyIndex, branch: Branch): Yearly;
  yearlyPalaceByName(decade: DecadeIndex, yearly: YearlyIndex, name: PalaceName): Palace;

  /** 同时作为 JSON.stringify 的出口；不含查询方法、句柄或限运预计算结果。 */
  toJSON(): NatalSnapshot;
}

/** 只承载两个同步创建入口的冻结对象；不是可 new 的类。 */
export declare const Ziwei: {
  readonly fromBirth: (birth: Birth) => Natal;
  readonly fromParameters: (parameters: Parameters) => Natal;
};

export type ArgumentFailureReason =
  | 'missing' | 'type' | 'non_finite' | 'non_integer'
  | 'out_of_range' | 'not_member' | 'unknown_field' | 'accessor';

export type ReceivedValue =
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'undefined' | 'null' | 'boolean' | 'string'
      | 'bigint' | 'symbol' | 'function' | 'object' | 'array' | 'unread' };

/** 判别联合：按 detail.code 分支后可精确读取相应载荷。 */
export type ZiweiErrorDetail =
  | { readonly code: 'INVALID_ARGUMENT'; readonly path: readonly string[];
      readonly reason: ArgumentFailureReason; readonly received: ReceivedValue }
  | { readonly code: 'INVALID_SEXAGENARY_YEAR'; readonly stem: Stem; readonly branch: Branch }
  | { readonly code: 'INVALID_LUNISOLAR_MONTH'; readonly value: number }
  | { readonly code: 'INVALID_LUNISOLAR_DAY'; readonly value: number }
  | { readonly code: 'INVALID_DECADE_INDEX'; readonly value: number }
  | { readonly code: 'INVALID_YEARLY_INDEX'; readonly value: number };

export type ZiweiErrorCode = ZiweiErrorDetail['code'];

/** 由适配层抛出；name、code、detail 只读，message 固定为中文。 */
export declare class ZiweiError extends Error {
  private constructor();
  readonly name: 'ZiweiError';
  /** 始终等于 detail.code；需要载荷收窄时使用 detail.code。 */
  readonly code: ZiweiErrorCode;
  readonly detail: ZiweiErrorDetail;
}
