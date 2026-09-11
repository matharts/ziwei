//! Expected failures are data; JavaScript exceptions retain their identity.

use wasm_bindgen::JsValue;
use ziwei::ZiweiError;

use crate::wire::{JsResult, nullable, record};

pub enum BindingError {
    Expected(Box<Failure>),
    Unexpected(JsValue),
}

pub struct Failure {
    code: &'static str,
    message: String,
    path: Option<&'static str>,
    reason: Option<&'static str>,
    received_type: Option<&'static str>,
    value: Option<f64>,
    stem: Option<u8>,
    branch: Option<u8>,
}

impl Failure {
    fn new(code: &'static str, message: String) -> Self {
        Self {
            code,
            message,
            path: None,
            reason: None,
            received_type: None,
            value: None,
            stem: None,
            branch: None,
        }
    }

    pub fn argument(
        path: &'static str,
        reason: &'static str,
        received_type: &'static str,
        value: Option<f64>,
    ) -> Self {
        let mut result = Self::new("INVALID_ARGUMENT", format!("参数 {path} 无效"));
        result.path = Some(path);
        result.reason = Some(reason);
        result.received_type = Some(received_type);
        result.value = value;
        result
    }

    pub fn into_js(self) -> JsResult {
        record([
            ("code", self.code.into()),
            ("message", self.message.into()),
            ("path", nullable(self.path)),
            ("reason", nullable(self.reason)),
            ("receivedType", nullable(self.received_type)),
            ("value", nullable(self.value)),
            ("stem", nullable(self.stem)),
            ("branch", nullable(self.branch)),
        ])
    }
}

pub fn checked(result: Result<JsValue, BindingError>) -> JsResult {
    match result {
        Ok(value) => Ok(value),
        Err(BindingError::Expected(error)) => error.into_js(),
        Err(BindingError::Unexpected(error)) => Err(error),
    }
}

impl From<JsValue> for BindingError {
    fn from(value: JsValue) -> Self {
        Self::Unexpected(value)
    }
}

impl From<Failure> for BindingError {
    fn from(value: Failure) -> Self {
        Self::Expected(Box::new(value))
    }
}

impl From<ZiweiError> for BindingError {
    fn from(error: ZiweiError) -> Self {
        let (code, value) = match error {
            ZiweiError::InvalidSexagenaryYear { stem, branch } => {
                let mut failure = Failure::new("INVALID_SEXAGENARY_YEAR", error.to_string());
                failure.stem = Some(stem.index());
                failure.branch = Some(branch.index());
                return failure.into();
            }
            ZiweiError::InvalidLunisolarMonth { value } => ("INVALID_LUNISOLAR_MONTH", value),
            ZiweiError::InvalidLunisolarDay { value } => ("INVALID_LUNISOLAR_DAY", value),
            ZiweiError::InvalidDecadeIndex { value } => ("INVALID_DECADE_INDEX", value),
            ZiweiError::InvalidYearlyIndex { value } => ("INVALID_YEARLY_INDEX", value),
        };
        let mut failure = Failure::new(code, error.to_string());
        failure.value = Some(f64::from(value));
        failure.into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_core_failure_variants_keep_their_structured_payloads() {
        let cases = [
            (
                ZiweiError::InvalidLunisolarMonth { value: 31 },
                "INVALID_LUNISOLAR_MONTH",
                31,
            ),
            (
                ZiweiError::InvalidLunisolarDay { value: 0 },
                "INVALID_LUNISOLAR_DAY",
                0,
            ),
            (
                ZiweiError::InvalidDecadeIndex { value: 12 },
                "INVALID_DECADE_INDEX",
                12,
            ),
            (
                ZiweiError::InvalidYearlyIndex { value: 10 },
                "INVALID_YEARLY_INDEX",
                10,
            ),
        ];
        for (error, code, value) in cases {
            let message = error.to_string();
            let BindingError::Expected(failure) = BindingError::from(error) else {
                panic!("核心领域失败必须映射为预期错误");
            };
            assert_eq!(failure.code, code);
            assert_eq!(failure.message, message);
            assert_eq!(failure.value, Some(f64::from(value)));
            assert_eq!(failure.stem, None);
            assert_eq!(failure.branch, None);
        }
        let error = ZiweiError::InvalidSexagenaryYear {
            stem: ziwei::Stem::Jia,
            branch: ziwei::Branch::Chou,
        };
        let BindingError::Expected(failure) = BindingError::from(error) else {
            panic!("干支不配必须映射为预期错误");
        };
        assert_eq!(failure.code, "INVALID_SEXAGENARY_YEAR");
        assert_eq!(failure.stem, Some(0));
        assert_eq!(failure.branch, Some(1));
        assert_eq!(failure.value, None);
    }
}
