#![forbid(unsafe_code)]

//! 紫微斗数排盘的 Rust 领域内核。
//!
//! 通过 [`Ziwei::from_birth`] 或 [`Ziwei::from_parameters`] 创建本命盘。
//! 通过 [`Natal::decade`]、[`Natal::decade_years`] 与 [`Natal::yearly`]
//! 按需生成大限宫职、年度摘要及流年宫职。
//! 历法换算由调用方处理，不提前暴露占位实现。

mod domain;
mod error;
mod rules;
mod ziwei;

pub use domain::{
    Birth, BirthDay, BirthMonth, Branch, Decade, DecadeAgeRange, DecadeIndex, DecadeYear,
    FiveElement, FiveElementBureau, Gender, Natal, Palace, PalaceName, PalaceTransformation,
    Parameters, Profile, SelfTransformations, Star, StarCategory, StarGalaxy, StarName, Stem,
    Transformation, Yearly, YearlyIndex, YinYang, Zodiac,
};
pub use error::ZiweiError;
pub use ziwei::Ziwei;
