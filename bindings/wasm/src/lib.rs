//! Single-threaded WebAssembly adapter; all chart rules remain in `ziwei`.

mod error;
mod input;
mod natal;
mod wire;

use wasm_bindgen::prelude::*;
use ziwei::{Birth, BirthDay, BirthMonth, Parameters, Ziwei};

use error::{BindingError, checked};
pub use natal::NativeNatal;
use wire::{JsResult, array, record};

#[wasm_bindgen(unchecked_return_type = "NativeIdentities")]
pub fn identities() -> JsResult {
    record([
        (
            "stems",
            array(ziwei::Stem::ALL.map(|v| Ok(v.index().into())))?,
        ),
        (
            "branches",
            array(ziwei::Branch::ALL.map(|v| Ok(v.index().into())))?,
        ),
        (
            "palaces",
            array(ziwei::PalaceName::ALL.map(|v| Ok(wire::palace_name(v).into())))?,
        ),
        (
            "stars",
            array(ziwei::StarName::ALL.map(|v| Ok(wire::star_name(v).into())))?,
        ),
        (
            "transformations",
            array(ziwei::Transformation::ALL.map(|v| Ok(wire::transformation(v).into())))?,
        ),
    ])
}

#[wasm_bindgen(js_name = genderYinYang, unchecked_return_type = "NativeYinYang | NativeFailure")]
pub fn gender_yin_yang(
    #[wasm_bindgen(unchecked_param_type = "unknown")] value: JsValue,
) -> JsResult {
    checked(input::gender(&value, "value").map(|v| wire::yin_yang(v.yin_yang()).into()))
}

#[wasm_bindgen(js_name = stemYinYang, unchecked_return_type = "NativeYinYang | NativeFailure")]
pub fn stem_yin_yang(#[wasm_bindgen(unchecked_param_type = "unknown")] value: JsValue) -> JsResult {
    checked(input::stem(&value, "value").map(|v| wire::yin_yang(v.yin_yang()).into()))
}

#[wasm_bindgen(js_name = branchYinYang, unchecked_return_type = "NativeYinYang | NativeFailure")]
pub fn branch_yin_yang(
    #[wasm_bindgen(unchecked_param_type = "unknown")] value: JsValue,
) -> JsResult {
    checked(input::branch(&value, "value").map(|v| wire::yin_yang(v.yin_yang()).into()))
}

#[wasm_bindgen(js_name = branchZodiac, unchecked_return_type = "NativeZodiac | NativeFailure")]
pub fn branch_zodiac(#[wasm_bindgen(unchecked_param_type = "unknown")] value: JsValue) -> JsResult {
    checked(input::branch(&value, "value").map(|v| wire::zodiac(v.zodiac()).into()))
}

#[wasm_bindgen(js_name = fromBirth, unchecked_return_type = "NativeConstruction")]
pub fn from_birth(
    #[wasm_bindgen(unchecked_param_type = "unknown")] gender: JsValue,
    #[wasm_bindgen(unchecked_param_type = "unknown")] birth_year: JsValue,
    #[wasm_bindgen(unchecked_param_type = "unknown")] birth_month: JsValue,
    #[wasm_bindgen(unchecked_param_type = "unknown")] birth_day: JsValue,
    #[wasm_bindgen(unchecked_param_type = "unknown")] birth_hour: JsValue,
) -> JsResult {
    finish((|| {
        let gender = input::gender(&gender, "gender")?;
        let birth_year = input::year(&birth_year)?;
        let birth_month = BirthMonth::try_from(input::byte(&birth_month, "birthMonth")?)?;
        let birth_day = BirthDay::try_from(input::byte(&birth_day, "birthDay")?)?;
        let birth_hour = input::branch(&birth_hour, "birthHour")?;
        Ok(Ziwei::from_birth(Birth {
            gender,
            birth_year,
            birth_month,
            birth_day,
            birth_hour,
        })?)
    })())
}

#[wasm_bindgen(js_name = fromParameters, unchecked_return_type = "NativeConstruction")]
pub fn from_parameters(
    #[wasm_bindgen(unchecked_param_type = "unknown")] gender: JsValue,
    #[wasm_bindgen(unchecked_param_type = "unknown")] birth_stem: JsValue,
    #[wasm_bindgen(unchecked_param_type = "unknown")] birth_branch: JsValue,
    #[wasm_bindgen(unchecked_param_type = "unknown")] birth_month: JsValue,
    #[wasm_bindgen(unchecked_param_type = "unknown")] ziwei_branch: JsValue,
    #[wasm_bindgen(unchecked_param_type = "unknown")] birth_hour: JsValue,
) -> JsResult {
    finish((|| {
        let gender = input::gender(&gender, "gender")?;
        let birth_stem = input::stem(&birth_stem, "birthStem")?;
        let birth_branch = input::branch(&birth_branch, "birthBranch")?;
        let birth_month = BirthMonth::try_from(input::byte(&birth_month, "birthMonth")?)?;
        let ziwei_branch = input::branch(&ziwei_branch, "ziweiBranch")?;
        let birth_hour = input::branch(&birth_hour, "birthHour")?;
        let parameters = Parameters::new(
            gender,
            birth_stem,
            birth_branch,
            birth_month,
            ziwei_branch,
            birth_hour,
        )?;
        Ok(Ziwei::from_parameters(parameters)?)
    })())
}

fn finish(result: Result<ziwei::Natal, BindingError>) -> JsResult {
    match result {
        Ok(inner) => record([
            ("natal", NativeNatal::new(inner).into()),
            ("error", JsValue::NULL),
        ]),
        Err(BindingError::Expected(error)) => {
            record([("natal", JsValue::NULL), ("error", error.into_js()?)])
        }
        Err(BindingError::Unexpected(error)) => Err(error),
    }
}
