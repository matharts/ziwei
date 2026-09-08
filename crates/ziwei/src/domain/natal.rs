use crate::{
    Branch, Decade, DecadeIndex, DecadeYear, FiveElementBureau, Palace, PalaceName,
    PalaceTransformation, Profile, Star, StarName, Transformation, Yearly, YearlyIndex, Zodiac,
    rules,
};

/// 不可变的本命盘事实。
///
/// 它只保存由排盘路径确定的本命信息；大限与流年不在其中预计算。
#[derive(Clone, PartialEq, Eq)]
pub struct Natal {
    profile: Profile,
    zodiac: Zodiac,
    five_element_bureau: FiveElementBureau,
    palaces: [Palace; 12],
    star_locations: [StarLocation; StarName::ALL.len()],
    ming_palace_branch: Branch,
    shen_palace_name: PalaceName,
    shen_palace_branch: Branch,
    origin_palace_name: PalaceName,
    origin_palace_branch: Branch,
    ziwei_palace_name: PalaceName,
    ziwei_branch: Branch,
}

// 只保存位置，不保存引用；命盘移动或克隆后仍指向自身的星曜。
#[derive(Clone, Copy, PartialEq, Eq)]
struct StarLocation {
    palace: u8,
    star: u8,
}

impl Natal {
    /// 返回归一化出生档案。
    #[must_use]
    pub const fn profile(&self) -> &Profile {
        &self.profile
    }

    /// 返回由生年地支确定的生肖。
    #[must_use]
    pub const fn zodiac(&self) -> Zodiac {
        self.zodiac
    }

    /// 返回命盘的五行局。
    #[must_use]
    pub const fn five_element_bureau(&self) -> FiveElementBureau {
        self.five_element_bureau
    }

    /// 返回按寅至丑固定顺序保存的十二个实际宫位。
    #[must_use]
    pub const fn palaces(&self) -> &[Palace; 12] {
        &self.palaces
    }

    /// 按地支返回唯一的实际宫位。
    #[must_use]
    pub fn palace(&self, branch: Branch) -> &Palace {
        &self.palaces[usize::from(branch.index_from_yin())]
    }

    /// 返回与指定实际宫位相隔六宫的本命对宫。
    ///
    /// 返回当前命盘内的借用，不受期间宫职影响，不复制宫位或星曜。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{BirthMonth, Branch, Gender, Parameters, Stem, Ziwei};
    /// let natal = Ziwei::from_parameters(Parameters::new(
    ///     Gender::Male, Stem::Jia, Branch::Zi, BirthMonth::try_from(1)?,
    ///     Branch::Yin, Branch::Zi,
    /// )?)?;
    /// let opposite = natal.opposite_palace(Branch::Zi);
    /// assert_eq!(opposite.branch(), Branch::Wu);
    /// assert!(core::ptr::eq(opposite, natal.palace(Branch::Wu)));
    /// # Ok::<(), ziwei::ZiweiError>(())
    /// ```
    #[must_use]
    pub fn opposite_palace(&self, branch: Branch) -> &Palace {
        &self.palaces[(usize::from(branch.index_from_yin()) + 6) % 12]
    }

    /// 返回指定实际宫位的三方，可选择包含本宫。
    ///
    /// `include_self` 为 `false` 时，依次返回沿地支正序相隔四宫、八宫的
    /// 两个三合宫，以及相隔六宫的对宫；为 `true` 时将本宫放在首位，组成四正。
    /// 迭代器长度分别为三或四，借用当前本命盘，不分配堆内存或缓存查询结果。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{BirthMonth, Branch, Gender, Parameters, Stem, Ziwei};
    /// let natal = Ziwei::from_parameters(Parameters::new(
    ///     Gender::Male, Stem::Jia, Branch::Zi, BirthMonth::try_from(1)?,
    ///     Branch::Yin, Branch::Zi,
    /// )?)?;
    /// assert!(natal.sanfang_palaces(Branch::Yin, false)
    ///     .map(|palace| palace.branch()).eq([Branch::Wu, Branch::Xu, Branch::Shen]));
    /// assert!(natal.sanfang_palaces(Branch::Yin, true)
    ///     .map(|palace| palace.branch()).eq([Branch::Yin, Branch::Wu, Branch::Xu, Branch::Shen]));
    /// # Ok::<(), ziwei::ZiweiError>(())
    /// ```
    pub fn sanfang_palaces(
        &self,
        branch: Branch,
        include_self: bool,
    ) -> impl ExactSizeIterator<Item = &Palace> + '_ {
        self.sizheng_palaces(branch)
            .into_iter()
            .skip(usize::from(!include_self))
    }

    /// 返回指定实际宫位的四正，顺序为本宫、两个三合宫、对宫。
    ///
    /// 四项沿地支正序的相对偏移分别为零、四、八、六宫。
    /// 返回当前命盘内互不重复的宫位借用，不受期间宫职影响，不复制宫位或星曜。
    /// 与 [`Self::sanfang_palaces`] 传入 `include_self = true` 的内容和顺序一致。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{BirthMonth, Branch, Gender, Parameters, Stem, Ziwei};
    /// let natal = Ziwei::from_parameters(Parameters::new(
    ///     Gender::Male, Stem::Jia, Branch::Zi, BirthMonth::try_from(1)?,
    ///     Branch::Yin, Branch::Zi,
    /// )?)?;
    /// let palaces = natal.sizheng_palaces(Branch::Yin);
    /// assert_eq!(palaces.map(|palace| palace.branch()),
    ///     [Branch::Yin, Branch::Wu, Branch::Xu, Branch::Shen]);
    /// assert!(core::ptr::eq(palaces[0], natal.palace(Branch::Yin)));
    /// # Ok::<(), ziwei::ZiweiError>(())
    /// ```
    #[must_use]
    pub fn sizheng_palaces(&self, branch: Branch) -> [&Palace; 4] {
        let index = usize::from(branch.index_from_yin());
        [0, 4, 8, 6].map(|offset| &self.palaces[(index + offset) % 12])
    }

    /// 按本命宫位名称返回唯一的实际宫位。
    #[must_use]
    pub fn palace_by_name(&self, name: PalaceName) -> &Palace {
        // 实际宫位按寅至丑排列，宫职从命宫逆布；差值仅在 -11..=11 内。
        let ming_index = self.ming_palace_branch.index_from_yin() as i8;
        let palace_index = (ming_index - name.index() as i8).rem_euclid(12) as usize;

        &self.palaces[palace_index]
    }

    /// 返回命宫对应的实际宫位。
    #[must_use]
    pub fn ming_palace(&self) -> &Palace {
        self.palace(self.ming_palace_branch)
    }

    /// 返回身宫对应的实际宫位。
    #[must_use]
    pub fn shen_palace(&self) -> &Palace {
        self.palace(self.shen_palace_branch)
    }

    /// 返回来因宫对应的实际宫位。
    #[must_use]
    pub fn origin_palace(&self) -> &Palace {
        self.palace(self.origin_palace_branch)
    }

    /// 返回包含紫微星的实际宫位。
    #[must_use]
    pub fn ziwei_palace(&self) -> &Palace {
        self.palace(self.ziwei_branch)
    }

    /// 按星曜身份返回其所在的实际宫位。
    ///
    /// 当前十八星在每张本命盘内各出现一次，因此无需返回 `Option`。
    /// 返回命盘内的借用，不复制宫位或星曜。
    #[must_use]
    pub fn palace_by_star(&self, name: StarName) -> &Palace {
        let location = self.star_locations[name.index()];
        &self.palaces[usize::from(location.palace)]
    }

    /// 按星曜身份返回命盘内唯一的星曜。
    #[must_use]
    pub fn star(&self, name: StarName) -> &Star {
        let location = self.star_locations[name.index()];
        &self.palaces[usize::from(location.palace)].stars()[usize::from(location.star)]
    }

    /// 返回四颗生年四化星及其实际宫位，顺序固定为 `A / B / C / D`。
    ///
    /// 每项为 `(目标宫位, 目标星曜)` 的借用；化象可由星曜的
    /// [`Star::birth_transformation`] 读取。按生年干的目标身份定位已有事实，
    /// 不保存查询结果，也不分配堆内存。
    #[must_use]
    pub fn birth_transformations(&self) -> [(&Palace, &Star); 4] {
        rules::compute_transformation_stars(self.profile.birth_stem())
            .map(|name| (self.palace_by_star(name), self.star(name)))
    }

    /// 遍历带有任一自化的星曜，返回 `(目标宫位, 目标星曜)` 的借用。
    ///
    /// 按寅至丑、宫内 [`StarName::ALL`] 顺序遍历；同星同时有向心和离心自化
    /// 时只返回一项，两种化象都保留在 [`Star::self_transformations`] 中。
    /// 不受生年四化影响，不包含连续飞化、解释或断语。
    pub fn self_transformations(&self) -> impl Iterator<Item = (&Palace, &Star)> + '_ {
        self.palaces.iter().flat_map(|palace| {
            palace.stars().iter().filter_map(move |star| {
                let transformations = star.self_transformations();
                (transformations.inward().is_some() || transformations.outward().is_some())
                    .then_some((palace, star))
            })
        })
    }

    /// 返回源宫宫干发出的指定一种四化关系。
    ///
    /// `kind` 的 `A / B / C / D` 分别表示禄、权、科、忌，每种都有唯一结果。
    /// 源、目标均为实际地支，同宫关系保留；仅定位指定一项，不生成完整四项结果，
    /// 不缓存、不分配堆内存、不修改本命事实。
    /// 查询全部四化使用 [`Self::palace_transformations`]。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{BirthMonth, Branch, Gender, Parameters, StarName, Stem, Transformation, Ziwei};
    /// let natal = Ziwei::from_parameters(Parameters::new(
    ///     Gender::Male, Stem::Jia, Branch::Zi, BirthMonth::try_from(1)?,
    ///     Branch::Yin, Branch::Zi,
    /// )?)?;
    /// // 寅宫为丙干，化忌命中午宫的廉贞。
    /// let ji = natal.palace_transformation(Branch::Yin, Transformation::D);
    /// assert_eq!(ji.source_branch(), Branch::Yin);
    /// assert_eq!(ji.target_branch(), Branch::Wu);
    /// assert_eq!(ji.transformation(), Transformation::D);
    /// assert_eq!(ji.star(), StarName::LianZhen);
    /// # Ok::<(), ziwei::ZiweiError>(())
    /// ```
    #[must_use]
    pub fn palace_transformation(
        &self,
        source_branch: Branch,
        kind: Transformation,
    ) -> PalaceTransformation {
        rules::compute_palace_transformation(self, source_branch, kind)
    }

    /// 按需返回源宫宫干的四条关系，顺序固定为 `A / B / C / D`。
    ///
    /// 源、目标均为实际地支；同宫关系保留，不包含连续飞化或解释。
    /// 不缓存、不分配堆内存、不修改星曜的生年四化或自化事实。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{BirthMonth, Branch, Gender, Parameters, StarName, Stem, Transformation, Ziwei};
    /// let natal = Ziwei::from_parameters(Parameters::new(
    ///     Gender::Female, Stem::Ren, Branch::Shen, BirthMonth::try_from(8)?,
    ///     Branch::You, Branch::Mao,
    /// )?)?;
    /// // 子宫的宫干是壬，禄落在子宫的天梁；同宫关系仍然保留。
    /// let lu = natal.palace_transformations(Branch::Zi)[0];
    /// assert_eq!(lu.source_branch(), Branch::Zi);
    /// assert_eq!(lu.target_branch(), Branch::Zi);
    /// assert_eq!(lu.transformation(), Transformation::A);
    /// assert_eq!(lu.star(), StarName::TianLiang);
    /// # Ok::<(), ziwei::ZiweiError>(())
    /// ```
    #[must_use]
    pub fn palace_transformations(&self, source_branch: Branch) -> [PalaceTransformation; 4] {
        rules::compute_palace_transformations(self, source_branch)
    }

    /// 查询指定实际宫位的四化来源，逐条返回命中的宫干四化关系。
    ///
    /// 源宫按寅至丑排列，同一源宫内按 `A / B / C / D` 排列。
    /// 同宫关系及同一源宫的不同化象分别保留；没有命中时迭代器为空。
    /// 不缓存、不分配堆内存，也不修改本命事实。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{BirthMonth, Branch, Gender, Parameters, StarName, Stem, Transformation, Ziwei};
    /// let natal = Ziwei::from_parameters(Parameters::new(
    ///     Gender::Female, Stem::Ren, Branch::Shen, BirthMonth::try_from(8)?,
    ///     Branch::You, Branch::Mao,
    /// )?)?;
    /// // 寅、子两宫同为壬干，均向子宫天梁发出化禄；子宫的同宫关系保留。
    /// let sources: Vec<_> = natal.palace_transformation_sources(Branch::Zi)
    ///     .filter(|relation| relation.transformation() == Transformation::A)
    ///     .map(|relation| {
    ///         assert_eq!(relation.star(), StarName::TianLiang);
    ///         relation.source_branch()
    ///     })
    ///     .collect();
    /// assert_eq!(sources, [Branch::Yin, Branch::Zi]);
    /// # Ok::<(), ziwei::ZiweiError>(())
    /// ```
    pub fn palace_transformation_sources(
        &self,
        target_branch: Branch,
    ) -> impl Iterator<Item = PalaceTransformation> + '_ {
        self.palaces
            .iter()
            .flat_map(|palace| self.palace_transformations(palace.branch()))
            .filter(move |relation| relation.target_branch() == target_branch)
    }

    /// 按虚岁返回 `(大限序号, 大限内流年序号)`；无匹配期间时返回 `None`。
    ///
    /// 五行局数为 `b` 时，仅匹配闭区间 `b..=b + 119`；`0`、起限前和
    /// 第十二大限之后的年龄均无匹配。不循环或截断到首末期间。
    /// 输入是虚岁，不是周岁或数字年份；不依赖数字出生年份或大限顺逆。
    /// 直接计算索引，不生成年龄摘要或期间布局，不缓存、不分配堆内存。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{BirthMonth, Branch, Gender, Parameters, Stem, Ziwei};
    /// let natal = Ziwei::from_parameters(Parameters::new(
    ///     Gender::Male, Stem::Jia, Branch::Zi, BirthMonth::try_from(1)?,
    ///     Branch::Yin, Branch::Zi,
    /// )?)?;
    /// // 火六局从虚岁六岁起限：三十五岁是第三大限的第十年。
    /// let (decade, yearly) = natal.period_indices_at_age(35).unwrap();
    /// assert_eq!((decade.get(), yearly.get()), (2, 9));
    /// assert_eq!(natal.period_indices_at_age(5), None);
    /// assert_eq!(natal.period_indices_at_age(126), None);
    /// # Ok::<(), ziwei::ZiweiError>(())
    /// ```
    #[must_use]
    pub fn period_indices_at_age(&self, age: u8) -> Option<(DecadeIndex, YearlyIndex)> {
        rules::compute_period_indices_at_age(self, age)
    }

    /// 按需返回指定大限的十二宫职。
    ///
    /// `index` 从零开始，`0` 表示第一大限。结果按寅至丑排列，与 [`Self::palaces`]
    /// 逐项对应。大命从本命命宫按大限顺逆移动，其余宫职始终从大命逆布。
    /// 每次调用直接生成固定数组，不缓存、不分配堆内存，也不修改本命事实。
    /// 序号范围已由 [`DecadeIndex`] 保证，因此直接返回结果。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{Birth, BirthDay, BirthMonth, Branch, DecadeIndex, Gender, PalaceName, Ziwei};
    ///
    /// let natal = Ziwei::from_birth(Birth {
    ///     gender: Gender::Male,
    ///     birth_year: 1984,
    ///     birth_month: BirthMonth::try_from(1)?,
    ///     birth_day: BirthDay::try_from(1)?,
    ///     birth_hour: Branch::Zi,
    /// })?;
    /// let second_decade = natal.decade(DecadeIndex::try_from(1)?);
    /// // 甲年男命顺行：本命命宫在寅，第二大限的大命在卯。
    /// assert_eq!(natal.palaces()[1].branch(), Branch::Mao);
    /// assert_eq!(second_decade[1].name(), PalaceName::Ming);
    /// assert_eq!(second_decade[1].name_hans(), "大命");
    /// # Ok::<(), ziwei::ZiweiError>(())
    /// ```
    #[must_use]
    pub fn decade(&self, index: DecadeIndex) -> [Decade; 12] {
        rules::compute_decade(self, index)
    }

    /// 按实际地支返回该宫在指定大限中的宫职。
    ///
    /// 直接按值生成一个 [`Decade`]，不生成十二项布局、不缓存、不分配堆内存。
    /// 不修改本命宫职；读取整盘期间宫职时使用 [`Self::decade`]。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{BirthMonth, Branch, DecadeIndex, Gender, PalaceName, Parameters, Stem, Ziwei};
    /// let natal = Ziwei::from_parameters(Parameters::new(
    ///     Gender::Male, Stem::Jia, Branch::Zi, BirthMonth::try_from(1)?,
    ///     Branch::Yin, Branch::Zi,
    /// )?)?;
    /// let role = natal.decade_by_branch(DecadeIndex::try_from(1)?, Branch::Mao);
    /// assert_eq!(role.name(), PalaceName::Ming);
    /// assert_eq!(role.name_hans(), "大命");
    /// assert_eq!(natal.palace(Branch::Mao).name(), PalaceName::FuMu);
    /// # Ok::<(), ziwei::ZiweiError>(())
    /// ```
    #[must_use]
    pub fn decade_by_branch(&self, decade: DecadeIndex, branch: Branch) -> Decade {
        rules::compute_decade_by_branch(self, decade, branch)
    }

    /// 按指定大限的宫职返回命盘内唯一的实际宫位。
    ///
    /// `decade` 为零基大限序号；不先生成十二宫职布局。
    /// 返回本命宫位的借用，其 [`Palace::name`] 仍表示本命宫职，
    /// 不会被改为查询时传入的大限宫职。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{BirthMonth, Branch, DecadeIndex, Gender, PalaceName, Parameters, Stem, Ziwei};
    /// let natal = Ziwei::from_parameters(Parameters::new(
    ///     Gender::Male, Stem::Jia, Branch::Zi, BirthMonth::try_from(1)?,
    ///     Branch::Yin, Branch::Zi,
    /// )?)?;
    /// // 阳男顺行：第二大限的大命在卯，对应本命父母宫。
    /// let palace = natal.decade_palace_by_name(DecadeIndex::try_from(1)?, PalaceName::Ming);
    /// assert_eq!(palace.branch(), Branch::Mao);
    /// assert_eq!(palace.name(), PalaceName::FuMu);
    /// assert!(core::ptr::eq(palace, natal.palace(Branch::Mao)));
    /// # Ok::<(), ziwei::ZiweiError>(())
    /// ```
    #[must_use]
    pub fn decade_palace_by_name(&self, decade: DecadeIndex, name: PalaceName) -> &Palace {
        self.palace(rules::compute_decade_palace_branch(self, decade, name))
    }

    /// 按需返回指定大限内按时间递增的十项年度摘要。
    ///
    /// `decade` 从零开始，数组位置依次对应大限内 `0..=9` 的流年序号。
    /// 每项虚岁为五行局数加 `10 × 大限序号` 再加流年序号，数字年份为出生年份加虚岁减一。
    /// 出生年份仍为 `i32`，摘要年份使用 `i64`；缺少数字出生年份时，各项年份均为 `None`。
    /// 结果不包含流年宫职，不缓存、不分配堆内存，也不修改本命事实。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{Birth, BirthDay, BirthMonth, Branch, DecadeIndex, Gender, Ziwei};
    ///
    /// let natal = Ziwei::from_birth(Birth {
    ///     gender: Gender::Female,
    ///     birth_year: 1992,
    ///     birth_month: BirthMonth::try_from(8)?,
    ///     birth_day: BirthDay::try_from(17)?,
    ///     birth_hour: Branch::Mao,
    /// })?;
    /// let years = natal.decade_years(DecadeIndex::try_from(0)?);
    /// assert_eq!((years[0].age(), years[0].year()), (2, Some(1993)));
    /// assert_eq!((years[9].age(), years[9].year()), (11, Some(2002)));
    /// # Ok::<(), ziwei::ZiweiError>(())
    /// ```
    #[must_use]
    pub fn decade_years(&self, decade: DecadeIndex) -> [DecadeYear; 10] {
        rules::compute_decade_years(self, decade)
    }

    /// 按需返回指定大限内某一流年的十二宫职。
    ///
    /// `decade` 为零基大限序号，`index` 为该大限内 `0..=9` 的流年序号，不是数字年份。
    /// 返回数组按寅至丑排列，与 [`Self::palaces`] 逐项对应。
    /// 流命由生年支与虚岁确定，其余宫职始终从流命逆布，不受大限顺逆影响。
    /// 不依赖数字出生年份，因此两种创建入口均可使用。
    ///
    /// 参数范围已由索引类型保证，直接返回结果；不先生成大限布局或年度摘要，
    /// 不缓存、不分配堆内存，也不修改本命事实。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{
    ///     Birth, BirthDay, BirthMonth, Branch, DecadeIndex, Gender, PalaceName, YearlyIndex, Ziwei,
    /// };
    ///
    /// let natal = Ziwei::from_birth(Birth {
    ///     gender: Gender::Female,
    ///     birth_year: 1992,
    ///     birth_month: BirthMonth::try_from(8)?,
    ///     birth_day: BirthDay::try_from(17)?,
    ///     birth_hour: Branch::Mao,
    /// })?;
    /// let yearly = natal.yearly(DecadeIndex::try_from(0)?, YearlyIndex::try_from(0)?);
    /// // 壬申年、水二局，第一大限第一年为虚岁二岁，流命在酉。
    /// assert_eq!(natal.palaces()[7].branch(), Branch::You);
    /// assert_eq!(yearly[7].name(), PalaceName::Ming);
    /// assert_eq!(yearly[7].name_hans(), "流命");
    /// # Ok::<(), ziwei::ZiweiError>(())
    /// ```
    #[must_use]
    pub fn yearly(&self, decade: DecadeIndex, index: YearlyIndex) -> [Yearly; 12] {
        rules::compute_yearly(self, decade, index)
    }

    /// 按实际地支返回该宫在指定流年中的宫职。
    ///
    /// `yearly` 为该大限内的零基流年序号，不是数字年份。
    /// 直接按值生成一个 [`Yearly`]，不生成期间布局或年度摘要，不依赖数字出生年份。
    /// 不缓存、不分配堆内存、不修改本命事实；读取整盘时使用 [`Self::yearly`]。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{
    ///     BirthMonth, Branch, DecadeIndex, Gender, PalaceName, Parameters, Stem, YearlyIndex, Ziwei,
    /// };
    /// let natal = Ziwei::from_parameters(Parameters::new(
    ///     Gender::Female, Stem::Ren, Branch::Shen, BirthMonth::try_from(8)?,
    ///     Branch::You, Branch::Mao,
    /// )?)?;
    /// let role = natal.yearly_by_branch(
    ///     DecadeIndex::try_from(0)?, YearlyIndex::try_from(0)?, Branch::You,
    /// );
    /// assert_eq!(role.name(), PalaceName::Ming);
    /// assert_eq!(role.name_hant(), "流命");
    /// # Ok::<(), ziwei::ZiweiError>(())
    /// ```
    #[must_use]
    pub fn yearly_by_branch(
        &self,
        decade: DecadeIndex,
        yearly: YearlyIndex,
        branch: Branch,
    ) -> Yearly {
        rules::compute_yearly_by_branch(self, decade, yearly, branch)
    }

    /// 按指定流年的宫职返回命盘内唯一的实际宫位。
    ///
    /// `decade` 为零基大限序号，`yearly` 为该大限内的零基流年序号。
    /// 不依赖数字出生年份，不先生成期间布局或年度摘要。
    /// 返回本命宫位的借用，其 [`Palace::name`] 仍表示本命宫职，
    /// 不会被改为查询时传入的流年宫职。
    ///
    /// # Examples
    ///
    /// ```
    /// use ziwei::{
    ///     BirthMonth, Branch, DecadeIndex, Gender, PalaceName, Parameters, Stem, YearlyIndex, Ziwei,
    /// };
    /// let natal = Ziwei::from_parameters(Parameters::new(
    ///     Gender::Female, Stem::Ren, Branch::Shen, BirthMonth::try_from(8)?,
    ///     Branch::You, Branch::Mao,
    /// )?)?;
    /// // 壬申年、水二局：虚岁二岁的流命在酉，对应本命田宅宫。
    /// let palace = natal.yearly_palace_by_name(
    ///     DecadeIndex::try_from(0)?, YearlyIndex::try_from(0)?, PalaceName::Ming,
    /// );
    /// assert_eq!(palace.branch(), Branch::You);
    /// assert_eq!(palace.name(), PalaceName::TianZhai);
    /// assert!(core::ptr::eq(palace, natal.palace(Branch::You)));
    /// # Ok::<(), ziwei::ZiweiError>(())
    /// ```
    #[must_use]
    pub fn yearly_palace_by_name(
        &self,
        decade: DecadeIndex,
        yearly: YearlyIndex,
        name: PalaceName,
    ) -> &Palace {
        self.palace(rules::compute_yearly_palace_branch(
            self, decade, yearly, name,
        ))
    }

    /// 由 crate 内的排盘规则创建本命盘。
    #[expect(
        clippy::too_many_arguments,
        reason = "crate 内构造器按已确认字段逐项接收本命事实，避免新增中间公开模型"
    )]
    pub(crate) fn new(
        profile: Profile,
        zodiac: Zodiac,
        five_element_bureau: FiveElementBureau,
        palaces: [Palace; 12],
        ming_palace_branch: Branch,
        shen_palace_name: PalaceName,
        shen_palace_branch: Branch,
        origin_palace_name: PalaceName,
        origin_palace_branch: Branch,
        ziwei_palace_name: PalaceName,
        ziwei_branch: Branch,
    ) -> Self {
        // 从本次构造的实际存储建立索引，避免查询时重建或在两个位置维护索引。
        // 固定十二宫、全盘十八星，下标均可由 u8 无损表示。
        let mut star_locations = [StarLocation { palace: 0, star: 0 }; StarName::ALL.len()];
        for (palace_index, palace) in palaces.iter().enumerate() {
            for (star_index, star) in palace.stars().iter().enumerate() {
                star_locations[star.name().index()] = StarLocation {
                    palace: palace_index as u8,
                    star: star_index as u8,
                };
            }
        }
        Self {
            profile,
            zodiac,
            five_element_bureau,
            palaces,
            star_locations,
            ming_palace_branch,
            shen_palace_name,
            shen_palace_branch,
            origin_palace_name,
            origin_palace_branch,
            ziwei_palace_name,
            ziwei_branch,
        }
    }
}

// 私有加速索引不进入可观察的命盘 Debug，原字段及顺序保持。
impl core::fmt::Debug for Natal {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("Natal")
            .field("profile", &self.profile)
            .field("zodiac", &self.zodiac)
            .field("five_element_bureau", &self.five_element_bureau)
            .field("palaces", &self.palaces)
            .field("ming_palace_branch", &self.ming_palace_branch)
            .field("shen_palace_name", &self.shen_palace_name)
            .field("shen_palace_branch", &self.shen_palace_branch)
            .field("origin_palace_name", &self.origin_palace_name)
            .field("origin_palace_branch", &self.origin_palace_branch)
            .field("ziwei_palace_name", &self.ziwei_palace_name)
            .field("ziwei_branch", &self.ziwei_branch)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::Natal;
    use crate::{
        BirthDay, BirthMonth, Branch, DecadeAgeRange, FiveElementBureau, Gender, Palace,
        PalaceName, Profile, Stem, Zodiac,
    };

    fn palace(name: PalaceName, branch: Branch, position: u8) -> Palace {
        Palace::new(
            name,
            branch,
            Stem::Jia,
            crate::domain::PalaceStars::new(),
            DecadeAgeRange::new(FiveElementBureau::WaterTwo, position),
        )
    }

    #[test]
    fn computed_natal_keeps_stored_palace_names_consistent_with_branches() {
        // D-222：壬申年女命、八月卯时、紫微在酉。
        // 命、身、来因、紫微四宫各异，用于核验冗余定位字段未交叉传入。
        let profile = Profile::new(
            None,
            Gender::Female,
            Stem::Ren,
            Branch::Shen,
            BirthMonth::try_from(8).expect("测试月份必须有效"),
            Branch::Mao,
            None,
        );
        let natal = crate::rules::compute_natal(profile, |_| Branch::You);

        assert_eq!(natal.ming_palace_branch, Branch::Wu);
        assert_eq!(
            (natal.shen_palace_branch, natal.shen_palace_name),
            (Branch::Zi, PalaceName::QianYi)
        );
        assert_eq!(
            (natal.origin_palace_branch, natal.origin_palace_name),
            (Branch::Yin, PalaceName::CaiBo)
        );
        assert_eq!(
            (natal.ziwei_branch, natal.ziwei_palace_name),
            (Branch::You, PalaceName::TianZhai)
        );
        assert_eq!(natal.five_element_bureau, FiveElementBureau::WaterTwo);
        assert_eq!(natal.zodiac, Zodiac::Monkey);
        for (name, palace) in [
            (natal.shen_palace_name, natal.shen_palace()),
            (natal.origin_palace_name, natal.origin_palace()),
            (natal.ziwei_palace_name, natal.ziwei_palace()),
        ] {
            assert_eq!(name, palace.name());
        }
    }

    #[test]
    fn natal_holds_the_confirmed_natal_facts() {
        let profile = Profile::new(
            Some(1992),
            Gender::Female,
            Stem::Ren,
            Branch::Shen,
            BirthMonth::try_from(8).expect("范围内月份必须有效"),
            Branch::Shen,
            Some(BirthDay::try_from(15).expect("范围内日期必须有效")),
        );
        let natal = Natal::new(
            profile,
            Zodiac::Monkey,
            FiveElementBureau::WaterTwo,
            [
                // 固定寅至丑顺序，宫职从寅宫的命宫逆布。
                palace(PalaceName::Ming, Branch::Yin, 0),
                palace(PalaceName::FuMu, Branch::Mao, 1),
                palace(PalaceName::FuDe, Branch::Chen, 2),
                palace(PalaceName::TianZhai, Branch::Si, 3),
                palace(PalaceName::GuanLu, Branch::Wu, 4),
                palace(PalaceName::JiaoYou, Branch::Wei, 5),
                palace(PalaceName::QianYi, Branch::Shen, 6),
                palace(PalaceName::JiE, Branch::You, 7),
                palace(PalaceName::CaiBo, Branch::Xu, 8),
                palace(PalaceName::ZiNv, Branch::Hai, 9),
                palace(PalaceName::FuQi, Branch::Zi, 10),
                palace(PalaceName::XiongDi, Branch::Chou, 11),
            ],
            Branch::Yin,
            PalaceName::FuDe,
            Branch::Chen,
            PalaceName::CaiBo,
            Branch::Xu,
            PalaceName::Ming,
            Branch::Yin,
        );

        assert_eq!(natal.profile(), &profile);
        assert_eq!(natal.zodiac(), Zodiac::Monkey);
        assert_eq!(natal.five_element_bureau(), FiveElementBureau::WaterTwo);
        assert_eq!(natal.palaces().len(), 12);
        assert_eq!(natal.palaces()[0].name(), PalaceName::Ming);
        assert_eq!(natal.palaces()[0].branch(), Branch::Yin);
        assert_eq!(natal.palaces()[11].name(), PalaceName::XiongDi);
        assert_eq!(natal.palaces()[11].branch(), Branch::Chou);
        assert_eq!(natal.ming_palace_branch, Branch::Yin);
        assert_eq!(natal.shen_palace_name, PalaceName::FuDe);
        assert_eq!(natal.shen_palace_branch, Branch::Chen);
        assert_eq!(natal.origin_palace_name, PalaceName::CaiBo);
        assert_eq!(natal.origin_palace_branch, Branch::Xu);
        assert_eq!(natal.ziwei_palace_name, PalaceName::Ming);
        assert_eq!(natal.ziwei_branch, Branch::Yin);

        let expected = [
            (Branch::Yin, PalaceName::Ming),
            (Branch::Mao, PalaceName::FuMu),
            (Branch::Chen, PalaceName::FuDe),
            (Branch::Si, PalaceName::TianZhai),
            (Branch::Wu, PalaceName::GuanLu),
            (Branch::Wei, PalaceName::JiaoYou),
            (Branch::Shen, PalaceName::QianYi),
            (Branch::You, PalaceName::JiE),
            (Branch::Xu, PalaceName::CaiBo),
            (Branch::Hai, PalaceName::ZiNv),
            (Branch::Zi, PalaceName::FuQi),
            (Branch::Chou, PalaceName::XiongDi),
        ];

        for (branch, name) in expected {
            assert_eq!(natal.palace(branch).name(), name);
            assert_eq!(natal.palace_by_name(name).branch(), branch);
        }

        assert_eq!(natal.ming_palace().name(), PalaceName::Ming);
        assert_eq!(natal.shen_palace().name(), PalaceName::FuDe);
        assert_eq!(natal.origin_palace().name(), PalaceName::CaiBo);
        assert_eq!(natal.ziwei_palace().name(), PalaceName::Ming);
    }
}
