//! Own one core chart; projections never retain a Rust borrow or JS memory view.

use wasm_bindgen::prelude::*;
use ziwei::Natal;

use crate::error::{BindingError, checked};
use crate::input;
use crate::wire::{self, JsResult, array, record};

/// Private generated holder. The TypeScript facade alone exposes chart behavior.
/// wasm-bindgen supplies `free()` and its FinalizationRegistry fallback.
#[wasm_bindgen]
pub struct NativeNatal {
    inner: Natal,
}

impl NativeNatal {
    pub(crate) fn new(inner: Natal) -> Self {
        Self { inner }
    }

    fn query(&self, operation: impl FnOnce(&Natal) -> Result<JsValue, BindingError>) -> JsResult {
        checked(operation(&self.inner))
    }
}

#[wasm_bindgen]
impl NativeNatal {
    #[wasm_bindgen(js_name = snapshotLocations, unchecked_return_type = "NativeSnapshotLocations")]
    pub fn snapshot_locations(&self) -> JsResult {
        record([
            (
                "mingPalaceBranch",
                self.inner.ming_palace().branch().index().into(),
            ),
            (
                "shenPalaceBranch",
                self.inner.shen_palace().branch().index().into(),
            ),
            (
                "originPalaceBranch",
                self.inner.origin_palace().branch().index().into(),
            ),
            (
                "ziweiBranch",
                self.inner.ziwei_palace().branch().index().into(),
            ),
        ])
    }

    #[wasm_bindgen(js_name = periodIndicesAtAge, unchecked_return_type = "NativePeriodIndices | null | NativeFailure")]
    pub fn period_indices_at_age(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] age: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let age = input::byte(&age, "age")?;
            match natal.period_indices_at_age(age) {
                Some((decade, yearly)) => Ok(record([
                    ("decade", decade.get().into()),
                    ("yearly", yearly.get().into()),
                ])?),
                None => Ok(JsValue::NULL),
            }
        })
    }

    #[wasm_bindgen(unchecked_return_type = "NativePeriodPalace[] | NativeFailure")]
    pub fn decade(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] index: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let index = input::decade(&index, "index")?;
            Ok(array(natal.decade(index).map(wire::decade))?)
        })
    }

    #[wasm_bindgen(js_name = decadeByBranch, unchecked_return_type = "NativePeriodPalace | NativeFailure")]
    pub fn decade_by_branch(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] decade: JsValue,
        #[wasm_bindgen(unchecked_param_type = "unknown")] branch: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let decade = input::decade(&decade, "decade")?;
            let branch = input::branch(&branch, "branch")?;
            Ok(wire::decade(natal.decade_by_branch(decade, branch))?)
        })
    }

    #[wasm_bindgen(js_name = decadePalaceByName, unchecked_return_type = "NativePalace | NativeFailure")]
    pub fn decade_palace_by_name(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] decade: JsValue,
        #[wasm_bindgen(unchecked_param_type = "unknown")] name: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let decade = input::decade(&decade, "decade")?;
            let name = input::palace(&name)?;
            Ok(wire::palace(natal.decade_palace_by_name(decade, name))?)
        })
    }

    #[wasm_bindgen(js_name = decadeYears, unchecked_return_type = "NativeDecadeYear[] | NativeFailure")]
    pub fn decade_years(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] decade: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let decade = input::decade(&decade, "decade")?;
            Ok(array(natal.decade_years(decade).map(wire::decade_year))?)
        })
    }

    #[wasm_bindgen(unchecked_return_type = "NativePeriodPalace[] | NativeFailure")]
    pub fn yearly(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] decade: JsValue,
        #[wasm_bindgen(unchecked_param_type = "unknown")] index: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let decade = input::decade(&decade, "decade")?;
            let index = input::yearly(&index, "index")?;
            Ok(array(natal.yearly(decade, index).map(wire::yearly))?)
        })
    }

    #[wasm_bindgen(js_name = yearlyByBranch, unchecked_return_type = "NativePeriodPalace | NativeFailure")]
    pub fn yearly_by_branch(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] decade: JsValue,
        #[wasm_bindgen(unchecked_param_type = "unknown")] yearly: JsValue,
        #[wasm_bindgen(unchecked_param_type = "unknown")] branch: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let decade = input::decade(&decade, "decade")?;
            let yearly = input::yearly(&yearly, "yearly")?;
            let branch = input::branch(&branch, "branch")?;
            Ok(wire::yearly(
                natal.yearly_by_branch(decade, yearly, branch),
            )?)
        })
    }

    #[wasm_bindgen(js_name = yearlyPalaceByName, unchecked_return_type = "NativePalace | NativeFailure")]
    pub fn yearly_palace_by_name(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] decade: JsValue,
        #[wasm_bindgen(unchecked_param_type = "unknown")] yearly: JsValue,
        #[wasm_bindgen(unchecked_param_type = "unknown")] name: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let decade = input::decade(&decade, "decade")?;
            let yearly = input::yearly(&yearly, "yearly")?;
            let name = input::palace(&name)?;
            Ok(wire::palace(
                natal.yearly_palace_by_name(decade, yearly, name),
            )?)
        })
    }

    #[wasm_bindgen(js_name = oppositePalace, unchecked_return_type = "NativePalace | NativeFailure")]
    pub fn opposite_palace(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] branch: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let branch = input::branch(&branch, "branch")?;
            Ok(wire::palace(natal.opposite_palace(branch))?)
        })
    }

    #[wasm_bindgen(js_name = sanfangPalaces, unchecked_return_type = "NativePalace[] | NativeFailure")]
    pub fn sanfang_palaces(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] branch: JsValue,
        #[wasm_bindgen(unchecked_param_type = "unknown")] include_self: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let branch = input::branch(&branch, "branch")?;
            let include_self = input::boolean(&include_self, "includeSelf")?;
            Ok(array(
                natal
                    .sanfang_palaces(branch, include_self)
                    .map(wire::palace),
            )?)
        })
    }

    #[wasm_bindgen(js_name = sizhengPalaces, unchecked_return_type = "NativePalace[] | NativeFailure")]
    pub fn sizheng_palaces(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] branch: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let branch = input::branch(&branch, "branch")?;
            Ok(array(natal.sizheng_palaces(branch).map(wire::palace))?)
        })
    }

    #[wasm_bindgen(js_name = mingPalace, unchecked_return_type = "NativePalace")]
    pub fn ming_palace(&self) -> JsResult {
        wire::palace(self.inner.ming_palace())
    }

    #[wasm_bindgen(js_name = shenPalace, unchecked_return_type = "NativePalace")]
    pub fn shen_palace(&self) -> JsResult {
        wire::palace(self.inner.shen_palace())
    }

    #[wasm_bindgen(js_name = originPalace, unchecked_return_type = "NativePalace")]
    pub fn origin_palace(&self) -> JsResult {
        wire::palace(self.inner.origin_palace())
    }

    #[wasm_bindgen(js_name = ziweiPalace, unchecked_return_type = "NativePalace")]
    pub fn ziwei_palace(&self) -> JsResult {
        wire::palace(self.inner.ziwei_palace())
    }

    #[wasm_bindgen(js_name = birthTransformations, unchecked_return_type = "NativeLocatedStar[]")]
    pub fn birth_transformations(&self) -> JsResult {
        array(self.inner.birth_transformations().map(wire::located_star))
    }

    #[wasm_bindgen(js_name = selfTransformations, unchecked_return_type = "NativeLocatedStar[]")]
    pub fn self_transformations(&self) -> JsResult {
        array(self.inner.self_transformations().map(wire::located_star))
    }

    #[wasm_bindgen(js_name = palaceTransformation, unchecked_return_type = "NativePalaceTransformation | NativeFailure")]
    pub fn palace_transformation(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] source_branch: JsValue,
        #[wasm_bindgen(unchecked_param_type = "unknown")] kind: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let source_branch = input::branch(&source_branch, "sourceBranch")?;
            let kind = input::kind(&kind)?;
            Ok(wire::relation(
                natal.palace_transformation(source_branch, kind),
            )?)
        })
    }

    #[wasm_bindgen(js_name = palaceTransformations, unchecked_return_type = "NativePalaceTransformation[] | NativeFailure")]
    pub fn palace_transformations(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] source_branch: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let source_branch = input::branch(&source_branch, "sourceBranch")?;
            Ok(array(
                natal
                    .palace_transformations(source_branch)
                    .map(wire::relation),
            )?)
        })
    }

    #[wasm_bindgen(js_name = palaceTransformationSources, unchecked_return_type = "NativePalaceTransformation[] | NativeFailure")]
    pub fn palace_transformation_sources(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] target_branch: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let target_branch = input::branch(&target_branch, "targetBranch")?;
            Ok(array(
                natal
                    .palace_transformation_sources(target_branch)
                    .map(wire::relation),
            )?)
        })
    }

    #[wasm_bindgen(unchecked_return_type = "NativePalace | NativeFailure")]
    pub fn palace(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] branch: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let branch = input::branch(&branch, "branch")?;
            Ok(wire::palace(natal.palace(branch))?)
        })
    }

    #[wasm_bindgen(js_name = palaceByName, unchecked_return_type = "NativePalace | NativeFailure")]
    pub fn palace_by_name(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] name: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let name = input::palace(&name)?;
            Ok(wire::palace(natal.palace_by_name(name))?)
        })
    }

    #[wasm_bindgen(js_name = palaceByStar, unchecked_return_type = "NativePalace | NativeFailure")]
    pub fn palace_by_star(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] name: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let name = input::star(&name)?;
            Ok(wire::palace(natal.palace_by_star(name))?)
        })
    }

    #[wasm_bindgen(unchecked_return_type = "NativeStar | NativeFailure")]
    pub fn star(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] name: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let name = input::star(&name)?;
            Ok(wire::star(natal.star(name)))
        })
    }

    #[wasm_bindgen(js_name = palaceStar, unchecked_return_type = "NativeStar | null | NativeFailure")]
    pub fn palace_star(
        &self,
        #[wasm_bindgen(unchecked_param_type = "unknown")] branch: JsValue,
        #[wasm_bindgen(unchecked_param_type = "unknown")] name: JsValue,
    ) -> JsResult {
        self.query(|natal| {
            let branch = input::branch(&branch, "branch")?;
            let name = input::star(&name)?;
            Ok(natal
                .palace(branch)
                .star(name)
                .map_or(JsValue::NULL, wire::star))
        })
    }

    #[wasm_bindgen(getter, unchecked_return_type = "NativeZodiac")]
    pub fn zodiac(&self) -> JsValue {
        wire::zodiac(self.inner.zodiac()).into()
    }

    #[wasm_bindgen(getter, js_name = fiveElementBureau, unchecked_return_type = "NativeFiveElementBureau")]
    pub fn five_element_bureau(&self) -> u8 {
        wire::bureau(self.inner.five_element_bureau())
    }

    #[wasm_bindgen(getter, unchecked_return_type = "NativePalace[]")]
    pub fn palaces(&self) -> JsResult {
        array(self.inner.palaces().iter().map(wire::palace))
    }

    #[wasm_bindgen(getter, unchecked_return_type = "NativeProfile")]
    pub fn profile(&self) -> JsResult {
        wire::profile(self.inner.profile())
    }
}
