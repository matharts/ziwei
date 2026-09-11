//! Private JavaScript projections, shared only inside this adapter.

use js_sys::{Array, Object};
use wasm_bindgen::prelude::*;

pub type JsResult = Result<JsValue, JsValue>;

/// Define data properties without invoking inherited setters on the result.
pub fn record<const N: usize>(fields: [(&str, JsValue); N]) -> JsResult {
    let entries = Array::new();
    for (key, value) in fields {
        let entry = Array::new();
        entry.push(&JsValue::from_str(key));
        entry.push(&value);
        entries.push(&entry);
    }
    Object::from_entries(&entries).map(Into::into)
}

pub fn array(values: impl IntoIterator<Item = JsResult>) -> JsResult {
    let result = Array::new();
    for value in values {
        result.push(&value?);
    }
    Ok(result.into())
}

fn tuple<const N: usize>(values: [JsValue; N]) -> JsValue {
    let result = Array::new();
    for value in values {
        result.push(&value);
    }
    result.into()
}

pub fn nullable<T: Into<JsValue>>(value: Option<T>) -> JsValue {
    value.map_or(JsValue::NULL, Into::into)
}

// These explicit protocol mappings deliberately do not depend on Debug or enum layout.
pub fn palace_name(value: ziwei::PalaceName) -> &'static str {
    use ziwei::PalaceName::*;
    match value {
        Ming => "Ming",
        XiongDi => "XiongDi",
        FuQi => "FuQi",
        ZiNv => "ZiNv",
        CaiBo => "CaiBo",
        JiE => "JiE",
        QianYi => "QianYi",
        JiaoYou => "JiaoYou",
        GuanLu => "GuanLu",
        TianZhai => "TianZhai",
        FuDe => "FuDe",
        FuMu => "FuMu",
    }
}

pub fn star_name(value: ziwei::StarName) -> &'static str {
    use ziwei::StarName::*;
    match value {
        ZiWei => "ZiWei",
        TianJi => "TianJi",
        TaiYang => "TaiYang",
        WuQu => "WuQu",
        TianTong => "TianTong",
        LianZhen => "LianZhen",
        TianFu => "TianFu",
        TaiYin => "TaiYin",
        TanLang => "TanLang",
        JuMen => "JuMen",
        TianXiang => "TianXiang",
        TianLiang => "TianLiang",
        QiSha => "QiSha",
        PoJun => "PoJun",
        ZuoFu => "ZuoFu",
        YouBi => "YouBi",
        WenChang => "WenChang",
        WenQu => "WenQu",
    }
}

pub fn transformation(value: ziwei::Transformation) -> &'static str {
    use ziwei::Transformation::*;
    match value {
        A => "A",
        B => "B",
        C => "C",
        D => "D",
    }
}

pub fn zodiac(value: ziwei::Zodiac) -> &'static str {
    use ziwei::Zodiac::*;
    match value {
        Rat => "Rat",
        Ox => "Ox",
        Tiger => "Tiger",
        Rabbit => "Rabbit",
        Dragon => "Dragon",
        Snake => "Snake",
        Horse => "Horse",
        Goat => "Goat",
        Monkey => "Monkey",
        Rooster => "Rooster",
        Dog => "Dog",
        Pig => "Pig",
    }
}

pub fn bureau(value: ziwei::FiveElementBureau) -> u8 {
    use ziwei::FiveElementBureau::*;
    match value {
        WaterTwo => 2,
        WoodThree => 3,
        MetalFour => 4,
        EarthFive => 5,
        FireSix => 6,
    }
}

pub fn yin_yang(value: ziwei::YinYang) -> u8 {
    match value {
        ziwei::YinYang::Yin => 0,
        ziwei::YinYang::Yang => 1,
    }
}

pub fn star(value: &ziwei::Star) -> JsValue {
    let category = match value.category() {
        ziwei::StarCategory::Major => "Major",
        ziwei::StarCategory::Minor => "Minor",
        ziwei::StarCategory::Auxiliary => "Auxiliary",
    };
    let galaxy = match value.galaxy() {
        ziwei::StarGalaxy::South => "South",
        ziwei::StarGalaxy::Central => "Central",
        ziwei::StarGalaxy::North => "North",
    };
    let self_transformations = value.self_transformations();
    tuple([
        star_name(value.name()).into(),
        value.name_hans().into(),
        value.name_hant().into(),
        value.abbr_hans().into(),
        value.abbr_hant().into(),
        category.into(),
        galaxy.into(),
        nullable(value.birth_transformation().map(transformation)),
        nullable(self_transformations.inward().map(transformation)),
        nullable(self_transformations.outward().map(transformation)),
    ])
}

pub fn palace(value: &ziwei::Palace) -> JsResult {
    let age = value.decade_age_range();
    Ok(tuple([
        palace_name(value.name()).into(),
        value.name_hans().into(),
        value.name_hant().into(),
        value.branch().index().into(),
        value.stem().index().into(),
        array(value.stars().iter().map(|value| Ok(star(value))))?,
        tuple([age.start().into(), age.end().into()]),
    ]))
}

pub fn located_star((palace_value, star_value): (&ziwei::Palace, &ziwei::Star)) -> JsResult {
    record([
        ("palace", palace(palace_value)?),
        ("star", star(star_value)),
    ])
}

pub fn relation(value: ziwei::PalaceTransformation) -> JsResult {
    record([
        ("sourceBranch", value.source_branch().index().into()),
        ("targetBranch", value.target_branch().index().into()),
        (
            "transformation",
            transformation(value.transformation()).into(),
        ),
        ("star", star_name(value.star()).into()),
    ])
}

fn period(name: ziwei::PalaceName, name_hans: &str, name_hant: &str) -> JsResult {
    record([
        ("name", palace_name(name).into()),
        ("nameHans", name_hans.into()),
        ("nameHant", name_hant.into()),
    ])
}

pub fn decade(value: ziwei::Decade) -> JsResult {
    period(value.name(), value.name_hans(), value.name_hant())
}

pub fn yearly(value: ziwei::Yearly) -> JsResult {
    period(value.name(), value.name_hans(), value.name_hant())
}

fn exact_year(value: i64) -> Result<f64, &'static str> {
    if !(-9_007_199_254_740_991..=9_007_199_254_740_991).contains(&value) {
        return Err("原生年份超出 JavaScript 安全整数范围");
    }
    Ok(value as f64)
}

pub fn decade_year(value: ziwei::DecadeYear) -> JsResult {
    let year = value
        .year()
        .map(exact_year)
        .transpose()
        .map_err(|message| JsValue::from(js_sys::Error::new(message)))?;
    record([("age", value.age().into()), ("year", nullable(year))])
}

pub fn profile(value: &ziwei::Profile) -> JsResult {
    let gender: u8 = match value.gender() {
        ziwei::Gender::Female => 0,
        ziwei::Gender::Male => 1,
    };
    record([
        ("gender", gender.into()),
        ("birthYear", nullable(value.birth_year())),
        ("birthStem", value.birth_stem().index().into()),
        ("birthBranch", value.birth_branch().index().into()),
        ("birthMonth", value.birth_month().get().into()),
        ("birthDay", nullable(value.birth_day().map(|day| day.get()))),
        ("birthHour", value.birth_hour().index().into()),
    ])
}

#[wasm_bindgen(typescript_custom_section)]
const TYPES: &str = r#"
export type NativeYinYang = 0 | 1;
export type NativeStem = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type NativeBranch = NativeStem | 10 | 11;
export type NativeFiveElementBureau = 2 | 3 | 4 | 5 | 6;
export type NativeZodiac = 'Rat' | 'Ox' | 'Tiger' | 'Rabbit' | 'Dragon' | 'Snake' | 'Horse' | 'Goat' | 'Monkey' | 'Rooster' | 'Dog' | 'Pig';
export type NativePalaceName = 'Ming' | 'XiongDi' | 'FuQi' | 'ZiNv' | 'CaiBo' | 'JiE' | 'QianYi' | 'JiaoYou' | 'GuanLu' | 'TianZhai' | 'FuDe' | 'FuMu';
export type NativeStarName = 'ZiWei' | 'TianJi' | 'TaiYang' | 'WuQu' | 'TianTong' | 'LianZhen' | 'TianFu' | 'TaiYin' | 'TanLang' | 'JuMen' | 'TianXiang' | 'TianLiang' | 'QiSha' | 'PoJun' | 'ZuoFu' | 'YouBi' | 'WenChang' | 'WenQu';
export type NativeStarCategory = 'Major' | 'Minor' | 'Auxiliary';
export type NativeStarGalaxy = 'South' | 'Central' | 'North';
export type NativeTransformation = 'A' | 'B' | 'C' | 'D';
export type NativeStar = [NativeStarName, string, string, string, string, NativeStarCategory, NativeStarGalaxy, NativeTransformation | null, NativeTransformation | null, NativeTransformation | null];
export type NativePalace = [NativePalaceName, string, string, NativeBranch, NativeStem, NativeStar[], [number, number]];
export interface NativeLocatedStar { palace: NativePalace; star: NativeStar }
export interface NativePalaceTransformation { sourceBranch: NativeBranch; targetBranch: NativeBranch; transformation: NativeTransformation; star: NativeStarName }
export interface NativePeriodPalace { name: NativePalaceName; nameHans: string; nameHant: string }
export interface NativeDecadeYear { age: number; year: number | null }
export interface NativePeriodIndices { decade: number; yearly: number }
export interface NativeProfile { gender: 0 | 1; birthYear: number | null; birthStem: NativeStem; birthBranch: NativeBranch; birthMonth: number; birthDay: number | null; birthHour: NativeBranch }
export interface NativeSnapshotLocations { mingPalaceBranch: NativeBranch; shenPalaceBranch: NativeBranch; originPalaceBranch: NativeBranch; ziweiBranch: NativeBranch }
export interface NativeIdentities { stems: NativeStem[]; branches: NativeBranch[]; palaces: NativePalaceName[]; stars: NativeStarName[]; transformations: NativeTransformation[] }
export interface NativeFailure { code: string; message: string; path: string | null; reason: string | null; receivedType: string | null; value: number | null; stem: NativeStem | null; branch: NativeBranch | null }
export type NativeConstruction = { natal: NativeNatal; error: null } | { natal: null; error: NativeFailure };
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numeric_year_projection_checks_js_precision_without_i32_narrowing() {
        assert_eq!(exact_year(2_147_483_771), Ok(2_147_483_771.0));
        assert_eq!(exact_year(i64::from(i32::MIN)), Ok(f64::from(i32::MIN)));
        assert_eq!(
            exact_year(9_007_199_254_740_991),
            Ok(9_007_199_254_740_991.0)
        );
        assert!(exact_year(9_007_199_254_740_992).is_err());
        assert!(exact_year(-9_007_199_254_740_992).is_err());
    }

    #[test]
    fn protocol_names_are_unique_and_keep_core_order() {
        let palaces = ziwei::PalaceName::ALL.map(palace_name);
        assert_eq!(palaces[0], "Ming");
        assert_eq!(palaces[3], "ZiNv");
        assert_eq!(palaces[11], "FuMu");
        let stars = ziwei::StarName::ALL.map(star_name);
        assert_eq!(stars[0], "ZiWei");
        assert_eq!(stars[17], "WenQu");
        for (i, name) in stars.iter().enumerate() {
            assert!(!stars[..i].contains(name));
        }
        assert_eq!(
            ziwei::Transformation::ALL.map(transformation),
            ["A", "B", "C", "D"]
        );
    }
}
