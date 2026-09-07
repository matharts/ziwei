//! 出生资料领域值、输入与归一化上下文。

use crate::{Branch, Gender, Stem, ZiweiError};

/// 已归一化的阴阳历月份。
///
/// 不记录闰月信息，也不承担历法换算。
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct BirthMonth(u8);

impl BirthMonth {
    /// 返回已验证的月份数值。
    #[must_use]
    pub const fn get(self) -> u8 {
        self.0
    }
}

impl TryFrom<u8> for BirthMonth {
    type Error = ZiweiError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        if (1..=12).contains(&value) {
            Ok(Self(value))
        } else {
            Err(ZiweiError::InvalidLunisolarMonth { value })
        }
    }
}

/// 已归一化的阴阳历日期。
///
/// 不校验具体月份天数，也不承担历法换算。
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct BirthDay(u8);

impl BirthDay {
    /// 返回已验证的日期数值。
    #[must_use]
    pub const fn get(self) -> u8 {
        self.0
    }
}

impl TryFrom<u8> for BirthDay {
    type Error = ZiweiError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        if (1..=30).contains(&value) {
            Ok(Self(value))
        } else {
            Err(ZiweiError::InvalidLunisolarDay { value })
        }
    }
}

/// 已归一化的出生资料。
///
/// 调用方负责在构造前完成历法换算、闰月辨识、时区及实际日期有效性校验。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Birth {
    /// 出生性别。
    pub gender: Gender,
    /// 数字农历出生年份。
    pub birth_year: i32,
    /// 已归一化的出生月份。
    pub birth_month: BirthMonth,
    /// 已归一化的出生日。
    pub birth_day: BirthDay,
    /// 出生时辰对应的地支。
    pub birth_hour: Branch,
}

/// 已验证的直接排盘参数。
///
/// 调用方负责提供正确的紫微星宫位地支。生年干支在构造时即校验为有效六十甲子。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Parameters {
    /// 出生性别。
    gender: Gender,
    /// 生年天干。
    birth_stem: Stem,
    /// 生年地支。
    birth_branch: Branch,
    /// 已归一化的出生月份。
    birth_month: BirthMonth,
    /// 紫微星所在实际宫位的地支。
    ziwei_branch: Branch,
    /// 出生时辰对应的地支。
    birth_hour: Branch,
}

impl Parameters {
    /// 创建已验证的直接排盘参数。
    ///
    /// # Errors
    ///
    /// 当生年干支不能组成有效六十甲子时，返回
    /// [`ZiweiError::InvalidSexagenaryYear`]。
    pub fn new(
        gender: Gender,
        birth_stem: Stem,
        birth_branch: Branch,
        birth_month: BirthMonth,
        ziwei_branch: Branch,
        birth_hour: Branch,
    ) -> Result<Self, ZiweiError> {
        if !is_valid_sexagenary_year(birth_stem, birth_branch) {
            return Err(ZiweiError::InvalidSexagenaryYear {
                stem: birth_stem,
                branch: birth_branch,
            });
        }

        Ok(Self {
            gender,
            birth_stem,
            birth_branch,
            birth_month,
            ziwei_branch,
            birth_hour,
        })
    }

    /// 返回出生性别。
    #[must_use]
    pub const fn gender(&self) -> Gender {
        self.gender
    }

    /// 返回生年天干。
    #[must_use]
    pub const fn birth_stem(&self) -> Stem {
        self.birth_stem
    }

    /// 返回生年地支。
    #[must_use]
    pub const fn birth_branch(&self) -> Branch {
        self.birth_branch
    }

    /// 返回归一化出生月份。
    #[must_use]
    pub const fn birth_month(&self) -> BirthMonth {
        self.birth_month
    }

    /// 返回紫微星所在实际宫位的地支。
    #[must_use]
    pub const fn ziwei_branch(&self) -> Branch {
        self.ziwei_branch
    }

    /// 返回出生时辰对应的地支。
    #[must_use]
    pub const fn birth_hour(&self) -> Branch {
        self.birth_hour
    }
}

/// 由本命盘持有的归一化出生档案。
///
/// 不记录原始输入、输入来源或紫微星所在宫位。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Profile {
    birth_year: Option<i32>,
    gender: Gender,
    birth_stem: Stem,
    birth_branch: Branch,
    birth_month: BirthMonth,
    birth_hour: Branch,
    birth_day: Option<BirthDay>,
}

impl Profile {
    /// 由已归一化的出生事实创建档案。
    ///
    /// 数字出生年份与出生日必须同时存在或同时缺失。
    #[must_use]
    pub(crate) const fn new(
        birth_year: Option<i32>,
        gender: Gender,
        birth_stem: Stem,
        birth_branch: Branch,
        birth_month: BirthMonth,
        birth_hour: Branch,
        birth_day: Option<BirthDay>,
    ) -> Self {
        assert!(
            birth_year.is_some() == birth_day.is_some(),
            "数字出生年份与出生日必须同时存在或同时缺失"
        );

        Self {
            birth_year,
            gender,
            birth_stem,
            birth_branch,
            birth_month,
            birth_hour,
            birth_day,
        }
    }

    /// 返回数字出生年份锚点。
    #[must_use]
    pub const fn birth_year(&self) -> Option<i32> {
        self.birth_year
    }

    /// 返回出生性别。
    #[must_use]
    pub const fn gender(&self) -> Gender {
        self.gender
    }

    /// 返回生年天干。
    #[must_use]
    pub const fn birth_stem(&self) -> Stem {
        self.birth_stem
    }

    /// 返回生年地支。
    #[must_use]
    pub const fn birth_branch(&self) -> Branch {
        self.birth_branch
    }

    /// 返回归一化出生月份。
    #[must_use]
    pub const fn birth_month(&self) -> BirthMonth {
        self.birth_month
    }

    /// 返回出生时辰对应的地支。
    #[must_use]
    pub const fn birth_hour(&self) -> Branch {
        self.birth_hour
    }

    /// 返回归一化出生日；直接排盘参数为 `None`。
    #[must_use]
    pub const fn birth_day(&self) -> Option<BirthDay> {
        self.birth_day
    }
}

/// 由数字农历年份导出对应的生年干支。
///
/// 年份以甲子为 `4` 的同余关系计算；使用 `rem_euclid` 保证任意 `i32`
/// 输入都不发生减法溢出。
#[must_use]
pub(crate) fn sexagenary_from_birth_year(birth_year: i32) -> (Stem, Branch) {
    let stem = match birth_year.rem_euclid(10) {
        4 => Stem::Jia,
        5 => Stem::Yi,
        6 => Stem::Bing,
        7 => Stem::Ding,
        8 => Stem::Wu,
        9 => Stem::Ji,
        0 => Stem::Geng,
        1 => Stem::Xin,
        2 => Stem::Ren,
        3 => Stem::Gui,
        _ => unreachable!("十进制同余必须在 0..=9"),
    };
    let branch = match birth_year.rem_euclid(12) {
        4 => Branch::Zi,
        5 => Branch::Chou,
        6 => Branch::Yin,
        7 => Branch::Mao,
        8 => Branch::Chen,
        9 => Branch::Si,
        10 => Branch::Wu,
        11 => Branch::Wei,
        0 => Branch::Shen,
        1 => Branch::You,
        2 => Branch::Xu,
        3 => Branch::Hai,
        _ => unreachable!("十二进制同余必须在 0..=11"),
    };

    (stem, branch)
}

/// 返回干支是否可组成有效的六十甲子年柱。
#[must_use]
pub(crate) fn is_valid_sexagenary_year(stem: Stem, branch: Branch) -> bool {
    stem.yin_yang() == branch.yin_yang()
}

#[cfg(test)]
mod tests {
    use super::{Birth, BirthDay, BirthMonth, Parameters, Profile, sexagenary_from_birth_year};
    use crate::{Branch, Gender, Stem, ZiweiError};

    #[test]
    fn birth_month_accepts_confirmed_range() {
        for value in [1, 6, 12] {
            let month = BirthMonth::try_from(value).expect("范围内月份必须有效");

            assert_eq!(month.get(), value);
        }
    }

    #[test]
    fn birth_month_rejects_values_outside_confirmed_range() {
        let expected = [
            (0, ZiweiError::InvalidLunisolarMonth { value: 0 }),
            (13, ZiweiError::InvalidLunisolarMonth { value: 13 }),
        ];

        for (value, error) in expected {
            assert_eq!(BirthMonth::try_from(value), Err(error));
        }
    }

    #[test]
    fn birth_day_accepts_confirmed_range() {
        for value in [1, 15, 30] {
            let day = BirthDay::try_from(value).expect("范围内日期必须有效");

            assert_eq!(day.get(), value);
        }
    }

    #[test]
    fn birth_day_rejects_values_outside_confirmed_range() {
        let expected = [
            (0, ZiweiError::InvalidLunisolarDay { value: 0 }),
            (31, ZiweiError::InvalidLunisolarDay { value: 31 }),
        ];

        for (value, error) in expected {
            assert_eq!(BirthDay::try_from(value), Err(error));
        }
    }

    #[test]
    fn birth_holds_all_confirmed_input_facts() {
        let birth = Birth {
            gender: Gender::Female,
            birth_year: 1992,
            birth_month: BirthMonth::try_from(8).expect("范围内月份必须有效"),
            birth_day: BirthDay::try_from(15).expect("范围内日期必须有效"),
            birth_hour: Branch::Shen,
        };

        assert_eq!(birth.gender, Gender::Female);
        assert_eq!(birth.birth_year, 1992);
        assert_eq!(birth.birth_month.get(), 8);
        assert_eq!(birth.birth_day.get(), 15);
        assert_eq!(birth.birth_hour, Branch::Shen);
    }

    #[test]
    fn parameters_hold_all_confirmed_direct_chart_facts() {
        let parameters = Parameters::new(
            Gender::Male,
            Stem::Ren,
            Branch::Shen,
            BirthMonth::try_from(5).expect("范围内月份必须有效"),
            Branch::Chen,
            Branch::Hai,
        )
        .expect("壬申必须是有效六十甲子");

        assert_eq!(parameters.gender(), Gender::Male);
        assert_eq!(parameters.birth_stem(), Stem::Ren);
        assert_eq!(parameters.birth_branch(), Branch::Shen);
        assert_eq!(parameters.birth_month().get(), 5);
        assert_eq!(parameters.ziwei_branch(), Branch::Chen);
        assert_eq!(parameters.birth_hour(), Branch::Hai);
    }

    #[test]
    fn profile_holds_confirmed_normalized_birth_facts() {
        let day = BirthDay::try_from(15).expect("范围内日期必须有效");
        let from_birth = Profile::new(
            Some(1992),
            Gender::Female,
            Stem::Ren,
            Branch::Shen,
            BirthMonth::try_from(8).expect("范围内月份必须有效"),
            Branch::Shen,
            Some(day),
        );
        let from_parameters = Profile::new(
            None,
            Gender::Male,
            Stem::Jia,
            Branch::Zi,
            BirthMonth::try_from(1).expect("范围内月份必须有效"),
            Branch::Zi,
            None,
        );

        assert_eq!(from_birth.birth_year(), Some(1992));
        assert_eq!(from_birth.gender(), Gender::Female);
        assert_eq!(from_birth.birth_stem(), Stem::Ren);
        assert_eq!(from_birth.birth_branch(), Branch::Shen);
        assert_eq!(from_birth.birth_month().get(), 8);
        assert_eq!(from_birth.birth_hour(), Branch::Shen);
        assert_eq!(from_birth.birth_day(), Some(day));
        assert_eq!(from_parameters.birth_year(), None);
        assert_eq!(from_parameters.birth_day(), None);
    }

    #[test]
    fn numeric_birth_year_maps_to_confirmed_sexagenary_year() {
        let expected = [
            (4, Stem::Jia, Branch::Zi),
            (1984, Stem::Jia, Branch::Zi),
            (1992, Stem::Ren, Branch::Shen),
            (2024, Stem::Jia, Branch::Chen),
            (2025, Stem::Yi, Branch::Si),
            (i32::MIN, Stem::Ren, Branch::Zi),
            (i32::MAX, Stem::Ding, Branch::Mao),
        ];

        for (birth_year, stem, branch) in expected {
            assert_eq!(sexagenary_from_birth_year(birth_year), (stem, branch));
        }
    }

    #[test]
    fn parameters_new_accepts_exactly_sixty_sexagenary_years() {
        let stems = [
            Stem::Jia,
            Stem::Yi,
            Stem::Bing,
            Stem::Ding,
            Stem::Wu,
            Stem::Ji,
            Stem::Geng,
            Stem::Xin,
            Stem::Ren,
            Stem::Gui,
        ];
        let branches = [
            Branch::Zi,
            Branch::Chou,
            Branch::Yin,
            Branch::Mao,
            Branch::Chen,
            Branch::Si,
            Branch::Wu,
            Branch::Wei,
            Branch::Shen,
            Branch::You,
            Branch::Xu,
            Branch::Hai,
        ];
        let mut valid_count = 0;

        for stem in stems {
            for branch in branches {
                let expected = stem.index() % 2 == branch.index() % 2;
                let result = Parameters::new(
                    Gender::Female,
                    stem,
                    branch,
                    BirthMonth::try_from(1).expect("范围内月份必须有效"),
                    Branch::Zi,
                    Branch::Zi,
                );

                if expected {
                    assert!(result.is_ok(), "{stem}{branch}");
                    valid_count += 1;
                } else {
                    assert_eq!(
                        result,
                        Err(ZiweiError::InvalidSexagenaryYear { stem, branch }),
                        "{stem}{branch}"
                    );
                }
            }
        }

        assert_eq!(valid_count, 60);
    }
}
