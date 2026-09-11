export type YinYang = 0 | 1;
export type FiveElement = "Water" | "Wood" | "Metal" | "Earth" | "Fire";
export type Gender = 0 | 1;
export type Stem = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Branch = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type Zodiac =
  | "Rat"
  | "Ox"
  | "Tiger"
  | "Rabbit"
  | "Dragon"
  | "Snake"
  | "Horse"
  | "Goat"
  | "Monkey"
  | "Rooster"
  | "Dog"
  | "Pig";
export type FiveElementBureau = 2 | 3 | 4 | 5 | 6;
export type PalaceName =
  | "Ming"
  | "XiongDi"
  | "FuQi"
  | "ZiNv"
  | "CaiBo"
  | "JiE"
  | "QianYi"
  | "JiaoYou"
  | "GuanLu"
  | "TianZhai"
  | "FuDe"
  | "FuMu";
export type StarName =
  | "ZiWei"
  | "TianJi"
  | "TaiYang"
  | "WuQu"
  | "TianTong"
  | "LianZhen"
  | "TianFu"
  | "TaiYin"
  | "TanLang"
  | "JuMen"
  | "TianXiang"
  | "TianLiang"
  | "QiSha"
  | "PoJun"
  | "ZuoFu"
  | "YouBi"
  | "WenChang"
  | "WenQu";
export type StarCategory = "Major" | "Minor" | "Auxiliary";
export type StarGalaxy = "South" | "Central" | "North";
export type Transformation = "A" | "B" | "C" | "D";

type IdentitySet<K extends string> = { readonly [P in K]: P };

/** Fully initialized identity values; no generated binding types are public. */
export interface IdentityRuntime {
  readonly YinYang: Readonly<{ Yin: 0; Yang: 1 }>;
  readonly FiveElement: IdentitySet<FiveElement>;
  readonly Gender: Readonly<{ Female: 0; Male: 1; yinYang(value: Gender): YinYang }>;
  readonly Stem: Readonly<{
    Jia: 0;
    Yi: 1;
    Bing: 2;
    Ding: 3;
    Wu: 4;
    Ji: 5;
    Geng: 6;
    Xin: 7;
    Ren: 8;
    Gui: 9;
    ALL: readonly Stem[];
    yinYang(value: Stem): YinYang;
  }>;
  readonly Branch: Readonly<{
    Zi: 0;
    Chou: 1;
    Yin: 2;
    Mao: 3;
    Chen: 4;
    Si: 5;
    Wu: 6;
    Wei: 7;
    Shen: 8;
    You: 9;
    Xu: 10;
    Hai: 11;
    ALL: readonly Branch[];
    yinYang(value: Branch): YinYang;
    zodiac(value: Branch): Zodiac;
  }>;
  readonly Zodiac: IdentitySet<Zodiac>;
  readonly FiveElementBureau: Readonly<{
    WaterTwo: 2;
    WoodThree: 3;
    MetalFour: 4;
    EarthFive: 5;
    FireSix: 6;
  }>;
  readonly PalaceName: IdentitySet<PalaceName> & Readonly<{ ALL: readonly PalaceName[] }>;
  readonly StarName: IdentitySet<StarName> & Readonly<{ ALL: readonly StarName[] }>;
  readonly StarCategory: IdentitySet<StarCategory>;
  readonly StarGalaxy: IdentitySet<StarGalaxy>;
  readonly Transformation: IdentitySet<Transformation> &
    Readonly<{ ALL: readonly Transformation[] }>;
}

export interface ReadyZiweiRuntime extends IdentityRuntime {
  readonly Ziwei: Readonly<{
    fromBirth(birth: Birth): Natal;
    fromParameters(parameters: Parameters): Natal;
  }>;
}

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

export type BirthMonth = number;
export type BirthDay = number;
/** 零基大限序号，运行时验证 0..11。 */
export type DecadeIndex = number;
/** 大限内零基流年序号，运行时验证 0..9。 */
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

/** 不可变本命事实与同步、按需查询；只能通过 Ziwei 创建。 */
export interface Natal {
  /** 幂等释放 Wasm 命盘；随后所有 getter、查询及 toJSON 都会拒绝调用。 */
  dispose(): void;
  readonly profile: Profile;
  readonly zodiac: Zodiac;
  readonly fiveElementBureau: FiveElementBureau;
  readonly palaces: readonly Palace[];
  palace(branch: Branch): Palace;
  palaceByName(name: PalaceName): Palace;
  palaceByStar(name: StarName): Palace;
  star(name: StarName): Star;
  palaceStar(branch: Branch, name: StarName): Star | null;
  oppositePalace(branch: Branch): Palace;
  sanfangPalaces(branch: Branch, includeSelf: boolean): readonly Palace[];
  sizhengPalaces(branch: Branch): readonly Palace[];
  mingPalace(): Palace;
  shenPalace(): Palace;
  originPalace(): Palace;
  ziweiPalace(): Palace;
  birthTransformations(): readonly LocatedStar[];
  selfTransformations(): readonly LocatedStar[];
  palaceTransformation(sourceBranch: Branch, kind: Transformation): PalaceTransformation;
  palaceTransformations(sourceBranch: Branch): readonly PalaceTransformation[];
  palaceTransformationSources(targetBranch: Branch): readonly PalaceTransformation[];
  periodIndicesAtAge(age: number): PeriodIndices | null;
  decade(index: DecadeIndex): readonly Decade[];
  decadeByBranch(decade: DecadeIndex, branch: Branch): Decade;
  decadePalaceByName(decade: DecadeIndex, name: PalaceName): Palace;
  decadeYears(decade: DecadeIndex): readonly DecadeYear[];
  yearly(decade: DecadeIndex, index: YearlyIndex): readonly Yearly[];
  yearlyByBranch(decade: DecadeIndex, yearly: YearlyIndex, branch: Branch): Yearly;
  yearlyPalaceByName(decade: DecadeIndex, yearly: YearlyIndex, name: PalaceName): Palace;
  toJSON(): NatalSnapshot;
}

export interface NatalSnapshot {
  readonly profile: Profile;
  readonly zodiac: Zodiac;
  readonly fiveElementBureau: FiveElementBureau;
  readonly palaces: readonly Palace[];
  readonly mingPalaceBranch: Branch;
  readonly shenPalaceBranch: Branch;
  readonly originPalaceBranch: Branch;
  readonly ziweiBranch: Branch;
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
