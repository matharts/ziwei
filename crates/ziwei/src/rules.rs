//! 排盘规则与按需期间计算；公开入口只转发到本模块。
//!
//! 地支计算使用子起坐标，宫位数组固定按寅至丑排列，星曜数组按 `StarName::ALL` 排列。
//! 仅在访问对应数组时转换索引；规则函数之间传递领域值。
//! 本命构建复用中间计算，期间与宫干四化按需生成，不缓存或修改本命事实。

use crate::domain::{DecadeDirection, PalaceStars, sexagenary_from_birth_year};
use crate::{
    Birth, BirthDay, BirthMonth, Branch, Decade, DecadeAgeRange, DecadeIndex, DecadeYear,
    FiveElementBureau, Gender, Natal, Palace, PalaceName, PalaceTransformation, Parameters,
    Profile, SelfTransformations, Star, StarCategory, StarGalaxy, StarName, Stem, Transformation,
    Yearly, YearlyIndex, YinYang,
};
use core::{array::from_fn, mem};

// 本命构建

/// 从出生资料导出生年干支，保留数字年份与出生日，并复用统一本命盘构建路径。
///
/// 紫微定位推迟到统一路径算出五行局后执行，不重复计算命身宫、宫干或五行局。
#[must_use]
pub(crate) fn compute_natal_from_birth(birth: Birth) -> Natal {
    let (birth_stem, birth_branch) = sexagenary_from_birth_year(birth.birth_year);
    let profile = Profile::new(
        Some(birth.birth_year),
        birth.gender,
        birth_stem,
        birth_branch,
        birth.birth_month,
        birth.birth_hour,
        Some(birth.birth_day),
    );

    compute_natal(profile, |bureau| {
        compute_ziwei_branch(bureau, birth.birth_day)
    })
}

/// 将已验证的直接排盘参数转为出生档案，并复用统一本命盘构建路径。
///
/// 参数不含数字年份与出生日，档案中的对应字段保持 `None`；紫微地支直接采用输入值。
#[must_use]
pub(crate) fn compute_natal_from_parameters(parameters: Parameters) -> Natal {
    let profile = Profile::new(
        None,
        parameters.gender(),
        parameters.birth_stem(),
        parameters.birth_branch(),
        parameters.birth_month(),
        parameters.birth_hour(),
        None,
    );

    compute_natal(profile, |_| parameters.ziwei_branch())
}

/// 由归一化出生档案与一次性紫微定位函数构建完整本命盘。
///
/// 定位函数须对应同一命盘；算出五行局后调用一次，返回紫微地支。
/// 两类输入共用一次命身宫、宫干和五行局计算；定位函数静态分发，不装箱或存储。
/// 复用已有规则计算本命事实，从组装后的宫位读取定位宫职；不克隆星曜或宫位。
/// 不进行历法换算或输入校验，也不预计算大限、流年的宫职布局。
#[must_use]
pub(crate) fn compute_natal(
    profile: Profile,
    resolve_ziwei: impl FnOnce(FiveElementBureau) -> Branch,
) -> Natal {
    let birth_stem = profile.birth_stem();
    let birth_month = profile.birth_month();
    let birth_hour = profile.birth_hour();
    let zodiac = profile.birth_branch().zodiac();
    let (ming_palace_branch, shen_palace_branch) =
        compute_ming_shen_branches(birth_month, birth_hour);
    let palace_stems = compute_palace_stems(birth_stem);
    let palace_names = compute_natal_palace_names(ming_palace_branch);
    let five_element_bureau = FiveElementBureau::from_ming_palace(
        palace_stems[usize::from(ming_palace_branch.index_from_yin())],
        ming_palace_branch,
    );
    let ziwei_branch = resolve_ziwei(five_element_bureau);
    let direction = compute_decade_direction(profile.gender(), birth_stem);
    let decade_age_ranges =
        compute_decade_age_ranges(five_element_bureau, direction, ming_palace_branch);
    let star_branches = compute_star_branches(ziwei_branch, birth_month, birth_hour);
    let stars = compute_stars(birth_stem, &palace_stems, &star_branches);
    let palaces = compute_palaces(
        &palace_names,
        &palace_stems,
        &decade_age_ranges,
        &star_branches,
        stars,
    );
    let origin_palace_branch = compute_origin_palace_branch(birth_stem);
    let shen_palace_name = palaces[usize::from(shen_palace_branch.index_from_yin())].name();
    let origin_palace_name = palaces[usize::from(origin_palace_branch.index_from_yin())].name();
    let ziwei_palace_name = palaces[usize::from(ziwei_branch.index_from_yin())].name();

    Natal::new(
        profile,
        zodiac,
        five_element_bureau,
        palaces,
        ming_palace_branch,
        shen_palace_name,
        shen_palace_branch,
        origin_palace_name,
        origin_palace_branch,
        ziwei_palace_name,
        ziwei_branch,
    )
}

// 宫位与宫职

/// 按出生月与时辰同时计算命宫与身宫地支。
///
/// 寅宫起正月，顺数至出生月；命宫逆数出生时辰，身宫顺数出生时辰。
/// 返回顺序固定为 `(命宫地支, 身宫地支)`。
#[must_use]
pub(crate) const fn compute_ming_shen_branches(
    birth_month: BirthMonth,
    birth_hour: Branch,
) -> (Branch, Branch) {
    // 月份落点使用子起索引，与 Branch::ALL 的顺序一致。
    let month_index = Branch::Yin.index() as i8 + birth_month.get() as i8 - 1;
    let hour_offset = birth_hour.index() as i8;

    (
        Branch::ALL[(month_index - hour_offset).rem_euclid(12) as usize],
        Branch::ALL[(month_index + hour_offset).rem_euclid(12) as usize],
    )
}

/// 按寅至丑的固定顺序返回十二本命宫位名称。
///
/// 从命宫开始，依次逆布命、兄、夫、子、财、疾、迁、友、官、田、福、父。
#[must_use]
pub(crate) fn compute_natal_palace_names(ming_palace_branch: Branch) -> [PalaceName; 12] {
    compute_palace_layout(ming_palace_branch.index_from_yin() as i8, |name| name)
}

/// 本命、大限和流年都从各自命宫逆布宫职，只在结果类型上不同。
/// `ming_index` 使用寅起坐标，可为尚未环绕的大限命宫；各调用的坐标差在 -22..=22。
fn compute_palace_layout<T>(ming_index: i8, make: impl Fn(PalaceName) -> T) -> [T; 12] {
    from_fn(|palace_index| make(compute_palace_name(ming_index, palace_index as i8)))
}

/// 从各自命宫逆布宫职；两个参数均使用寅起坐标，差值在 -22..=22。
fn compute_palace_name(ming_index: i8, palace_index: i8) -> PalaceName {
    let name_index = (ming_index - palace_index).rem_euclid(12) as usize;

    PalaceName::ALL[name_index]
}

/// 按寅至丑的固定顺序返回生年天干对应的十二宫干。
#[must_use]
pub(crate) const fn compute_palace_stems(birth_stem: Stem) -> [Stem; 12] {
    let group_index = match birth_stem {
        Stem::Jia | Stem::Ji => 0,
        Stem::Yi | Stem::Geng => 1,
        Stem::Bing | Stem::Xin => 2,
        Stem::Ding | Stem::Ren => 3,
        Stem::Wu | Stem::Gui => 4,
    };

    Stem::FIVE_TIGER_DUN_PALACE_STEMS[group_index]
}

/// 按生年天干的固定映射返回来因宫地支。
///
/// 甲戌、乙酉、丙申、丁未、戊午、己巳、庚辰、辛卯、壬寅、癸亥。
#[must_use]
pub(crate) const fn compute_origin_palace_branch(birth_stem: Stem) -> Branch {
    match birth_stem {
        Stem::Jia => Branch::Xu,
        Stem::Yi => Branch::You,
        Stem::Bing => Branch::Shen,
        Stem::Ding => Branch::Wei,
        Stem::Wu => Branch::Wu,
        Stem::Ji => Branch::Si,
        Stem::Geng => Branch::Chen,
        Stem::Xin => Branch::Mao,
        Stem::Ren => Branch::Yin,
        Stem::Gui => Branch::Hai,
    }
}

// 安星

/// 按五行局与出生日计算紫微星所在的地支。
///
/// 日数除以局数取上界商，从寅宫顺移商减一宫；补数为奇数则逆退、偶数则顺进。
#[must_use]
pub(crate) const fn compute_ziwei_branch(bureau: FiveElementBureau, birth_day: BirthDay) -> Branch {
    let bureau_number = bureau as u8;
    let day = birth_day.get();
    let quotient = day.div_ceil(bureau_number);
    // 局数为 2..=6，日数为 1..=30；补足后的日数最大为 32，补数为 0..=5。
    let shortfall = (quotient * bureau_number - day) as i8;
    let signed_shortfall = if shortfall % 2 == 0 {
        shortfall
    } else {
        -shortfall
    };
    let branch_index = Branch::Yin.index() as i8 + quotient as i8 - 1 + signed_shortfall;

    Branch::ALL[branch_index.rem_euclid(12) as usize]
}

/// 紫微在子至亥时的十四主星落宫；由原公式在编译期生成，无辅星占位槽。
const MAJOR_STAR_BRANCHES_BY_ZIWE: [[Branch; 14]; 12] = {
    let mut rows = [[Branch::Zi; 14]; 12];
    let mut index = 0;
    while index < rows.len() {
        rows[index] = compute_major_star_branches(Branch::ALL[index]);
        index += 1;
    }
    rows
};

/// 零基偏移对应的辅星地支对：[从辰顺布，从戌逆布]。
/// 月份减一取左辅、右弼；时辰索引取文曲、文昌，输出时交换顺序。
const MINOR_STAR_BRANCH_PAIRS: [[Branch; 2]; 12] = {
    let mut rows = [[Branch::Zi; 2]; 12];
    let mut index = 0;
    while index < rows.len() {
        let offset = index as i8;
        rows[index] = [
            Branch::ALL[(Branch::Chen.index() as i8 + offset).rem_euclid(12) as usize],
            Branch::ALL[(Branch::Xu.index() as i8 - offset).rem_euclid(12) as usize],
        ];
        index += 1;
    }
    rows
};

/// 按紫微地支、出生月与时辰读取十八星的落宫地支。
///
/// 返回顺序与 [`crate::StarName::ALL`] 完全一致：前十四项为主星，最后四项为辅星。
/// 两种输入路径共用此定位入口；每项表示对应星曜的实际地支，而非十二宫展示顺序。
/// 两张小表均在编译期生成，运行时分别按紫微、月份、时辰取行并组装十八项。
#[must_use]
pub(crate) fn compute_star_branches(
    ziwei_branch: Branch,
    birth_month: BirthMonth,
    birth_hour: Branch,
) -> [Branch; StarName::ALL.len()] {
    let major_branches = MAJOR_STAR_BRANCHES_BY_ZIWE[usize::from(ziwei_branch.index())];
    let minor_branches = compute_minor_star_branches(birth_month, birth_hour);
    let mut branches = [ziwei_branch; StarName::ALL.len()];
    let major_count = major_branches.len();
    branches[..major_count].copy_from_slice(&major_branches);
    branches[major_count..].copy_from_slice(&minor_branches);
    branches
}

/// 为编译期主星表计算一行，顺序与 [`crate::StarName::ALL`] 的前十四项一致。
///
/// 紫微组六星逆布，天府组八星顺布；天府与紫微关于寅申轴对称。
/// 这里的排布分组不代表星曜的南斗、中斗、北斗归属。
#[must_use]
const fn compute_major_star_branches(ziwei_branch: Branch) -> [Branch; 14] {
    let ziwei_index = ziwei_branch.index() as i8;
    let tianfu_index = 2 * Branch::Yin.index() as i8 - ziwei_index;

    // 统一使用子起坐标；未环绕的坐标范围为 -8..=14，i8 足以容纳。
    let indices = [
        ziwei_index,       // 紫微
        ziwei_index - 1,   // 天机
        ziwei_index - 3,   // 太阳
        ziwei_index - 4,   // 武曲
        ziwei_index - 5,   // 天同
        ziwei_index - 8,   // 廉贞
        tianfu_index,      // 天府
        tianfu_index + 1,  // 太阴
        tianfu_index + 2,  // 贪狼
        tianfu_index + 3,  // 巨门
        tianfu_index + 4,  // 天相
        tianfu_index + 5,  // 天梁
        tianfu_index + 6,  // 七杀
        tianfu_index + 10, // 破军
    ];
    let mut branches = [Branch::Zi; 14];
    let mut index = 0;
    while index < branches.len() {
        branches[index] = Branch::ALL[indices[index].rem_euclid(12) as usize];
        index += 1;
    }
    branches
}

/// 按出生月与时辰计算左辅、右弼、文昌、文曲的地支。
///
/// 返回顺序与 [`crate::StarName::ALL`] 的最后四项一致。
/// 左辅从辰起正月顺行，右弼从戌起正月逆行；
/// 文昌从戌起子时逆行，文曲从辰起子时顺行。
#[must_use]
fn compute_minor_star_branches(birth_month: BirthMonth, birth_hour: Branch) -> [Branch; 4] {
    let [zuo_fu, you_bi] = MINOR_STAR_BRANCH_PAIRS[usize::from(birth_month.get() - 1)];
    let [wen_qu, wen_chang] = MINOR_STAR_BRANCH_PAIRS[usize::from(birth_hour.index())];

    [zuo_fu, you_bi, wen_chang, wen_qu]
}

// 四化

/// 十干四化目标星曜：行对应 [`Stem::ALL`]，列对应 [`crate::Transformation::ALL`]。
///
/// 采用项目唯一排盘规则，壬干化科为左辅。
const TRANSFORMATION_STARS_BY_STEM: [[StarName; 4]; 10] = {
    use StarName::{
        JuMen, LianZhen, PoJun, TaiYang, TaiYin, TanLang, TianJi, TianLiang, TianTong, WenChang,
        WenQu, WuQu, YouBi, ZiWei, ZuoFu,
    };

    [
        [LianZhen, PoJun, WuQu, TaiYang],       // 甲
        [TianJi, TianLiang, ZiWei, TaiYin],     // 乙
        [TianTong, TianJi, WenChang, LianZhen], // 丙
        [TaiYin, TianTong, TianJi, JuMen],      // 丁
        [TanLang, TaiYin, YouBi, TianJi],       // 戊
        [WuQu, TanLang, TianLiang, WenQu],      // 己
        [TaiYang, WuQu, TaiYin, TianTong],      // 庚
        [JuMen, TaiYang, WenQu, WenChang],      // 辛
        [TianLiang, ZiWei, ZuoFu, WuQu],        // 壬
        [PoJun, JuMen, TaiYin, TanLang],        // 癸
    ]
};

/// 按天干返回禄、权、科、忌对应的四颗星曜身份。
///
/// 顺序与 [`crate::Transformation::ALL`] 一致；生年干与宫干共用同一映射。
#[must_use]
pub(crate) const fn compute_transformation_stars(stem: Stem) -> [StarName; 4] {
    TRANSFORMATION_STARS_BY_STEM[stem.index() as usize]
}

/// 直接查找指定化象的目标星曜，仅生成一条宫干四化关系。
#[must_use]
pub(crate) fn compute_palace_transformation(
    natal: &Natal,
    source_branch: Branch,
    kind: Transformation,
) -> PalaceTransformation {
    let stem = natal.palace(source_branch).stem();
    let star = TRANSFORMATION_STARS_BY_STEM[stem.index() as usize][kind.index()];
    PalaceTransformation::new(
        source_branch,
        natal.palace_by_star(star).branch(),
        kind,
        star,
    )
}

/// 从已建本命盘按需生成源宫的四条宫干四化关系。
/// 按禄、权、科、忌通过本命盘的持久星曜位置索引定位目标；不重新安星或缓存。
#[must_use]
pub(crate) fn compute_palace_transformations(
    natal: &Natal,
    source_branch: Branch,
) -> [PalaceTransformation; 4] {
    let stars = compute_transformation_stars(natal.palace(source_branch).stem());
    from_fn(|index| {
        let star = stars[index];
        PalaceTransformation::new(
            source_branch,
            natal.palace_by_star(star).branch(),
            Transformation::ALL[index],
            star,
        )
    })
}

/// 按生年天干分配十八星的生年四化，顺序与 [`StarName::ALL`] 一致。
///
/// 四颗目标星各承接一种四化，其余十四星为 `None`。
/// 返回值用于星曜组装，不计算自化，也不新增命盘字段。
#[must_use]
pub(crate) fn compute_birth_transformations(
    birth_stem: Stem,
) -> [Option<Transformation>; StarName::ALL.len()] {
    let mut transformations = [None; StarName::ALL.len()];

    for (transformation, star) in Transformation::ALL
        .into_iter()
        .zip(compute_transformation_stars(birth_stem))
    {
        transformations[star.index()] = Some(transformation);
    }

    transformations
}

/// 按十二宫宫干与十八星落宫计算自化，结果顺序与 [`StarName::ALL`] 一致。
///
/// `palace_stems` 按寅至丑排列，`star_branches` 按 [`StarName::ALL`] 排列。
/// 本宫宫干四化命中该星为离心，对宫宫干四化命中该星为向心。
/// 两种自化独立保存，不受生年四化影响。
#[must_use]
pub(crate) fn compute_self_transformations(
    palace_stems: &[Stem; 12],
    star_branches: &[Branch; StarName::ALL.len()],
) -> [SelfTransformations; StarName::ALL.len()] {
    let mut inward = [None; StarName::ALL.len()];
    let mut outward = [None; StarName::ALL.len()];

    for (palace_index, stem) in palace_stems.iter().copied().enumerate() {
        let opposite_index = (palace_index + 6) % palace_stems.len();

        for (transformation, star) in Transformation::ALL
            .into_iter()
            .zip(compute_transformation_stars(stem))
        {
            let star_index = star.index();
            let target_index = usize::from(star_branches[star_index].index_from_yin());

            if target_index == palace_index {
                outward[star_index] = Some(transformation);
            }
            if target_index == opposite_index {
                inward[star_index] = Some(transformation);
            }
        }
    }

    from_fn(|index| SelfTransformations::new(inward[index], outward[index]))
}

// 限运

/// 按性别与生年干阴阳计算大限顺逆。
#[must_use]
pub(crate) const fn compute_decade_direction(gender: Gender, birth_stem: Stem) -> DecadeDirection {
    match (gender.yin_yang(), birth_stem.yin_yang()) {
        (YinYang::Yin, YinYang::Yin) | (YinYang::Yang, YinYang::Yang) => DecadeDirection::Forward,
        _ => DecadeDirection::Reverse,
    }
}

/// 返回按寅至丑固定顺序排列的十二宫大限年龄区间。
///
/// 从 `ming_palace_branch` 所在宫位起第一大限，后续大限按 `direction` 顺行或逆行排布。
#[must_use]
pub(crate) fn compute_decade_age_ranges(
    bureau: FiveElementBureau,
    direction: DecadeDirection,
    ming_palace_branch: Branch,
) -> [DecadeAgeRange; 12] {
    let ming_palace_index = ming_palace_branch.index_from_yin() as i8;
    let direction = match direction {
        DecadeDirection::Forward => 1,
        DecadeDirection::Reverse => -1,
    };

    from_fn(|palace_index| {
        let position = ((palace_index as i8 - ming_palace_index) * direction).rem_euclid(12) as u8;

        DecadeAgeRange::new(bureau, position)
    })
}

/// 从本命事实按需生成指定大限的十二宫职，顺序固定为寅至丑。
///
/// 大命从本命命宫按大限顺逆移动 `index` 宫，再从大命逆布十二宫职。
/// 仅借用本命事实，不重新排盘、不生成年龄区间，也不缓存结果。
#[must_use]
pub(crate) fn compute_decade(natal: &Natal, index: DecadeIndex) -> [Decade; 12] {
    compute_palace_layout(compute_decade_ming_index(natal, index), Decade::new)
}

/// 按实际地支直接返回指定大限宫职，不生成十二宫职布局。
#[must_use]
pub(crate) fn compute_decade_by_branch(
    natal: &Natal,
    decade: DecadeIndex,
    branch: Branch,
) -> Decade {
    Decade::new(compute_palace_name(
        compute_decade_ming_index(natal, decade),
        branch.index_from_yin() as i8,
    ))
}

/// 按指定大限宫职直接定位实际地支，不生成十二宫职布局。
#[must_use]
pub(crate) fn compute_decade_palace_branch(
    natal: &Natal,
    index: DecadeIndex,
    name: PalaceName,
) -> Branch {
    compute_palace_branch(compute_decade_ming_index(natal, index), name)
}

/// 大命的寅起坐标保留顺逆移动后的值，由布局或单宫定位统一环绕。
fn compute_decade_ming_index(natal: &Natal, index: DecadeIndex) -> i8 {
    let profile = natal.profile();
    let direction = match compute_decade_direction(profile.gender(), profile.birth_stem()) {
        DecadeDirection::Forward => 1,
        DecadeDirection::Reverse => -1,
    };
    natal.ming_palace().branch().index_from_yin() as i8 + direction * index.get() as i8
}

/// 按需返回指定大限内按时间递增的十项虚岁与数字年份摘要。
///
/// 年龄只由五行局与期间序号确定，与宫位顺逆无关；不生成宫职布局。
#[must_use]
pub(crate) fn compute_decade_years(natal: &Natal, decade: DecadeIndex) -> [DecadeYear; 10] {
    let start_age = natal.five_element_bureau() as u8 + 10 * decade.get();
    let birth_year = natal.profile().birth_year().map(i64::from);

    // 起始虚岁为 2..=116，加上年度序号后为 2..=125，u8 足以容纳。
    // 出生年份先扩宽为 i64，再加最多 124 年的偏移，避免 i32 边界溢出。
    from_fn(|index| {
        let age = start_age + index as u8;
        let year = birth_year.map(|year| year + i64::from(age) - 1);

        DecadeYear::new(age, year)
    })
}

/// 将有效覆盖区间内的虚岁映射为大限与流年序号；不读取数字年份或生成年度摘要。
#[must_use]
pub(crate) fn compute_period_indices_at_age(
    natal: &Natal,
    age: u8,
) -> Option<(DecadeIndex, YearlyIndex)> {
    let offset = age.checked_sub(natal.five_element_bureau() as u8)?;
    if offset >= 120 {
        return None;
    }

    // 十二大限各十年：商在 0..=11，余数在 0..=9，沿用值类型的校验入口。
    Some((
        DecadeIndex::try_from(offset / 10).ok()?,
        YearlyIndex::try_from(offset % 10).ok()?,
    ))
}

/// 按需返回指定流年的十二宫职，顺序固定为寅至丑。
///
/// 流命为生年支加虚岁减一，再从流命逆布宫职。
/// 不依赖数字出生年份、大限顺逆或其他期间查询结果。
#[must_use]
pub(crate) fn compute_yearly(
    natal: &Natal,
    decade: DecadeIndex,
    index: YearlyIndex,
) -> [Yearly; 12] {
    compute_palace_layout(compute_yearly_ming_index(natal, decade, index), Yearly::new)
}

/// 按实际地支直接返回指定流年宫职，不生成十二宫职布局。
#[must_use]
pub(crate) fn compute_yearly_by_branch(
    natal: &Natal,
    decade: DecadeIndex,
    yearly: YearlyIndex,
    branch: Branch,
) -> Yearly {
    Yearly::new(compute_palace_name(
        compute_yearly_ming_index(natal, decade, yearly),
        branch.index_from_yin() as i8,
    ))
}

/// 按指定流年宫职直接定位实际地支，不生成十二宫职布局。
#[must_use]
pub(crate) fn compute_yearly_palace_branch(
    natal: &Natal,
    decade: DecadeIndex,
    index: YearlyIndex,
    name: PalaceName,
) -> Branch {
    compute_palace_branch(compute_yearly_ming_index(natal, decade, index), name)
}

fn compute_yearly_ming_index(natal: &Natal, decade: DecadeIndex, index: YearlyIndex) -> i8 {
    let age = natal.five_element_bureau() as u8 + 10 * decade.get() + index.get();
    // 虚岁为 2..=125，生年支索引为 0..=11，相加至多 136，u8 足以容纳。
    let branch_index = (natal.profile().birth_branch().index() + age - 1) % 12;
    Branch::ALL[usize::from(branch_index)].index_from_yin() as i8
}

/// 宫职从命宫逆布；将寅起宫位坐标转为 `Branch::ALL` 的子起坐标。
fn compute_palace_branch(ming_index: i8, name: PalaceName) -> Branch {
    let branch_index = ming_index + Branch::Yin.index() as i8 - name.index() as i8;

    Branch::ALL[branch_index.rem_euclid(12) as usize]
}

// 星曜与宫位组装

/// 组装十八颗本命星曜，顺序与 [`StarName::ALL`] 一致。
///
/// `palace_stems` 为本盘按寅至丑排列的宫干，`star_branches` 按 [`StarName::ALL`] 排列。
/// 复用生年四化与自化规则，在组装处提供固定类别和星系；不重新计算落宫或组装十二宫。
/// 星曜逐颗生成并移入宫位，不先构造完整的星曜数组。
#[must_use]
pub(crate) fn compute_stars(
    birth_stem: Stem,
    palace_stems: &[Stem; 12],
    star_branches: &[Branch; StarName::ALL.len()],
) -> impl ExactSizeIterator<Item = Star> {
    let birth_transformations = compute_birth_transformations(birth_stem);
    let self_transformations = compute_self_transformations(palace_stems, star_branches);

    StarName::ALL
        .into_iter()
        .enumerate()
        .map(move |(index, name)| {
            let (category, galaxy) = match name {
                StarName::ZiWei | StarName::TianFu | StarName::TianXiang | StarName::QiSha => {
                    (StarCategory::Major, StarGalaxy::Central)
                }
                StarName::TianJi
                | StarName::TaiYang
                | StarName::WuQu
                | StarName::TianTong
                | StarName::LianZhen => (StarCategory::Major, StarGalaxy::North),
                StarName::TaiYin
                | StarName::TanLang
                | StarName::JuMen
                | StarName::TianLiang
                | StarName::PoJun => (StarCategory::Major, StarGalaxy::South),
                StarName::ZuoFu | StarName::YouBi | StarName::WenChang | StarName::WenQu => {
                    (StarCategory::Minor, StarGalaxy::Central)
                }
            };

            Star::new(
                name,
                category,
                galaxy,
                birth_transformations[index],
                self_transformations[index],
            )
        })
}

/// 将十八颗星曜移入所属宫位，返回按寅至丑排列的十二个本命宫位。
///
/// 三组宫位数据均按寅至丑排列，`star_branches` 与 `stars` 均按 [`StarName::ALL`] 排列。
/// 所有输入须来自同一命盘；只组装已计算的事实，不重算落宫、四化或大限年龄。
/// 星曜按输入顺序直接移入固定容量集合，不克隆、不分配堆内存。
#[must_use]
pub(crate) fn compute_palaces(
    palace_names: &[PalaceName; 12],
    palace_stems: &[Stem; 12],
    decade_age_ranges: &[DecadeAgeRange; 12],
    star_branches: &[Branch; StarName::ALL.len()],
    stars: impl ExactSizeIterator<Item = Star>,
) -> [Palace; 12] {
    debug_assert_eq!(stars.len(), star_branches.len());
    let mut palace_stars: [PalaceStars; 12] = from_fn(|_| PalaceStars::new());

    for (star, &branch) in stars.zip(star_branches) {
        palace_stars[usize::from(branch.index_from_yin())]
            .try_push(star)
            .expect("当前安星规则的单宫星数不得超过已验证容量");
    }

    from_fn(|index| {
        let branch = Branch::ALL[(index + usize::from(Branch::Yin.index())) % 12];

        Palace::new(
            palace_names[index],
            branch,
            palace_stems[index],
            mem::take(&mut palace_stars[index]),
            decade_age_ranges[index],
        )
    })
}

#[cfg(test)]
mod tests {
    use super::{
        compute_birth_transformations, compute_decade_age_ranges, compute_decade_direction,
        compute_ming_shen_branches, compute_natal, compute_natal_palace_names,
        compute_origin_palace_branch, compute_palace_stems, compute_palaces,
        compute_self_transformations, compute_star_branches, compute_stars,
        compute_transformation_stars, compute_ziwei_branch,
    };
    use crate::domain::DecadeDirection;
    use crate::{
        BirthDay, BirthMonth, Branch, FiveElementBureau, Gender, PalaceName, Profile, Star,
        StarCategory, StarGalaxy, StarName, Stem, Transformation, Zodiac,
    };

    #[test]
    fn ming_and_shen_branches_follow_confirmed_counting_directions() {
        // 依据：CONTEXT.md 的“命宫地支”“身宫”；适用项目唯一排盘规则。
        // 覆盖正月、十二月与子时、亥时，以及跨越子亥的顺逆计数。
        let expected = [
            (1, Branch::Zi, Branch::Yin, Branch::Yin),
            (1, Branch::Chou, Branch::Chou, Branch::Mao),
            (1, Branch::Hai, Branch::Mao, Branch::Chou),
            (6, Branch::Wu, Branch::Chou, Branch::Chou),
            (12, Branch::Zi, Branch::Chou, Branch::Chou),
            (12, Branch::Hai, Branch::Yin, Branch::Zi),
        ];

        for (month, birth_hour, ming_branch, shen_branch) in expected {
            let birth_month = BirthMonth::try_from(month).expect("测试月份必须有效");

            assert_eq!(
                compute_ming_shen_branches(birth_month, birth_hour),
                (ming_branch, shen_branch),
                "出生月 {month}，出生时辰 {birth_hour:?}"
            );
        }
    }

    #[test]
    fn natal_palace_names_are_arranged_counterclockwise_from_ming_palace() {
        let expected_from_yin = [
            PalaceName::Ming,
            PalaceName::FuMu,
            PalaceName::FuDe,
            PalaceName::TianZhai,
            PalaceName::GuanLu,
            PalaceName::JiaoYou,
            PalaceName::QianYi,
            PalaceName::JiE,
            PalaceName::CaiBo,
            PalaceName::ZiNv,
            PalaceName::FuQi,
            PalaceName::XiongDi,
        ];
        let expected_from_zi = [
            PalaceName::FuDe,
            PalaceName::TianZhai,
            PalaceName::GuanLu,
            PalaceName::JiaoYou,
            PalaceName::QianYi,
            PalaceName::JiE,
            PalaceName::CaiBo,
            PalaceName::ZiNv,
            PalaceName::FuQi,
            PalaceName::XiongDi,
            PalaceName::Ming,
            PalaceName::FuMu,
        ];

        assert_eq!(compute_natal_palace_names(Branch::Yin), expected_from_yin);
        assert_eq!(compute_natal_palace_names(Branch::Zi), expected_from_zi);
    }

    #[test]
    fn five_tiger_dun_selects_the_confirmed_group_for_each_birth_stem() {
        let stem_groups = [
            [Stem::Jia, Stem::Ji],
            [Stem::Yi, Stem::Geng],
            [Stem::Bing, Stem::Xin],
            [Stem::Ding, Stem::Ren],
            [Stem::Wu, Stem::Gui],
        ];

        for (group_index, stems) in stem_groups.into_iter().enumerate() {
            for stem in stems {
                assert_eq!(
                    compute_palace_stems(stem),
                    Stem::FIVE_TIGER_DUN_PALACE_STEMS[group_index]
                );
            }
        }
    }

    #[test]
    fn origin_palace_branches_follow_confirmed_birth_stem_mapping() {
        // 依据：CONTEXT.md 的“来因宫”，以及
        // docs/architecture/v1-decision-map.md 的 D-018；适用项目唯一排盘规则。
        // 覆盖十天干到来因宫地支的全部映射。
        let expected = [
            (Stem::Jia, Branch::Xu),
            (Stem::Yi, Branch::You),
            (Stem::Bing, Branch::Shen),
            (Stem::Ding, Branch::Wei),
            (Stem::Wu, Branch::Wu),
            (Stem::Ji, Branch::Si),
            (Stem::Geng, Branch::Chen),
            (Stem::Xin, Branch::Mao),
            (Stem::Ren, Branch::Yin),
            (Stem::Gui, Branch::Hai),
        ];

        for (birth_stem, branch) in expected {
            assert_eq!(
                compute_origin_palace_branch(birth_stem),
                branch,
                "生年天干 {birth_stem:?}"
            );
        }
    }

    #[test]
    fn ziwei_branch_follows_confirmed_bureau_and_day_examples() {
        // 依据：docs/architecture/v1-decision-map.md 的 D-212；适用项目唯一排盘规则。
        // 沿用旧 Rust 7164d856 的 compute_zi_wei_yin0 与旧 Zig 264567b8 的 computeZiWeiYin0。
        // 覆盖五种局、日数端点、补数 0..=5 与十二宫环绕。
        let expected = [
            (FiveElementBureau::WaterTwo, 1, Branch::Chou),
            (FiveElementBureau::WaterTwo, 2, Branch::Yin),
            (FiveElementBureau::WaterTwo, 30, Branch::Chen),
            (FiveElementBureau::WoodThree, 1, Branch::Chen),
            (FiveElementBureau::WoodThree, 15, Branch::Wu),
            (FiveElementBureau::WoodThree, 27, Branch::Xu),
            (FiveElementBureau::WoodThree, 30, Branch::Hai),
            (FiveElementBureau::MetalFour, 1, Branch::Hai),
            (FiveElementBureau::MetalFour, 30, Branch::Hai),
            (FiveElementBureau::EarthFive, 1, Branch::Wu),
            (FiveElementBureau::EarthFive, 30, Branch::Wei),
            (FiveElementBureau::FireSix, 1, Branch::You),
            (FiveElementBureau::FireSix, 2, Branch::Wu),
            (FiveElementBureau::FireSix, 3, Branch::Hai),
            (FiveElementBureau::FireSix, 4, Branch::Chen),
            (FiveElementBureau::FireSix, 5, Branch::Chou),
            (FiveElementBureau::FireSix, 6, Branch::Yin),
            (FiveElementBureau::FireSix, 30, Branch::Wu),
        ];

        for (bureau, day, branch) in expected {
            let birth_day = BirthDay::try_from(day).expect("测试日期必须有效");

            assert_eq!(
                compute_ziwei_branch(bureau, birth_day),
                branch,
                "五行局 {bureau:?}，出生日 {day}"
            );
        }
    }

    #[test]
    fn ziwei_branch_matches_palace_counting_for_every_bureau_and_day() {
        // 依据：D-212 的同一安紫微规则；用逐次减局数与逐宫移动独立验证全部有效输入。
        let bureaus = [
            FiveElementBureau::WaterTwo,
            FiveElementBureau::WoodThree,
            FiveElementBureau::MetalFour,
            FiveElementBureau::EarthFive,
            FiveElementBureau::FireSix,
        ];

        for bureau in bureaus {
            let bureau_number = bureau as u8;

            for day in 1..=30 {
                let birth_day = BirthDay::try_from(day).expect("测试日期必须有效");
                let mut branches = Branch::ALL;
                branches.rotate_left(usize::from(Branch::Yin.index()));
                let mut remaining_day = day;

                while remaining_day > bureau_number {
                    remaining_day -= bureau_number;
                    branches.rotate_left(1);
                }

                let shortfall = bureau_number - remaining_day;
                for _ in 0..shortfall {
                    if shortfall.is_multiple_of(2) {
                        branches.rotate_left(1);
                    } else {
                        branches.rotate_right(1);
                    }
                }

                assert_eq!(
                    compute_ziwei_branch(bureau, birth_day),
                    branches[0],
                    "五行局 {bureau:?}，出生日 {day}"
                );
            }
        }
    }

    #[test]
    fn star_branches_follow_confirmed_rules_for_every_ziwei_month_and_hour() {
        use Branch::{Chen, Chou, Hai, Mao, Shen, Si, Wei, Wu, Xu, Yin, You, Zi};

        // 依据：D-213、D-214、D-215；沿用旧 Rust 7164d856 与旧 Zig 264567b8
        // 的安星规则，适用项目唯一排盘规则。固定落宫基准不调用当前公式生成。
        // 每行按紫微在子至亥列出对应主星的地支。
        let major_cases = [
            (
                StarName::ZiWei,
                [Zi, Chou, Yin, Mao, Chen, Si, Wu, Wei, Shen, You, Xu, Hai],
            ),
            (
                StarName::TianJi,
                [Hai, Zi, Chou, Yin, Mao, Chen, Si, Wu, Wei, Shen, You, Xu],
            ),
            (
                StarName::TaiYang,
                [You, Xu, Hai, Zi, Chou, Yin, Mao, Chen, Si, Wu, Wei, Shen],
            ),
            (
                StarName::WuQu,
                [Shen, You, Xu, Hai, Zi, Chou, Yin, Mao, Chen, Si, Wu, Wei],
            ),
            (
                StarName::TianTong,
                [Wei, Shen, You, Xu, Hai, Zi, Chou, Yin, Mao, Chen, Si, Wu],
            ),
            (
                StarName::LianZhen,
                [Chen, Si, Wu, Wei, Shen, You, Xu, Hai, Zi, Chou, Yin, Mao],
            ),
            (
                StarName::TianFu,
                [Chen, Mao, Yin, Chou, Zi, Hai, Xu, You, Shen, Wei, Wu, Si],
            ),
            (
                StarName::TaiYin,
                [Si, Chen, Mao, Yin, Chou, Zi, Hai, Xu, You, Shen, Wei, Wu],
            ),
            (
                StarName::TanLang,
                [Wu, Si, Chen, Mao, Yin, Chou, Zi, Hai, Xu, You, Shen, Wei],
            ),
            (
                StarName::JuMen,
                [Wei, Wu, Si, Chen, Mao, Yin, Chou, Zi, Hai, Xu, You, Shen],
            ),
            (
                StarName::TianXiang,
                [Shen, Wei, Wu, Si, Chen, Mao, Yin, Chou, Zi, Hai, Xu, You],
            ),
            (
                StarName::TianLiang,
                [You, Shen, Wei, Wu, Si, Chen, Mao, Yin, Chou, Zi, Hai, Xu],
            ),
            (
                StarName::QiSha,
                [Xu, You, Shen, Wei, Wu, Si, Chen, Mao, Yin, Chou, Zi, Hai],
            ),
            (
                StarName::PoJun,
                [Yin, Chou, Zi, Hai, Xu, You, Shen, Wei, Wu, Si, Chen, Mao],
            ),
        ];

        // 正月至十二月的左辅、右弼，以及子至亥时的文昌、文曲。
        let month_cases = [
            (1, [Chen, Xu]),
            (2, [Si, You]),
            (3, [Wu, Shen]),
            (4, [Wei, Wei]),
            (5, [Shen, Wu]),
            (6, [You, Si]),
            (7, [Xu, Chen]),
            (8, [Hai, Mao]),
            (9, [Zi, Yin]),
            (10, [Chou, Chou]),
            (11, [Yin, Zi]),
            (12, [Mao, Hai]),
        ];
        let hour_cases = [
            (Zi, [Xu, Chen]),
            (Chou, [You, Si]),
            (Yin, [Shen, Wu]),
            (Mao, [Wei, Wei]),
            (Chen, [Wu, Shen]),
            (Si, [Si, You]),
            (Wu, [Chen, Xu]),
            (Wei, [Mao, Hai]),
            (Shen, [Yin, Zi]),
            (You, [Chou, Chou]),
            (Xu, [Zi, Yin]),
            (Hai, [Hai, Mao]),
        ];

        assert_eq!(
            major_cases.map(|(star_name, _)| star_name),
            StarName::ALL[..14]
        );
        assert_eq!(
            [
                StarName::ZuoFu,
                StarName::YouBi,
                StarName::WenChang,
                StarName::WenQu
            ],
            StarName::ALL[14..]
        );

        for (ziwei_index, ziwei_branch) in Branch::ALL.into_iter().enumerate() {
            for (month, [zuo_fu, you_bi]) in month_cases {
                let birth_month = BirthMonth::try_from(month).expect("测试月份必须有效");

                for (birth_hour, [wen_chang, wen_qu]) in hour_cases {
                    let actual = compute_star_branches(ziwei_branch, birth_month, birth_hour);

                    for (star_name, branches) in major_cases {
                        assert_eq!(
                            actual[star_name.index()],
                            branches[ziwei_index],
                            "紫微地支 {ziwei_branch:?}，出生月 {month}，出生时辰 {birth_hour:?}，主星 {star_name:?}"
                        );
                    }
                    assert_eq!(
                        actual[14..],
                        [zuo_fu, you_bi, wen_chang, wen_qu],
                        "紫微地支 {ziwei_branch:?}，出生月 {month}，出生时辰 {birth_hour:?}，辅星顺序为左辅、右弼、文昌、文曲"
                    );
                }
            }
        }
    }

    // 依据：D-216、D-217；旧 Rust 7164d856 的 TRANSFORMAT_STARS 与旧 Zig 264567b8
    // 的 transformation_stars 提供对照。适用项目唯一排盘规则，壬干化科采用左辅。
    // 各行按禄、权、科、忌列出固定预期值，不从生产常量或函数生成测试基准。
    const TRANSFORMATION_STAR_CASES: [(Stem, [StarName; 4]); 10] = {
        use StarName::{
            JuMen, LianZhen, PoJun, TaiYang, TaiYin, TanLang, TianJi, TianLiang, TianTong,
            WenChang, WenQu, WuQu, YouBi, ZiWei, ZuoFu,
        };

        [
            (Stem::Jia, [LianZhen, PoJun, WuQu, TaiYang]),
            (Stem::Yi, [TianJi, TianLiang, ZiWei, TaiYin]),
            (Stem::Bing, [TianTong, TianJi, WenChang, LianZhen]),
            (Stem::Ding, [TaiYin, TianTong, TianJi, JuMen]),
            (Stem::Wu, [TanLang, TaiYin, YouBi, TianJi]),
            (Stem::Ji, [WuQu, TanLang, TianLiang, WenQu]),
            (Stem::Geng, [TaiYang, WuQu, TaiYin, TianTong]),
            (Stem::Xin, [JuMen, TaiYang, WenQu, WenChang]),
            (Stem::Ren, [TianLiang, ZiWei, ZuoFu, WuQu]),
            (Stem::Gui, [PoJun, JuMen, TaiYin, TanLang]),
        ]
    };

    #[test]
    fn transformation_stars_follow_confirmed_stem_mapping() {
        // 同时固定 const fn 契约与壬干化科的已确认取值。
        const REN_STARS: [StarName; 4] = compute_transformation_stars(Stem::Ren);

        assert_eq!(TRANSFORMATION_STAR_CASES.map(|(stem, _)| stem), Stem::ALL);

        for (stem, stars) in TRANSFORMATION_STAR_CASES {
            let actual = compute_transformation_stars(stem);

            for (transformation, star) in [
                Transformation::A,
                Transformation::B,
                Transformation::C,
                Transformation::D,
            ]
            .into_iter()
            .zip(stars)
            {
                assert_eq!(
                    actual[transformation.index()],
                    star,
                    "天干 {stem:?}，四化 {transformation:?}"
                );
            }
        }

        assert_eq!(REN_STARS[Transformation::C.index()], StarName::ZuoFu);
    }

    #[test]
    fn birth_transformations_follow_confirmed_mapping_for_every_star() {
        // D-217：按星曜逐一查找独立固定基准，覆盖十个天干下全部十八星（含无四化）。
        // 不调用 compute_transformation_stars 生成预期结果。
        for (birth_stem, targets) in TRANSFORMATION_STAR_CASES {
            let actual = compute_birth_transformations(birth_stem);

            for star in StarName::ALL {
                let expected = targets
                    .into_iter()
                    .zip([
                        Transformation::A,
                        Transformation::B,
                        Transformation::C,
                        Transformation::D,
                    ])
                    .find_map(|(target, transformation)| {
                        (target == star).then_some(transformation)
                    });

                assert_eq!(
                    actual[star.index()],
                    expected,
                    "生年天干 {birth_stem:?}，星曜 {star:?}"
                );
            }

            assert_eq!(
                actual.iter().flatten().count(),
                4,
                "生年天干 {birth_stem:?} 应恰有四星带生年四化"
            );
            for transformation in Transformation::ALL {
                assert_eq!(
                    actual
                        .iter()
                        .filter(|&&value| value == Some(transformation))
                        .count(),
                    1,
                    "生年天干 {birth_stem:?} 的 {transformation:?} 应恰出现一次"
                );
            }
        }
    }

    #[test]
    fn self_transformations_preserve_inward_and_outward_independently() {
        // D-218：甲年宫干按寅至丑排列，正月子时；固定样例覆盖本宫、对宫及跨界。
        // 向心承接对宫宫干四化，离心承接本宫宫干四化，均保存于目标星曜。
        let palace_stems = compute_palace_stems(Stem::Jia);
        let birth_month = BirthMonth::try_from(1).expect("测试月份必须有效");
        let cases = [
            (Branch::Hai, StarName::ZiWei, None, Some(Transformation::C)),
            (Branch::Hai, StarName::TianJi, Some(Transformation::D), None),
            (
                Branch::Hai,
                StarName::TianTong,
                Some(Transformation::A),
                Some(Transformation::D),
            ),
            (Branch::Hai, StarName::TianFu, None, None),
            (Branch::Hai, StarName::YouBi, Some(Transformation::C), None),
            (
                Branch::Si,
                StarName::TianTong,
                Some(Transformation::D),
                Some(Transformation::A),
            ),
            (
                Branch::Wu,
                StarName::TianTong,
                None,
                Some(Transformation::B),
            ),
            (
                Branch::Wei,
                StarName::TianTong,
                None,
                Some(Transformation::A),
            ),
        ];

        for (ziwei_branch, star, inward, outward) in cases {
            let star_branches = compute_star_branches(ziwei_branch, birth_month, Branch::Zi);
            let actual = compute_self_transformations(&palace_stems, &star_branches)[star.index()];

            assert_eq!(
                (actual.inward(), actual.outward()),
                (inward, outward),
                "紫微地支 {ziwei_branch:?}，星曜 {star:?}"
            );
        }
    }

    #[test]
    fn self_transformations_match_reference_across_all_chart_layouts() {
        fn expected_transformation(stem: Stem, star: StarName) -> Option<Transformation> {
            let (_, targets) = TRANSFORMATION_STAR_CASES
                .iter()
                .find(|(source, _)| *source == stem)
                .expect("固定基准必须覆盖十干");

            targets
                .iter()
                .zip([
                    Transformation::A,
                    Transformation::B,
                    Transformation::C,
                    Transformation::D,
                ])
                .find_map(|(&target, transformation)| (target == star).then_some(transformation))
        }

        // D-218：用固定本宫/对宫配对和独立十干四化样例作基准，
        // 不复用生产代码的地支下标换算、对宫取模或四化查询。
        let palace_pairs = [
            (Branch::Yin, Branch::Shen),
            (Branch::Mao, Branch::You),
            (Branch::Chen, Branch::Xu),
            (Branch::Si, Branch::Hai),
            (Branch::Wu, Branch::Zi),
            (Branch::Wei, Branch::Chou),
            (Branch::Shen, Branch::Yin),
            (Branch::You, Branch::Mao),
            (Branch::Xu, Branch::Chen),
            (Branch::Hai, Branch::Si),
            (Branch::Zi, Branch::Wu),
            (Branch::Chou, Branch::Wei),
        ];

        // 五种不同宫干排列 × 十二紫微落宫 × 十二月 × 十二时辰 = 8,640 种输入。
        for birth_stem in [Stem::Jia, Stem::Yi, Stem::Bing, Stem::Ding, Stem::Wu] {
            let palace_stems = compute_palace_stems(birth_stem);

            for ziwei_branch in Branch::ALL {
                for month in 1..=12 {
                    let birth_month = BirthMonth::try_from(month).expect("测试月份必须有效");

                    for birth_hour in Branch::ALL {
                        let star_branches =
                            compute_star_branches(ziwei_branch, birth_month, birth_hour);
                        let actual = compute_self_transformations(&palace_stems, &star_branches);

                        for ((star, branch), transformations) in
                            StarName::ALL.into_iter().zip(star_branches).zip(actual)
                        {
                            let own_stem = palace_pairs
                                .into_iter()
                                .zip(palace_stems)
                                .find_map(|((own, _), stem)| (own == branch).then_some(stem))
                                .expect("固定宫位配对必须覆盖十二地支");
                            let opposite_stem = palace_pairs
                                .into_iter()
                                .zip(palace_stems)
                                .find_map(|((_, opposite), stem)| {
                                    (opposite == branch).then_some(stem)
                                })
                                .expect("固定对宫配对必须覆盖十二地支");

                            assert_eq!(
                                (transformations.inward(), transformations.outward()),
                                (
                                    expected_transformation(opposite_stem, star),
                                    expected_transformation(own_stem, star),
                                ),
                                "生年干 {birth_stem:?}，紫微地支 {ziwei_branch:?}，月份 {month}，时辰 {birth_hour:?}，星曜 {star:?}"
                            );
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn assembled_stars_follow_confirmed_order_category_and_galaxy() {
        // 依据：CONTEXT.md 的星曜类别、星系，D-055、D-057、D-220。
        // 适用项目唯一排盘规则；逐星固定预期值，不从生产归属映射生成基准。
        let expected = [
            (StarName::ZiWei, StarCategory::Major, StarGalaxy::Central),
            (StarName::TianJi, StarCategory::Major, StarGalaxy::North),
            (StarName::TaiYang, StarCategory::Major, StarGalaxy::North),
            (StarName::WuQu, StarCategory::Major, StarGalaxy::North),
            (StarName::TianTong, StarCategory::Major, StarGalaxy::North),
            (StarName::LianZhen, StarCategory::Major, StarGalaxy::North),
            (StarName::TianFu, StarCategory::Major, StarGalaxy::Central),
            (StarName::TaiYin, StarCategory::Major, StarGalaxy::South),
            (StarName::TanLang, StarCategory::Major, StarGalaxy::South),
            (StarName::JuMen, StarCategory::Major, StarGalaxy::South),
            (
                StarName::TianXiang,
                StarCategory::Major,
                StarGalaxy::Central,
            ),
            (StarName::TianLiang, StarCategory::Major, StarGalaxy::South),
            (StarName::QiSha, StarCategory::Major, StarGalaxy::Central),
            (StarName::PoJun, StarCategory::Major, StarGalaxy::South),
            (StarName::ZuoFu, StarCategory::Minor, StarGalaxy::Central),
            (StarName::YouBi, StarCategory::Minor, StarGalaxy::Central),
            (StarName::WenChang, StarCategory::Minor, StarGalaxy::Central),
            (StarName::WenQu, StarCategory::Minor, StarGalaxy::Central),
        ];
        let birth_month = BirthMonth::try_from(1).expect("测试月份必须有效");
        let palace_stems = compute_palace_stems(Stem::Jia);
        let star_branches = compute_star_branches(Branch::Hai, birth_month, Branch::Zi);
        let stars = compute_stars(Stem::Jia, &palace_stems, &star_branches);

        assert_eq!(expected.len(), stars.len());

        for (star, (name, category, galaxy)) in stars.zip(expected) {
            assert_eq!(
                (star.name(), star.category(), star.galaxy()),
                (name, category, galaxy),
                "星曜 {name:?} 的固定身份与归属"
            );
        }
    }

    #[test]
    fn assembled_stars_carry_confirmed_birth_transformations_for_every_stem() {
        // D-217、D-220：通过组装入口核对独立十干样例，不调用生产四化函数生成预期值。
        let birth_month = BirthMonth::try_from(1).expect("测试月份必须有效");
        let star_branches = compute_star_branches(Branch::Hai, birth_month, Branch::Zi);

        for (birth_stem, targets) in TRANSFORMATION_STAR_CASES {
            let palace_stems = compute_palace_stems(birth_stem);
            let stars = compute_stars(birth_stem, &palace_stems, &star_branches);

            assert_eq!(stars.len(), StarName::ALL.len());
            for (star, name) in stars.zip(StarName::ALL) {
                let expected = targets
                    .into_iter()
                    .zip([
                        Transformation::A,
                        Transformation::B,
                        Transformation::C,
                        Transformation::D,
                    ])
                    .find_map(|(target, transformation)| {
                        (target == name).then_some(transformation)
                    });

                assert_eq!(
                    (star.name(), star.birth_transformation()),
                    (name, expected),
                    "生年天干 {birth_stem:?}，星曜 {name:?}"
                );
            }
        }
    }

    #[test]
    fn assembled_stars_carry_independent_self_transformations() {
        // D-218、D-220：固定正月子时，按已确认宫干和落宫列出目标星的向心/离心事实。
        // 覆盖单向、双向、无自化、对宫跨界，以及带生年四化的紫微、破军。
        let birth_month = BirthMonth::try_from(1).expect("测试月份必须有效");
        let cases = [
            (
                Stem::Jia,
                Branch::Hai,
                StarName::ZiWei,
                None,
                Some(Transformation::C),
            ),
            (
                Stem::Jia,
                Branch::Hai,
                StarName::TianJi,
                Some(Transformation::D),
                None,
            ),
            (
                Stem::Jia,
                Branch::Hai,
                StarName::TianTong,
                Some(Transformation::A),
                Some(Transformation::D),
            ),
            (Stem::Jia, Branch::Hai, StarName::TianFu, None, None),
            (
                Stem::Jia,
                Branch::Hai,
                StarName::PoJun,
                Some(Transformation::A),
                None,
            ),
            (
                Stem::Jia,
                Branch::Hai,
                StarName::YouBi,
                Some(Transformation::C),
                None,
            ),
            (
                Stem::Jia,
                Branch::Si,
                StarName::TianTong,
                Some(Transformation::D),
                Some(Transformation::A),
            ),
            (
                Stem::Jia,
                Branch::Wu,
                StarName::TianTong,
                None,
                Some(Transformation::B),
            ),
            (
                Stem::Jia,
                Branch::Wei,
                StarName::TianTong,
                None,
                Some(Transformation::A),
            ),
            (Stem::Ren, Branch::Hai, StarName::ZuoFu, None, None),
            (
                Stem::Ren,
                Branch::Hai,
                StarName::ZiWei,
                Some(Transformation::C),
                None,
            ),
            (
                Stem::Ren,
                Branch::Hai,
                StarName::TianTong,
                None,
                Some(Transformation::A),
            ),
        ];

        for (birth_stem, ziwei_branch, name, inward, outward) in cases {
            let palace_stems = compute_palace_stems(birth_stem);
            let star_branches = compute_star_branches(ziwei_branch, birth_month, Branch::Zi);
            let star = compute_stars(birth_stem, &palace_stems, &star_branches)
                .nth(name.index())
                .expect("组装结果必须包含全部十八颗星曜");

            assert_eq!(
                (
                    star.self_transformations().inward(),
                    star.self_transformations().outward()
                ),
                (inward, outward),
                "生年天干 {birth_stem:?}，紫微地支 {ziwei_branch:?}，星曜 {name:?}"
            );
        }
    }

    #[test]
    fn assembled_palaces_follow_confirmed_fields_and_star_placement() {
        // D-195、D-221，CONTEXT.md 的十二宫顺序与星曜不变量；适用项目唯一规则。
        // 固定甲年、正月子时、紫微在亥：命宫丙寅，火六局顺行。
        // 固定预期不从被测组装函数生成，含寅、子、丑空宫和戌宫四星。
        let expected_fields = [
            (Branch::Yin, PalaceName::Ming, Stem::Bing, 6, 15),
            (Branch::Mao, PalaceName::FuMu, Stem::Ding, 16, 25),
            (Branch::Chen, PalaceName::FuDe, Stem::Wu, 26, 35),
            (Branch::Si, PalaceName::TianZhai, Stem::Ji, 36, 45),
            (Branch::Wu, PalaceName::GuanLu, Stem::Geng, 46, 55),
            (Branch::Wei, PalaceName::JiaoYou, Stem::Xin, 56, 65),
            (Branch::Shen, PalaceName::QianYi, Stem::Ren, 66, 75),
            (Branch::You, PalaceName::JiE, Stem::Gui, 76, 85),
            (Branch::Xu, PalaceName::CaiBo, Stem::Jia, 86, 95),
            (Branch::Hai, PalaceName::ZiNv, Stem::Yi, 96, 105),
            (Branch::Zi, PalaceName::FuQi, Stem::Bing, 106, 115),
            (Branch::Chou, PalaceName::XiongDi, Stem::Ding, 116, 125),
        ];
        let expected_stars: [&[StarName]; 12] = [
            &[],
            &[StarName::LianZhen, StarName::PoJun],
            &[StarName::ZuoFu, StarName::WenQu],
            &[StarName::TianFu],
            &[StarName::TianTong, StarName::TaiYin],
            &[StarName::WuQu, StarName::TanLang],
            &[StarName::TaiYang, StarName::JuMen],
            &[StarName::TianXiang],
            &[
                StarName::TianJi,
                StarName::TianLiang,
                StarName::YouBi,
                StarName::WenChang,
            ],
            &[StarName::ZiWei, StarName::QiSha],
            &[],
            &[],
        ];
        let palace_names = compute_natal_palace_names(Branch::Yin);
        let palace_stems = compute_palace_stems(Stem::Jia);
        let decade_age_ranges = compute_decade_age_ranges(
            FiveElementBureau::FireSix,
            DecadeDirection::Forward,
            Branch::Yin,
        );
        let birth_month = BirthMonth::try_from(1).expect("测试月份必须有效");
        let star_branches = compute_star_branches(Branch::Hai, birth_month, Branch::Zi);
        let stars = compute_stars(Stem::Jia, &palace_stems, &star_branches);
        let palaces = compute_palaces(
            &palace_names,
            &palace_stems,
            &decade_age_ranges,
            &star_branches,
            stars,
        );
        let mut occurrences = [0; 18];

        for ((palace, fields), names) in palaces.iter().zip(expected_fields).zip(expected_stars) {
            assert_eq!(
                (
                    palace.branch(),
                    palace.name(),
                    palace.stem(),
                    palace.decade_age_range().start(),
                    palace.decade_age_range().end(),
                ),
                fields
            );
            assert_eq!(
                palace.stars().iter().map(Star::name).collect::<Vec<_>>(),
                names,
                "实际宫位 {:?} 的星曜及顺序",
                palace.branch()
            );
            for star in palace.stars() {
                occurrences[star.name().index()] += 1;
            }
        }

        assert_eq!(occurrences, [1; 18]);
    }

    #[test]
    fn assembled_palaces_preserve_every_star_and_fact_across_placements() {
        // D-221：组装只转移输入事实；快照读取值，不克隆 Star，也不重算预期四化。
        // 甲年顺行、壬年逆行，各覆盖十二月、十二时辰、十二紫微落宫，共 3,456 种组合。
        let star_facts = |star: &Star| {
            (
                star.name(),
                star.category(),
                star.galaxy(),
                star.name_hans(),
                star.name_hant(),
                star.abbr_hans(),
                star.abbr_hant(),
                star.birth_transformation(),
                star.self_transformations(),
            )
        };

        for (birth_stem, direction) in [
            (Stem::Jia, DecadeDirection::Forward),
            (Stem::Ren, DecadeDirection::Reverse),
        ] {
            let palace_stems = compute_palace_stems(birth_stem);

            for month in 1..=12 {
                let birth_month = BirthMonth::try_from(month).expect("测试月份必须有效");

                for birth_hour in Branch::ALL {
                    let (ming_branch, _) = compute_ming_shen_branches(birth_month, birth_hour);
                    let palace_names = compute_natal_palace_names(ming_branch);
                    let bureau = FiveElementBureau::from_ming_palace(
                        palace_stems[usize::from(ming_branch.index_from_yin())],
                        ming_branch,
                    );
                    let decade_age_ranges =
                        compute_decade_age_ranges(bureau, direction, ming_branch);

                    for ziwei_branch in Branch::ALL {
                        let star_branches =
                            compute_star_branches(ziwei_branch, birth_month, birth_hour);
                        let stars: Vec<_> =
                            compute_stars(birth_stem, &palace_stems, &star_branches).collect();
                        let expected: Vec<_> = stars.iter().map(star_facts).collect();
                        let palaces = compute_palaces(
                            &palace_names,
                            &palace_stems,
                            &decade_age_ranges,
                            &star_branches,
                            stars.into_iter(),
                        );
                        let mut occurrences = [0; 18];

                        for (index, palace) in palaces.iter().enumerate() {
                            assert_eq!(
                                (palace.name(), palace.stem(), palace.decade_age_range()),
                                (
                                    palace_names[index],
                                    palace_stems[index],
                                    decade_age_ranges[index]
                                )
                            );
                            assert!(
                                palace.stars().windows(2).all(|pair| {
                                    pair[0].name().index() < pair[1].name().index()
                                }),
                                "宫内星曜必须保持全局固定顺序"
                            );

                            for star in palace.stars() {
                                let star_index = star.name().index();
                                assert_eq!(palace.branch(), star_branches[star_index]);
                                assert_eq!(star_facts(star), expected[star_index]);
                                occurrences[star_index] += 1;
                            }
                        }

                        assert_eq!(
                            occurrences, [1; 18],
                            "生年干 {birth_stem:?}，月份 {month}，时辰 {birth_hour:?}，紫微地支 {ziwei_branch:?}"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn natal_assembly_preserves_profile_and_confirmed_chart_facts() {
        // D-222，CONTEXT.md 的本命盘不变量；适用项目唯一规则。
        // 甲子年男命、正月子时、紫微在亥：命身同在丙寅，火六局顺行。
        // 带年份的档案为 1984 年初三；无年份的档案使用相同排盘事实。
        let expected_palaces: [(Branch, PalaceName, Stem, u8, &[StarName]); 12] = [
            (Branch::Yin, PalaceName::Ming, Stem::Bing, 6, &[]),
            (
                Branch::Mao,
                PalaceName::FuMu,
                Stem::Ding,
                16,
                &[StarName::LianZhen, StarName::PoJun],
            ),
            (
                Branch::Chen,
                PalaceName::FuDe,
                Stem::Wu,
                26,
                &[StarName::ZuoFu, StarName::WenQu],
            ),
            (
                Branch::Si,
                PalaceName::TianZhai,
                Stem::Ji,
                36,
                &[StarName::TianFu],
            ),
            (
                Branch::Wu,
                PalaceName::GuanLu,
                Stem::Geng,
                46,
                &[StarName::TianTong, StarName::TaiYin],
            ),
            (
                Branch::Wei,
                PalaceName::JiaoYou,
                Stem::Xin,
                56,
                &[StarName::WuQu, StarName::TanLang],
            ),
            (
                Branch::Shen,
                PalaceName::QianYi,
                Stem::Ren,
                66,
                &[StarName::TaiYang, StarName::JuMen],
            ),
            (
                Branch::You,
                PalaceName::JiE,
                Stem::Gui,
                76,
                &[StarName::TianXiang],
            ),
            (
                Branch::Xu,
                PalaceName::CaiBo,
                Stem::Jia,
                86,
                &[
                    StarName::TianJi,
                    StarName::TianLiang,
                    StarName::YouBi,
                    StarName::WenChang,
                ],
            ),
            (
                Branch::Hai,
                PalaceName::ZiNv,
                Stem::Yi,
                96,
                &[StarName::ZiWei, StarName::QiSha],
            ),
            (Branch::Zi, PalaceName::FuQi, Stem::Bing, 106, &[]),
            (Branch::Chou, PalaceName::XiongDi, Stem::Ding, 116, &[]),
        ];

        for (birth_year, birth_day) in [
            (None, None),
            (
                Some(1984),
                Some(BirthDay::try_from(3).expect("测试出生日必须有效")),
            ),
        ] {
            let profile = Profile::new(
                birth_year,
                Gender::Male,
                Stem::Jia,
                Branch::Zi,
                BirthMonth::try_from(1).expect("测试月份必须有效"),
                Branch::Zi,
                birth_day,
            );
            let natal = compute_natal(profile, |_| Branch::Hai);

            assert_eq!(natal.profile(), &profile);
            assert_eq!(natal.zodiac(), Zodiac::Rat);
            assert_eq!(natal.five_element_bureau(), FiveElementBureau::FireSix);
            for (palace, (branch, name, stem, start, stars)) in
                natal.palaces().iter().zip(expected_palaces)
            {
                assert_eq!(
                    (palace.branch(), palace.name(), palace.stem()),
                    (branch, name, stem)
                );
                assert_eq!(
                    (
                        palace.decade_age_range().start(),
                        palace.decade_age_range().end()
                    ),
                    (start, start + 9)
                );
                assert_eq!(
                    palace.stars().iter().map(Star::name).collect::<Vec<_>>(),
                    stars
                );
            }
            for (palace, branch, name) in [
                (natal.ming_palace(), Branch::Yin, PalaceName::Ming),
                (natal.shen_palace(), Branch::Yin, PalaceName::Ming),
                (natal.origin_palace(), Branch::Xu, PalaceName::CaiBo),
                (natal.ziwei_palace(), Branch::Hai, PalaceName::ZiNv),
            ] {
                assert_eq!((palace.branch(), palace.name()), (branch, name));
                assert!(core::ptr::eq(palace, natal.palace(branch)));
                assert!(core::ptr::eq(palace, natal.palace_by_name(name)));
            }

            let birth_transformations: Vec<_> = natal
                .palaces()
                .iter()
                .flat_map(|palace| palace.stars())
                .filter_map(|star| {
                    star.birth_transformation()
                        .map(|value| (star.name(), value))
                })
                .collect();
            assert_eq!(
                birth_transformations,
                [
                    (StarName::LianZhen, Transformation::A),
                    (StarName::PoJun, Transformation::B),
                    (StarName::WuQu, Transformation::C),
                    (StarName::TaiYang, Transformation::D),
                ]
            );
            for (branch, name, inward, outward) in [
                (Branch::Hai, StarName::ZiWei, None, Some(Transformation::C)),
                (Branch::Xu, StarName::TianJi, Some(Transformation::D), None),
                (
                    Branch::Wu,
                    StarName::TianTong,
                    Some(Transformation::A),
                    Some(Transformation::D),
                ),
                (Branch::Si, StarName::TianFu, None, None),
                (Branch::Mao, StarName::PoJun, Some(Transformation::A), None),
                (Branch::Xu, StarName::YouBi, Some(Transformation::C), None),
            ] {
                let star = natal
                    .palace(branch)
                    .star(name)
                    .expect("固定样例星曜必须落在对应宫位");
                assert_eq!(
                    (
                        star.self_transformations().inward(),
                        star.self_transformations().outward()
                    ),
                    (inward, outward)
                );
            }
        }
    }

    #[test]
    fn natal_assembly_preserves_invariants_across_birth_facts_and_placements() {
        // D-222：六十甲子 × 两种性别 × 十二月 × 十二时辰 × 十二紫微落宫。
        // 通过最终 Natal 验证 207,360 盘，不以底层组装函数的输出充当预期整盘。
        let branches_from_yin = [
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
            Branch::Zi,
            Branch::Chou,
        ];
        let origin_branches = [
            Branch::Xu,
            Branch::You,
            Branch::Shen,
            Branch::Wei,
            Branch::Wu,
            Branch::Si,
            Branch::Chen,
            Branch::Mao,
            Branch::Yin,
            Branch::Hai,
        ];

        for year_index in 0..60 {
            let birth_stem = Stem::ALL[year_index % 10];
            let birth_branch = Branch::ALL[year_index % 12];
            for gender in [Gender::Female, Gender::Male] {
                let forward = (year_index % 2 == 0) == (gender == Gender::Male);
                for (month_index, month_branch) in branches_from_yin.into_iter().enumerate() {
                    let birth_month =
                        BirthMonth::try_from(month_index as u8 + 1).expect("测试月份必须有效");
                    // 月份落点为子时的命身宫；逐时分别逆移、顺移，作为独立计数基准。
                    let mut ming_branches = Branch::ALL;
                    ming_branches.reverse();
                    ming_branches.rotate_left(11 - usize::from(month_branch.index()));
                    let mut shen_branches = Branch::ALL;
                    shen_branches.rotate_left(usize::from(month_branch.index()));

                    for ((birth_hour, ming_branch), shen_branch) in Branch::ALL
                        .into_iter()
                        .zip(ming_branches)
                        .zip(shen_branches)
                    {
                        let profile = Profile::new(
                            None,
                            gender,
                            birth_stem,
                            birth_branch,
                            birth_month,
                            birth_hour,
                            None,
                        );
                        for ziwei_branch in Branch::ALL {
                            let natal = compute_natal(profile, |_| ziwei_branch);
                            assert_eq!(natal.profile(), &profile);
                            assert_eq!(natal.zodiac(), birth_branch.zodiac());
                            assert_eq!(natal.ming_palace().branch(), ming_branch);
                            assert_eq!(natal.ming_palace().name(), PalaceName::Ming);
                            assert_eq!(natal.shen_palace().branch(), shen_branch);
                            assert_eq!(
                                natal.origin_palace().branch(),
                                origin_branches[year_index % 10]
                            );
                            assert_eq!(natal.origin_palace().stem(), birth_stem);
                            assert_eq!(natal.ziwei_palace().branch(), ziwei_branch);
                            assert!(natal.ziwei_palace().star(StarName::ZiWei).is_some());
                            let bureau = natal.five_element_bureau();
                            assert_eq!(
                                bureau,
                                FiveElementBureau::from_ming_palace(
                                    natal.ming_palace().stem(),
                                    ming_branch
                                )
                            );

                            let mut occurrences = [0; 18];
                            let mut birth_transformations = [0; 4];
                            for (palace, branch) in natal.palaces().iter().zip(branches_from_yin) {
                                assert_eq!(palace.branch(), branch);
                                assert!(core::ptr::eq(palace, natal.palace(branch)));
                                assert!(core::ptr::eq(palace, natal.palace_by_name(palace.name())));
                                assert_eq!(
                                    palace.decade_age_range().end(),
                                    palace.decade_age_range().start() + 9
                                );
                                assert!(palace.stars().windows(2).all(|pair| pair[0].name().index() < pair[1].name().index()));
                                for star in palace.stars() {
                                    occurrences[star.name().index()] += 1;
                                    if let Some(value) = star.birth_transformation() {
                                        birth_transformations[value.index()] += 1;
                                    }
                                }
                            }
                            assert_eq!(occurrences, [1; 18]);
                            assert_eq!(birth_transformations, [1; 4]);

                            // 从命宫开始逐宫检验虚岁递增，顺行与逆行独立选择遍历方向。
                            let mut decade_branches = Branch::ALL;
                            if forward {
                                decade_branches.rotate_left(usize::from(ming_branch.index()));
                            } else {
                                decade_branches.reverse();
                                decade_branches.rotate_left(11 - usize::from(ming_branch.index()));
                            }
                            for (position, branch) in decade_branches.into_iter().enumerate() {
                                assert_eq!(
                                    natal.palace(branch).decade_age_range().start(),
                                    bureau as u8 + 10 * position as u8
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn decade_direction_follows_gender_and_birth_stem_yin_yang() {
        let expected = [
            (Gender::Male, Stem::Jia, DecadeDirection::Forward),
            (Gender::Female, Stem::Yi, DecadeDirection::Forward),
            (Gender::Male, Stem::Yi, DecadeDirection::Reverse),
            (Gender::Female, Stem::Jia, DecadeDirection::Reverse),
        ];

        for (gender, birth_stem, direction) in expected {
            assert_eq!(compute_decade_direction(gender, birth_stem), direction);
        }
    }

    #[test]
    fn decade_age_ranges_follow_direction_from_ming_palace() {
        // 依据：CONTEXT.md 的“大限”“大限顺逆”，以及
        // docs/architecture/v1-decision-map.md 的 D-086；适用项目唯一排盘规则。
        // 水二局从命宫虚岁 2 岁起限，沿顺逆方向逐宫增加十岁，按寅至丑列出预期起龄。
        let expected = [
            (
                Branch::Yin,
                DecadeDirection::Forward,
                [2, 12, 22, 32, 42, 52, 62, 72, 82, 92, 102, 112],
            ),
            (
                Branch::Yin,
                DecadeDirection::Reverse,
                [2, 112, 102, 92, 82, 72, 62, 52, 42, 32, 22, 12],
            ),
            (
                Branch::Zi,
                DecadeDirection::Forward,
                [22, 32, 42, 52, 62, 72, 82, 92, 102, 112, 2, 12],
            ),
            (
                Branch::Zi,
                DecadeDirection::Reverse,
                [102, 92, 82, 72, 62, 52, 42, 32, 22, 12, 2, 112],
            ),
            (
                Branch::Chou,
                DecadeDirection::Forward,
                [12, 22, 32, 42, 52, 62, 72, 82, 92, 102, 112, 2],
            ),
            (
                Branch::Chou,
                DecadeDirection::Reverse,
                [112, 102, 92, 82, 72, 62, 52, 42, 32, 22, 12, 2],
            ),
        ];

        for (ming_palace_branch, direction, starts) in expected {
            let actual = compute_decade_age_ranges(
                FiveElementBureau::WaterTwo,
                direction,
                ming_palace_branch,
            )
            .map(|age| age.start());

            assert_eq!(
                actual, starts,
                "命宫地支 {ming_palace_branch:?}，大限顺逆 {direction:?}"
            );
        }
    }
}
