//! Validate JavaScript primitives before any narrowing or core construction.

use wasm_bindgen::prelude::*;
use ziwei::{Branch, Gender, PalaceName, StarName, Stem, Transformation};

use crate::error::{BindingError, Failure};
use crate::wire::{palace_name, star_name, transformation};

#[wasm_bindgen]
extern "C" {
    // Array.isArray throws for a revoked Proxy. Catch at the import so Rust
    // guards are dropped normally and the original JavaScript exception survives.
    #[wasm_bindgen(catch, js_namespace = Array, js_name = isArray)]
    fn is_array(value: &JsValue) -> Result<bool, JsValue>;
}

fn received_type(value: &JsValue) -> Result<&'static str, JsValue> {
    Ok(if value.is_null() {
        "null"
    } else if value.is_undefined() {
        "undefined"
    } else if value.is_string() {
        "string"
    } else if value.is_symbol() {
        "symbol"
    } else if value.is_bigint() {
        "bigint"
    } else if value.is_function() {
        "function"
    } else if value.as_bool().is_some() {
        "boolean"
    } else if value.as_f64().is_some() {
        "number"
    } else if is_array(value)? {
        "array"
    } else {
        "object"
    })
}

fn wrong_type(value: &JsValue, path: &'static str) -> BindingError {
    match received_type(value) {
        Ok(received) => Failure::argument(path, "type", received, value.as_f64()).into(),
        Err(error) => error.into(),
    }
}

fn number(value: f64, min: f64, max: f64) -> Result<f64, &'static str> {
    if !value.is_finite() {
        Err("non_finite")
    } else if value.fract() != 0.0 {
        Err("non_integer")
    } else if !(min..=max).contains(&value) {
        Err("out_of_range")
    } else {
        Ok(value)
    }
}

fn integer(value: &JsValue, path: &'static str, min: f64, max: f64) -> Result<f64, BindingError> {
    // as_f64 only accepts a primitive Number, with no JavaScript coercion.
    let raw = value.as_f64().ok_or_else(|| wrong_type(value, path))?;
    number(raw, min, max)
        .map_err(|reason| Failure::argument(path, reason, "number", Some(raw)).into())
}

fn member<T: Copy>(
    value: &JsValue,
    path: &'static str,
    members: &[T],
    name: impl Fn(T) -> &'static str,
) -> Result<T, BindingError> {
    let text = value.as_string().ok_or_else(|| wrong_type(value, path))?;
    members
        .iter()
        .copied()
        .find(|value| name(*value) == text)
        .ok_or_else(|| Failure::argument(path, "not_member", "string", None).into())
}

pub fn palace(value: &JsValue) -> Result<PalaceName, BindingError> {
    member(value, "name", &PalaceName::ALL, palace_name)
}

pub fn star(value: &JsValue) -> Result<StarName, BindingError> {
    member(value, "name", &StarName::ALL, star_name)
}

pub fn kind(value: &JsValue) -> Result<Transformation, BindingError> {
    member(value, "kind", &Transformation::ALL, transformation)
}

pub fn boolean(value: &JsValue, path: &'static str) -> Result<bool, BindingError> {
    value.as_bool().ok_or_else(|| wrong_type(value, path))
}

pub fn year(value: &JsValue) -> Result<i32, BindingError> {
    Ok(integer(value, "birthYear", f64::from(i32::MIN), f64::from(i32::MAX))? as i32)
}

pub fn byte(value: &JsValue, path: &'static str) -> Result<u8, BindingError> {
    Ok(integer(value, path, 0.0, f64::from(u8::MAX))? as u8)
}

pub fn gender(value: &JsValue, path: &'static str) -> Result<Gender, BindingError> {
    match integer(value, path, 0.0, 1.0)? as u8 {
        0 => Ok(Gender::Female),
        _ => Ok(Gender::Male),
    }
}

pub fn stem(value: &JsValue, path: &'static str) -> Result<Stem, BindingError> {
    Ok(Stem::ALL[integer(value, path, 0.0, 9.0)? as usize])
}

pub fn branch(value: &JsValue, path: &'static str) -> Result<Branch, BindingError> {
    Ok(Branch::ALL[integer(value, path, 0.0, 11.0)? as usize])
}

pub fn decade(value: &JsValue, path: &'static str) -> Result<ziwei::DecadeIndex, BindingError> {
    Ok(ziwei::DecadeIndex::try_from(byte(value, path)?)?)
}

pub fn yearly(value: &JsValue, path: &'static str) -> Result<ziwei::YearlyIndex, BindingError> {
    Ok(ziwei::YearlyIndex::try_from(byte(value, path)?)?)
}

#[cfg(test)]
mod tests {
    use super::number;

    #[test]
    fn integer_validation_precedes_narrowing() {
        assert_eq!(number(0.0, 0.0, 255.0), Ok(0.0));
        assert_eq!(number(-0.0, 0.0, 255.0), Ok(-0.0));
        assert_eq!(number(255.0, 0.0, 255.0), Ok(255.0));
        for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert_eq!(number(value, 0.0, 255.0), Err("non_finite"));
        }
        for value in [-0.5, 1.5, 255.5] {
            assert_eq!(number(value, 0.0, 255.0), Err("non_integer"));
        }
        for value in [-1.0, 256.0, 4_294_967_296.0] {
            assert_eq!(number(value, 0.0, 255.0), Err("out_of_range"));
        }
    }

    #[test]
    fn full_signed_birth_year_range_is_preserved() {
        let min = f64::from(i32::MIN);
        let max = f64::from(i32::MAX);
        for value in [min, -1.0, 0.0, 1.0, max] {
            assert_eq!(number(value, min, max), Ok(value));
        }
        assert_eq!(number(min - 1.0, min, max), Err("out_of_range"));
        assert_eq!(number(max + 1.0, min, max), Err("out_of_range"));
    }
}
