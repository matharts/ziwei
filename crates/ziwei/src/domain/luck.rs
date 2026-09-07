//! 限运领域对象和值。

use crate::PalaceName;

/// 大限在十二宫中的排列方向。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum DecadeDirection {
    /// 沿寅至丑的固定顺序排列。
    Forward,
    /// 逆寅至丑的固定顺序排列。
    Reverse,
}

/// 一个实际宫位在指定大限中的宫职结果。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Decade {
    name: PalaceName,
}

impl Decade {
    /// 由 crate 内的大限宫职排布规则创建结果。
    pub(crate) const fn new(name: PalaceName) -> Self {
        Self { name }
    }

    /// 返回大限宫职的稳定身份。
    #[must_use]
    pub const fn name(self) -> PalaceName {
        self.name
    }

    /// 返回大限宫职的简体中文名称。
    #[must_use]
    pub const fn name_hans(self) -> &'static str {
        let (name_hans, _) = decade_names(self.name);

        name_hans
    }

    /// 返回大限宫职的繁体中文名称。
    #[must_use]
    pub const fn name_hant(self) -> &'static str {
        let (_, name_hant) = decade_names(self.name);

        name_hant
    }
}

const fn decade_names(name: PalaceName) -> (&'static str, &'static str) {
    match name {
        PalaceName::Ming => ("大命", "大命"),
        PalaceName::XiongDi => ("大兄", "大兄"),
        PalaceName::FuQi => ("大夫", "大夫"),
        PalaceName::ZiNv => ("大子", "大子"),
        PalaceName::CaiBo => ("大财", "大財"),
        PalaceName::JiE => ("大疾", "大疾"),
        PalaceName::QianYi => ("大迁", "大遷"),
        PalaceName::JiaoYou => ("大友", "大友"),
        PalaceName::GuanLu => ("大官", "大官"),
        PalaceName::TianZhai => ("大田", "大田"),
        PalaceName::FuDe => ("大福", "大福"),
        PalaceName::FuMu => ("大父", "大父"),
    }
}

/// 一个实际宫位在指定流年中的宫职结果。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Yearly {
    name: PalaceName,
}

impl Yearly {
    /// 由 crate 内的流年宫职排布规则创建结果。
    pub(crate) const fn new(name: PalaceName) -> Self {
        Self { name }
    }

    /// 返回流年宫职的稳定身份。
    #[must_use]
    pub const fn name(self) -> PalaceName {
        self.name
    }

    /// 返回流年宫职的简体中文名称。
    #[must_use]
    pub const fn name_hans(self) -> &'static str {
        let (name_hans, _) = yearly_names(self.name);

        name_hans
    }

    /// 返回流年宫职的繁体中文名称。
    #[must_use]
    pub const fn name_hant(self) -> &'static str {
        let (_, name_hant) = yearly_names(self.name);

        name_hant
    }
}

const fn yearly_names(name: PalaceName) -> (&'static str, &'static str) {
    match name {
        PalaceName::Ming => ("流命", "流命"),
        PalaceName::XiongDi => ("流兄", "流兄"),
        PalaceName::FuQi => ("流夫", "流夫"),
        PalaceName::ZiNv => ("流子", "流子"),
        PalaceName::CaiBo => ("流财", "流財"),
        PalaceName::JiE => ("流疾", "流疾"),
        PalaceName::QianYi => ("流迁", "流遷"),
        PalaceName::JiaoYou => ("流友", "流友"),
        PalaceName::GuanLu => ("流官", "流官"),
        PalaceName::TianZhai => ("流田", "流田"),
        PalaceName::FuDe => ("流福", "流福"),
        PalaceName::FuMu => ("流父", "流父"),
    }
}

/// 大限的零基序号。
///
/// 仅用于选择要生成的大限视图，不属于大限宫职布局的持久事实。
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct DecadeIndex(u8);

impl DecadeIndex {
    /// 返回已验证的零基大限序号。
    #[must_use]
    pub const fn get(self) -> u8 {
        self.0
    }
}

impl TryFrom<u8> for DecadeIndex {
    type Error = crate::ZiweiError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        if value <= 11 {
            Ok(Self(value))
        } else {
            Err(crate::ZiweiError::InvalidDecadeIndex { value })
        }
    }
}

/// 流年的零基序号。
///
/// 仅用于选择要生成的流年视图，不属于流年宫职布局的持久事实。
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct YearlyIndex(u8);

impl YearlyIndex {
    /// 返回已验证的零基流年序号。
    #[must_use]
    pub const fn get(self) -> u8 {
        self.0
    }
}

impl TryFrom<u8> for YearlyIndex {
    type Error = crate::ZiweiError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        if value <= 9 {
            Ok(Self(value))
        } else {
            Err(crate::ZiweiError::InvalidYearlyIndex { value })
        }
    }
}

/// 一个大限内的年度摘要。
///
/// 它不保存流年序号；在固定十项年度摘要数组中的位置即为该序号。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct DecadeYear {
    age: u8,
    year: Option<i64>,
}

impl DecadeYear {
    /// 由 crate 内的大限年度计算创建摘要。
    pub(crate) const fn new(age: u8, year: Option<i64>) -> Self {
        Self { age, year }
    }

    /// 返回该年度的虚岁。
    #[must_use]
    pub const fn age(&self) -> u8 {
        self.age
    }

    /// 返回可用的数字年份；仅缺少数字出生年份时为 `None`。
    ///
    /// 使用 `i64` 容纳任意 `i32` 出生年份加上虚岁偏移后的结果，不进行历法换算。
    #[must_use]
    pub const fn year(&self) -> Option<i64> {
        self.year
    }
}

#[cfg(test)]
mod tests {
    use super::{Decade, DecadeIndex, DecadeYear, Yearly, YearlyIndex};
    use crate::{PalaceName, ZiweiError};

    #[test]
    fn decade_holds_confirmed_palace_name_and_localized_names() {
        let expected = [
            (PalaceName::Ming, "大命", "大命"),
            (PalaceName::XiongDi, "大兄", "大兄"),
            (PalaceName::FuQi, "大夫", "大夫"),
            (PalaceName::ZiNv, "大子", "大子"),
            (PalaceName::CaiBo, "大财", "大財"),
            (PalaceName::JiE, "大疾", "大疾"),
            (PalaceName::QianYi, "大迁", "大遷"),
            (PalaceName::JiaoYou, "大友", "大友"),
            (PalaceName::GuanLu, "大官", "大官"),
            (PalaceName::TianZhai, "大田", "大田"),
            (PalaceName::FuDe, "大福", "大福"),
            (PalaceName::FuMu, "大父", "大父"),
        ];

        for (name, name_hans, name_hant) in expected {
            let decade = Decade::new(name);

            assert_eq!(decade.name(), name);
            assert_eq!(decade.name_hans(), name_hans);
            assert_eq!(decade.name_hant(), name_hant);
        }
    }

    #[test]
    fn yearly_holds_confirmed_palace_name_and_localized_names() {
        let expected = [
            (PalaceName::Ming, "流命", "流命"),
            (PalaceName::XiongDi, "流兄", "流兄"),
            (PalaceName::FuQi, "流夫", "流夫"),
            (PalaceName::ZiNv, "流子", "流子"),
            (PalaceName::CaiBo, "流财", "流財"),
            (PalaceName::JiE, "流疾", "流疾"),
            (PalaceName::QianYi, "流迁", "流遷"),
            (PalaceName::JiaoYou, "流友", "流友"),
            (PalaceName::GuanLu, "流官", "流官"),
            (PalaceName::TianZhai, "流田", "流田"),
            (PalaceName::FuDe, "流福", "流福"),
            (PalaceName::FuMu, "流父", "流父"),
        ];

        for (name, name_hans, name_hant) in expected {
            let yearly = Yearly::new(name);

            assert_eq!(yearly.name(), name);
            assert_eq!(yearly.name_hans(), name_hans);
            assert_eq!(yearly.name_hant(), name_hant);
        }
    }

    #[test]
    fn decade_index_accepts_confirmed_range() {
        for value in [0, 6, 11] {
            let index = DecadeIndex::try_from(value).expect("范围内大限序号必须有效");

            assert_eq!(index.get(), value);
        }
    }

    #[test]
    fn decade_index_rejects_values_outside_confirmed_range() {
        let expected = [
            (12, ZiweiError::InvalidDecadeIndex { value: 12 }),
            (u8::MAX, ZiweiError::InvalidDecadeIndex { value: u8::MAX }),
        ];

        for (value, error) in expected {
            assert_eq!(DecadeIndex::try_from(value), Err(error));
        }
    }

    #[test]
    fn decade_year_holds_confirmed_age_and_optional_year() {
        let expected = [(2, Some(1992)), (11, Some(2001)), (12, None)];

        for (age, year) in expected {
            let decade_year = DecadeYear::new(age, year);

            assert_eq!(decade_year.age(), age);
            assert_eq!(decade_year.year(), year);
        }
    }

    #[test]
    fn yearly_index_accepts_confirmed_range() {
        for value in [0, 5, 9] {
            let index = YearlyIndex::try_from(value).expect("范围内流年序号必须有效");

            assert_eq!(index.get(), value);
        }
    }

    #[test]
    fn yearly_index_rejects_values_outside_confirmed_range() {
        let expected = [
            (10, ZiweiError::InvalidYearlyIndex { value: 10 }),
            (u8::MAX, ZiweiError::InvalidYearlyIndex { value: u8::MAX }),
        ];

        for (value, error) in expected {
            assert_eq!(YearlyIndex::try_from(value), Err(error));
        }
    }
}
