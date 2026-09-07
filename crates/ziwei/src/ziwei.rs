use crate::{Birth, Natal, Parameters, ZiweiError, rules};

/// 紫微斗数命盘创建入口。
///
/// 本身不保存命盘状态；创建结果由 [`Natal`] 承载。
pub struct Ziwei;

impl Ziwei {
    /// 由已归一化的出生资料创建本命盘。
    ///
    /// 从数字农历年份导出生年干支，按五行局与出生日定位紫微星；
    /// 出生档案保留数字年份与出生日，二者均为 `Some(...)`。
    /// 历法换算、闰月辨识、时区及实际日期有效性由调用方处理。
    ///
    /// # Errors
    ///
    /// 保留统一的排盘错误返回类型。月份与日期已由 [`crate::BirthMonth`]、
    /// [`crate::BirthDay`] 校验数值范围，数字年份接受任意 `i32`；当前没有额外的错误分支。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{Birth, BirthDay, BirthMonth, Branch, Gender, Ziwei, ZiweiError};
    ///
    /// # fn main() -> Result<(), ZiweiError> {
    /// let birth = Birth {
    ///     gender: Gender::Female,
    ///     birth_year: 1992,
    ///     birth_month: BirthMonth::try_from(8)?,
    ///     birth_day: BirthDay::try_from(17)?,
    ///     birth_hour: Branch::Mao,
    /// };
    /// let natal = Ziwei::from_birth(birth)?;
    ///
    /// assert_eq!(natal.profile().birth_year(), Some(1992));
    /// assert_eq!(natal.profile().birth_day(), Some(birth.birth_day));
    /// assert_eq!(natal.ziwei_palace().branch(), Branch::You);
    /// # Ok(())
    /// # }
    /// ```
    pub fn from_birth(birth: Birth) -> Result<Natal, ZiweiError> {
        Ok(rules::compute_natal_from_birth(birth))
    }

    /// 由已验证的直接排盘参数创建本命盘。
    ///
    /// 紫微星采用参数给定的地支；出生档案的数字年份与出生日均为 `None`。
    /// 调用方负责紫微地支的正确性，核心不进行历法换算。
    ///
    /// # Errors
    ///
    /// 保留统一的排盘错误返回类型。当前参数已由 [`Parameters::new`] 与
    /// [`crate::BirthMonth`] 完成类型校验，本方法不重复校验，也没有额外的错误分支。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{BirthMonth, Branch, Gender, Parameters, Stem, Ziwei, ZiweiError};
    ///
    /// # fn main() -> Result<(), ZiweiError> {
    /// let parameters = Parameters::new(
    ///     Gender::Female,
    ///     Stem::Ren,
    ///     Branch::Shen,
    ///     BirthMonth::try_from(8)?,
    ///     Branch::You,
    ///     Branch::Mao,
    /// )?;
    /// let natal = Ziwei::from_parameters(parameters)?;
    ///
    /// assert_eq!(natal.profile().birth_year(), None);
    /// assert_eq!(natal.ziwei_palace().branch(), Branch::You);
    /// # Ok(())
    /// # }
    /// ```
    pub fn from_parameters(parameters: Parameters) -> Result<Natal, ZiweiError> {
        Ok(rules::compute_natal_from_parameters(parameters))
    }
}
