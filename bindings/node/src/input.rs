use napi::{JsValue, ValueType, bindgen_prelude::Unknown};
use ziwei::{Branch, Gender, PalaceName, StarName, Stem, Transformation};

use crate::error::{BindingError, NativeFailure};

/// Read only primitive numbers; never narrow or coerce user objects before validation.
fn integer(value: Unknown<'_>, path: &str, min: f64, max: f64) -> Result<f64, BindingError> {
    expect_type(&value, ValueType::Number, path)?;
    // Type checked above: this cannot invoke object coercion or convert a string.
    let number = value.coerce_to_number()?.get_double()?;
    let reason = if !number.is_finite() {
        Some("non_finite")
    } else if number.fract() != 0.0 {
        Some("non_integer")
    } else if !(min..=max).contains(&number) {
        Some("out_of_range")
    } else {
        None
    };
    if let Some(reason) = reason {
        return Err(NativeFailure::argument(path, reason, "number", Some(number)).into());
    }
    Ok(number)
}

fn expect_type(value: &Unknown<'_>, expected: ValueType, path: &str) -> Result<(), BindingError> {
    let value_type = value.get_type()?;
    if value_type != expected {
        let received = match value_type {
            ValueType::Undefined => "undefined",
            ValueType::Null => "null",
            ValueType::Boolean => "boolean",
            ValueType::String => "string",
            ValueType::Symbol => "symbol",
            ValueType::Function => "function",
            ValueType::BigInt => "bigint",
            ValueType::Number => "number",
            ValueType::Object if value.is_array()? => "array",
            _ => "object",
        };
        let number = if value_type == ValueType::Number {
            Some(value.coerce_to_number()?.get_double()?)
        } else {
            None
        };
        return Err(NativeFailure::argument(path, "type", received, number).into());
    }
    Ok(())
}

fn member<T: Copy>(
    value: Unknown<'_>,
    path: &str,
    members: &[(&str, T)],
) -> Result<T, BindingError> {
    expect_type(&value, ValueType::String, path)?;
    let text = value.coerce_to_string()?.into_utf8()?;
    let text = text.as_str()?;
    members
        .iter()
        .find_map(|(name, value)| (*name == text).then_some(*value))
        .ok_or_else(|| NativeFailure::argument(path, "not_member", "string", None).into())
}

pub fn palace_name(value: Unknown<'_>) -> Result<PalaceName, BindingError> {
    use PalaceName::*;
    member(
        value,
        "name",
        &[
            ("Ming", Ming),
            ("XiongDi", XiongDi),
            ("FuQi", FuQi),
            ("ZiNv", ZiNv),
            ("CaiBo", CaiBo),
            ("JiE", JiE),
            ("QianYi", QianYi),
            ("JiaoYou", JiaoYou),
            ("GuanLu", GuanLu),
            ("TianZhai", TianZhai),
            ("FuDe", FuDe),
            ("FuMu", FuMu),
        ],
    )
}

pub fn star_name(value: Unknown<'_>) -> Result<StarName, BindingError> {
    use StarName::*;
    member(
        value,
        "name",
        &[
            ("ZiWei", ZiWei),
            ("TianJi", TianJi),
            ("TaiYang", TaiYang),
            ("WuQu", WuQu),
            ("TianTong", TianTong),
            ("LianZhen", LianZhen),
            ("TianFu", TianFu),
            ("TaiYin", TaiYin),
            ("TanLang", TanLang),
            ("JuMen", JuMen),
            ("TianXiang", TianXiang),
            ("TianLiang", TianLiang),
            ("QiSha", QiSha),
            ("PoJun", PoJun),
            ("ZuoFu", ZuoFu),
            ("YouBi", YouBi),
            ("WenChang", WenChang),
            ("WenQu", WenQu),
        ],
    )
}

pub fn transformation(value: Unknown<'_>) -> Result<Transformation, BindingError> {
    use Transformation::*;
    member(value, "kind", &[("A", A), ("B", B), ("C", C), ("D", D)])
}

pub fn boolean(value: Unknown<'_>, path: &str) -> Result<bool, BindingError> {
    expect_type(&value, ValueType::Boolean, path)?;
    Ok(value.coerce_to_bool()?)
}

pub fn year(value: Unknown<'_>) -> Result<i32, BindingError> {
    // Finite, integral and in i32 range before the only narrowing operation.
    Ok(integer(value, "birthYear", f64::from(i32::MIN), f64::from(i32::MAX))? as i32)
}

pub fn byte(value: Unknown<'_>, path: &str) -> Result<u8, BindingError> {
    Ok(integer(value, path, 0.0, f64::from(u8::MAX))? as u8)
}

pub fn gender(value: Unknown<'_>) -> Result<Gender, BindingError> {
    gender_at(value, "gender")
}

pub fn gender_at(value: Unknown<'_>, path: &str) -> Result<Gender, BindingError> {
    match integer(value, path, 0.0, 1.0)? as u8 {
        0 => Ok(Gender::Female),
        _ => Ok(Gender::Male),
    }
}

pub fn stem(value: Unknown<'_>) -> Result<Stem, BindingError> {
    stem_at(value, "birthStem")
}

pub fn stem_at(value: Unknown<'_>, path: &str) -> Result<Stem, BindingError> {
    // ALL is the core's public, documented Jia-first order, not its enum layout.
    Ok(Stem::ALL[integer(value, path, 0.0, 9.0)? as usize])
}

pub fn branch(value: Unknown<'_>, path: &str) -> Result<Branch, BindingError> {
    Ok(Branch::ALL[integer(value, path, 0.0, 11.0)? as usize])
}

pub fn decade(value: Unknown<'_>, path: &str) -> Result<ziwei::DecadeIndex, BindingError> {
    Ok(ziwei::DecadeIndex::try_from(byte(value, path)?)?)
}

pub fn yearly(value: Unknown<'_>, path: &str) -> Result<ziwei::YearlyIndex, BindingError> {
    Ok(ziwei::YearlyIndex::try_from(byte(value, path)?)?)
}
