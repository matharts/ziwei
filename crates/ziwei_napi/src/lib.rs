//! Node-API adapter; chart rules remain in the ziwei core crate.

mod error;
mod input;
mod natal;

use napi::{
    Env,
    bindgen_prelude::{Either, Unknown},
};
use napi_derive::napi;
use ziwei::{Birth, BirthDay, BirthMonth, Parameters, Ziwei};

use error::{NativeFailure, checked};
use natal::{NativeConstruction, finish};
use natal::{NativePalaceName, NativeStarName, NativeTransformation, NativeZodiac};

#[napi]
pub enum NativeYinYang {
    Yin = 0,
    Yang = 1,
}

impl From<ziwei::YinYang> for NativeYinYang {
    fn from(value: ziwei::YinYang) -> Self {
        match value {
            ziwei::YinYang::Yin => Self::Yin,
            ziwei::YinYang::Yang => Self::Yang,
        }
    }
}

/// Identity catalog only; no chart or query state is initialized at import.
#[napi(object, object_from_js = false)]
pub struct NativeIdentities {
    #[napi(ts_type = "Array<0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9>")]
    pub stems: Vec<u32>,
    #[napi(ts_type = "Array<0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11>")]
    pub branches: Vec<u32>,
    pub palaces: Vec<NativePalaceName>,
    pub stars: Vec<NativeStarName>,
    pub transformations: Vec<NativeTransformation>,
}

#[napi]
pub fn identities() -> NativeIdentities {
    NativeIdentities {
        stems: ziwei::Stem::ALL.map(|v| u32::from(v.index())).to_vec(),
        branches: ziwei::Branch::ALL.map(|v| u32::from(v.index())).to_vec(),
        palaces: ziwei::PalaceName::ALL.into_iter().map(Into::into).collect(),
        stars: ziwei::StarName::ALL.into_iter().map(Into::into).collect(),
        transformations: ziwei::Transformation::ALL
            .into_iter()
            .map(Into::into)
            .collect(),
    }
}

#[napi]
pub fn gender_yin_yang(value: Unknown<'_>) -> napi::Result<Either<NativeYinYang, NativeFailure>> {
    checked(input::gender_at(value, "value").map(|v| v.yin_yang().into()))
}

#[napi]
pub fn stem_yin_yang(value: Unknown<'_>) -> napi::Result<Either<NativeYinYang, NativeFailure>> {
    checked(input::stem_at(value, "value").map(|v| v.yin_yang().into()))
}

#[napi]
pub fn branch_yin_yang(value: Unknown<'_>) -> napi::Result<Either<NativeYinYang, NativeFailure>> {
    checked(input::branch(value, "value").map(|v| v.yin_yang().into()))
}

#[napi]
pub fn branch_zodiac(value: Unknown<'_>) -> napi::Result<Either<NativeZodiac, NativeFailure>> {
    checked(input::branch(value, "value").map(|v| v.zodiac().into()))
}

#[napi]
pub fn from_birth<'env>(
    env: &'env Env,
    gender: Unknown<'env>,
    birth_year: Unknown<'env>,
    birth_month: Unknown<'env>,
    birth_day: Unknown<'env>,
    birth_hour: Unknown<'env>,
) -> napi::Result<NativeConstruction<'env>> {
    finish(
        env,
        (|| {
            let gender = input::gender(gender)?;
            let birth_year = input::year(birth_year)?;
            let birth_month = BirthMonth::try_from(input::byte(birth_month, "birthMonth")?)?;
            let birth_day = BirthDay::try_from(input::byte(birth_day, "birthDay")?)?;
            let birth_hour = input::branch(birth_hour, "birthHour")?;
            Ok(Ziwei::from_birth(Birth {
                gender,
                birth_year,
                birth_month,
                birth_day,
                birth_hour,
            })?)
        })(),
    )
}

#[napi]
pub fn from_parameters<'env>(
    env: &'env Env,
    gender: Unknown<'env>,
    birth_stem: Unknown<'env>,
    birth_branch: Unknown<'env>,
    birth_month: Unknown<'env>,
    ziwei_branch: Unknown<'env>,
    birth_hour: Unknown<'env>,
) -> napi::Result<NativeConstruction<'env>> {
    finish(
        env,
        (|| {
            let gender = input::gender(gender)?;
            let birth_stem = input::stem(birth_stem)?;
            let birth_branch = input::branch(birth_branch, "birthBranch")?;
            let birth_month = BirthMonth::try_from(input::byte(birth_month, "birthMonth")?)?;
            let ziwei_branch = input::branch(ziwei_branch, "ziweiBranch")?;
            let birth_hour = input::branch(birth_hour, "birthHour")?;
            let parameters = Parameters::new(
                gender,
                birth_stem,
                birth_branch,
                birth_month,
                ziwei_branch,
                birth_hour,
            )?;
            Ok(Ziwei::from_parameters(parameters)?)
        })(),
    )
}
