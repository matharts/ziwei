use napi_derive::napi;
use ziwei::ZiweiError;

/// Keep domain failures as data and propagate original Node-API exceptions unchanged.
pub fn checked<T>(
    result: Result<T, BindingError>,
) -> napi::Result<napi::bindgen_prelude::Either<T, NativeFailure>> {
    match result {
        Ok(value) => Ok(napi::bindgen_prelude::Either::A(value)),
        Err(BindingError::Expected(error)) => Ok(napi::bindgen_prelude::Either::B(*error)),
        Err(BindingError::Unexpected(error)) => Err(error),
    }
}

/// Private wire record. The TypeScript facade creates the public discriminated union.
#[napi(object, object_from_js = false)]
pub struct NativeFailure {
    pub code: String,
    pub message: String,
    pub path: Option<String>,
    pub reason: Option<String>,
    pub received_type: Option<String>,
    pub value: Option<f64>,
    pub stem: Option<u32>,
    pub branch: Option<u32>,
}

impl NativeFailure {
    fn new(code: &str, message: String) -> Self {
        Self {
            code: code.into(),
            message,
            path: None,
            reason: None,
            received_type: None,
            value: None,
            stem: None,
            branch: None,
        }
    }

    pub fn argument(path: &str, reason: &str, received_type: &str, value: Option<f64>) -> Self {
        let mut error = Self::new("INVALID_ARGUMENT", format!("参数 {path} 无效"));
        error.path = Some(path.into());
        error.reason = Some(reason.into());
        error.received_type = Some(received_type.into());
        error.value = value;
        error
    }
}

pub enum BindingError {
    // Keep successful validation results small; allocate only on the error path.
    Expected(Box<NativeFailure>),
    Unexpected(napi::Error),
}

impl From<napi::Error> for BindingError {
    fn from(error: napi::Error) -> Self {
        Self::Unexpected(error)
    }
}

impl From<NativeFailure> for BindingError {
    fn from(error: NativeFailure) -> Self {
        Self::Expected(Box::new(error))
    }
}

impl From<ZiweiError> for BindingError {
    fn from(error: ZiweiError) -> Self {
        let (code, value) = match error {
            ZiweiError::InvalidSexagenaryYear { stem, branch } => {
                let mut failure = NativeFailure::new("INVALID_SEXAGENARY_YEAR", error.to_string());
                failure.stem = Some(u32::from(stem.index()));
                failure.branch = Some(u32::from(branch.index()));
                return Self::Expected(Box::new(failure));
            }
            ZiweiError::InvalidLunisolarMonth { value } => ("INVALID_LUNISOLAR_MONTH", value),
            ZiweiError::InvalidLunisolarDay { value } => ("INVALID_LUNISOLAR_DAY", value),
            ZiweiError::InvalidDecadeIndex { value } => ("INVALID_DECADE_INDEX", value),
            ZiweiError::InvalidYearlyIndex { value } => ("INVALID_YEARLY_INDEX", value),
        };
        let mut failure = NativeFailure::new(code, error.to_string());
        failure.value = Some(f64::from(value));
        Self::Expected(Box::new(failure))
    }
}
