use crate::{SelfTransformations, Transformation};

/// 星曜名称的稳定领域身份。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StarName {
    /// 紫微。
    ZiWei,
    /// 天机。
    TianJi,
    /// 太阳。
    TaiYang,
    /// 武曲。
    WuQu,
    /// 天同。
    TianTong,
    /// 廉贞。
    LianZhen,
    /// 天府。
    TianFu,
    /// 太阴。
    TaiYin,
    /// 贪狼。
    TanLang,
    /// 巨门。
    JuMen,
    /// 天相。
    TianXiang,
    /// 天梁。
    TianLiang,
    /// 七杀。
    QiSha,
    /// 破军。
    PoJun,
    /// 左辅。
    ZuoFu,
    /// 右弼。
    YouBi,
    /// 文昌。
    WenChang,
    /// 文曲。
    WenQu,
}

impl StarName {
    /// 十八星全集；顺序也是落宫数组和宫内星曜的稳定遍历顺序。
    pub const ALL: [Self; 18] = [
        Self::ZiWei,
        Self::TianJi,
        Self::TaiYang,
        Self::WuQu,
        Self::TianTong,
        Self::LianZhen,
        Self::TianFu,
        Self::TaiYin,
        Self::TanLang,
        Self::JuMen,
        Self::TianXiang,
        Self::TianLiang,
        Self::QiSha,
        Self::PoJun,
        Self::ZuoFu,
        Self::YouBi,
        Self::WenChang,
        Self::WenQu,
    ];

    /// 落宫数组下标，与 [`Self::ALL`] 对齐。
    pub(crate) const fn index(self) -> usize {
        match self {
            Self::ZiWei => 0,
            Self::TianJi => 1,
            Self::TaiYang => 2,
            Self::WuQu => 3,
            Self::TianTong => 4,
            Self::LianZhen => 5,
            Self::TianFu => 6,
            Self::TaiYin => 7,
            Self::TanLang => 8,
            Self::JuMen => 9,
            Self::TianXiang => 10,
            Self::TianLiang => 11,
            Self::QiSha => 12,
            Self::PoJun => 13,
            Self::ZuoFu => 14,
            Self::YouBi => 15,
            Self::WenChang => 16,
            Self::WenQu => 17,
        }
    }
}

/// 星曜类别的稳定领域身份。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StarCategory {
    /// 主星。
    Major,
    /// 辅星。
    Minor,
    /// 杂星。
    Auxiliary,
}

/// 星曜星系的稳定领域身份。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StarGalaxy {
    /// 南斗。
    South,
    /// 中斗。
    Central,
    /// 北斗。
    North,
}

/// 一颗星曜的不可变本命事实。
/// 名称和简称由身份索引静态资料，实例不重复保存字符串引用。
#[derive(Clone, PartialEq, Eq)]
pub struct Star {
    name: StarName,
    category: StarCategory,
    galaxy: StarGalaxy,
    birth_transformation: Option<Transformation>,
    self_transformations: SelfTransformations,
}

impl Star {
    /// 由 crate 内的排盘规则创建一颗星曜。
    pub(crate) const fn new(
        name: StarName,
        category: StarCategory,
        galaxy: StarGalaxy,
        birth_transformation: Option<Transformation>,
        self_transformations: SelfTransformations,
    ) -> Self {
        Self {
            name,
            category,
            galaxy,
            birth_transformation,
            self_transformations,
        }
    }

    /// 返回星曜的稳定身份。
    #[must_use]
    pub const fn name(&self) -> StarName {
        self.name
    }

    /// 返回星曜的简体中文名称。
    #[must_use]
    pub const fn name_hans(&self) -> &'static str {
        STAR_LABELS[self.name.index()].name_hans
    }

    /// 返回星曜的繁体中文名称。
    #[must_use]
    pub const fn name_hant(&self) -> &'static str {
        STAR_LABELS[self.name.index()].name_hant
    }

    /// 返回星曜用于盘面的简体中文单字简称。
    #[must_use]
    pub const fn abbr_hans(&self) -> &'static str {
        STAR_LABELS[self.name.index()].abbr_hans
    }

    /// 返回星曜用于盘面的繁体中文单字简称。
    #[must_use]
    pub const fn abbr_hant(&self) -> &'static str {
        STAR_LABELS[self.name.index()].abbr_hant
    }

    /// 返回星曜类别。
    #[must_use]
    pub const fn category(&self) -> StarCategory {
        self.category
    }

    /// 返回星曜星系。
    #[must_use]
    pub const fn galaxy(&self) -> StarGalaxy {
        self.galaxy
    }

    /// 返回星曜承接的生年四化。
    #[must_use]
    pub const fn birth_transformation(&self) -> Option<Transformation> {
        self.birth_transformation
    }

    /// 返回星曜的向心与离心自化。
    #[must_use]
    pub const fn self_transformations(&self) -> SelfTransformations {
        self.self_transformations
    }
}

// 保留名称、简称和原字段顺序，不让内部布局改变可观察的 Debug 内容。
impl core::fmt::Debug for Star {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("Star")
            .field("name", &self.name())
            .field("name_hans", &self.name_hans())
            .field("name_hant", &self.name_hant())
            .field("abbr_hans", &self.abbr_hans())
            .field("abbr_hant", &self.abbr_hant())
            .field("category", &self.category())
            .field("galaxy", &self.galaxy())
            .field("birth_transformation", &self.birth_transformation())
            .field("self_transformations", &self.self_transformations())
            .finish()
    }
}

struct StarLabels {
    name_hans: &'static str,
    name_hant: &'static str,
    abbr_hans: &'static str,
    abbr_hant: &'static str,
}

// 编译期由现有名称映射生成，按 StarName::ALL 对齐；运行时无需再匹配名称。
const STAR_LABELS: [StarLabels; StarName::ALL.len()] = {
    let mut labels = [const {
        StarLabels {
            name_hans: "",
            name_hant: "",
            abbr_hans: "",
            abbr_hant: "",
        }
    }; StarName::ALL.len()];
    let mut index = 0;
    while index < StarName::ALL.len() {
        let name = StarName::ALL[index];
        let (name_hans, name_hant) = star_names(name);
        let (abbr_hans, abbr_hant) = star_abbreviations(name);
        labels[index] = StarLabels {
            name_hans,
            name_hant,
            abbr_hans,
            abbr_hant,
        };
        index += 1;
    }
    labels
};

const fn star_names(name: StarName) -> (&'static str, &'static str) {
    match name {
        StarName::ZiWei => ("紫微", "紫微"),
        StarName::TianJi => ("天机", "天機"),
        StarName::TaiYang => ("太阳", "太陽"),
        StarName::WuQu => ("武曲", "武曲"),
        StarName::TianTong => ("天同", "天同"),
        StarName::LianZhen => ("廉贞", "廉貞"),
        StarName::TianFu => ("天府", "天府"),
        StarName::TaiYin => ("太阴", "太陰"),
        StarName::TanLang => ("贪狼", "貪狼"),
        StarName::JuMen => ("巨门", "巨門"),
        StarName::TianXiang => ("天相", "天相"),
        StarName::TianLiang => ("天梁", "天梁"),
        StarName::QiSha => ("七杀", "七殺"),
        StarName::PoJun => ("破军", "破軍"),
        StarName::ZuoFu => ("左辅", "左輔"),
        StarName::YouBi => ("右弼", "右弼"),
        StarName::WenChang => ("文昌", "文昌"),
        StarName::WenQu => ("文曲", "文曲"),
    }
}

const fn star_abbreviations(name: StarName) -> (&'static str, &'static str) {
    match name {
        StarName::ZiWei => ("紫", "紫"),
        StarName::TianJi => ("机", "機"),
        StarName::TaiYang => ("阳", "陽"),
        StarName::WuQu => ("武", "武"),
        StarName::TianTong => ("同", "同"),
        StarName::LianZhen => ("廉", "廉"),
        StarName::TianFu => ("府", "府"),
        StarName::TaiYin => ("阴", "陰"),
        StarName::TanLang => ("贪", "貪"),
        StarName::JuMen => ("巨", "巨"),
        StarName::TianXiang => ("相", "相"),
        StarName::TianLiang => ("梁", "梁"),
        StarName::QiSha => ("杀", "殺"),
        StarName::PoJun => ("破", "破"),
        StarName::ZuoFu => ("辅", "輔"),
        StarName::YouBi => ("弼", "弼"),
        StarName::WenChang => ("昌", "昌"),
        StarName::WenQu => ("曲", "曲"),
    }
}

#[cfg(test)]
mod tests {
    use super::{Star, StarCategory, StarGalaxy, StarName};
    use crate::{SelfTransformations, Transformation};

    #[test]
    fn localized_names_remain_available_in_const_contexts() {
        const STAR: Star = Star::new(
            StarName::TianJi,
            StarCategory::Major,
            StarGalaxy::North,
            None,
            SelfTransformations::new(None, None),
        );
        const NAMES: (&str, &str, &str, &str) = (
            STAR.name_hans(),
            STAR.name_hant(),
            STAR.abbr_hans(),
            STAR.abbr_hant(),
        );
        assert_eq!(NAMES, ("天机", "天機", "机", "機"));
    }

    #[test]
    fn compact_star_preserves_clone_equality_and_debug_fields() {
        let star = Star::new(
            StarName::ZiWei,
            StarCategory::Major,
            StarGalaxy::Central,
            Some(Transformation::A),
            SelfTransformations::new(Some(Transformation::D), None),
        );
        assert_eq!(star.clone(), star);
        assert_eq!(
            format!("{star:?}"),
            concat!(
                "Star { name: ZiWei, name_hans: \"紫微\", name_hant: \"紫微\", ",
                "abbr_hans: \"紫\", abbr_hant: \"紫\", category: Major, galaxy: Central, ",
                "birth_transformation: Some(A), self_transformations: ",
                "SelfTransformations { inward: Some(D), outward: None } }",
            )
        );
        let different = Star::new(
            star.name(),
            star.category(),
            star.galaxy(),
            Some(Transformation::B),
            star.self_transformations(),
        );
        assert_ne!(star, different);
    }

    #[test]
    fn star_holds_the_confirmed_natal_facts() {
        let star = Star::new(
            StarName::ZiWei,
            StarCategory::Major,
            StarGalaxy::Central,
            Some(Transformation::A),
            SelfTransformations::new(Some(Transformation::D), None),
        );

        assert_eq!(star.name(), StarName::ZiWei);
        assert_eq!(star.name_hans(), "紫微");
        assert_eq!(star.name_hant(), "紫微");
        assert_eq!(star.abbr_hans(), "紫");
        assert_eq!(star.abbr_hant(), "紫");
        assert_eq!(star.category(), StarCategory::Major);
        assert_eq!(star.galaxy(), StarGalaxy::Central);
        assert_eq!(star.birth_transformation(), Some(Transformation::A));
        assert_eq!(
            star.self_transformations().inward(),
            Some(Transformation::D)
        );
        assert_eq!(star.self_transformations().outward(), None);
    }

    #[test]
    fn star_name_has_confirmed_order() {
        let expected = [
            StarName::ZiWei,
            StarName::TianJi,
            StarName::TaiYang,
            StarName::WuQu,
            StarName::TianTong,
            StarName::LianZhen,
            StarName::TianFu,
            StarName::TaiYin,
            StarName::TanLang,
            StarName::JuMen,
            StarName::TianXiang,
            StarName::TianLiang,
            StarName::QiSha,
            StarName::PoJun,
            StarName::ZuoFu,
            StarName::YouBi,
            StarName::WenChang,
            StarName::WenQu,
        ];

        assert_eq!(StarName::ALL, expected);

        for (index, name) in expected.into_iter().enumerate() {
            assert_eq!(name.index(), index);
        }
    }

    #[test]
    fn star_carries_confirmed_hans_and_hant_names() {
        let expected = [
            (StarName::ZiWei, "紫微", "紫微"),
            (StarName::TianJi, "天机", "天機"),
            (StarName::TaiYang, "太阳", "太陽"),
            (StarName::WuQu, "武曲", "武曲"),
            (StarName::TianTong, "天同", "天同"),
            (StarName::LianZhen, "廉贞", "廉貞"),
            (StarName::TianFu, "天府", "天府"),
            (StarName::TaiYin, "太阴", "太陰"),
            (StarName::TanLang, "贪狼", "貪狼"),
            (StarName::JuMen, "巨门", "巨門"),
            (StarName::TianXiang, "天相", "天相"),
            (StarName::TianLiang, "天梁", "天梁"),
            (StarName::QiSha, "七杀", "七殺"),
            (StarName::PoJun, "破军", "破軍"),
            (StarName::ZuoFu, "左辅", "左輔"),
            (StarName::YouBi, "右弼", "右弼"),
            (StarName::WenChang, "文昌", "文昌"),
            (StarName::WenQu, "文曲", "文曲"),
        ];

        for (name, name_hans, name_hant) in expected {
            let star = Star::new(
                name,
                StarCategory::Major,
                StarGalaxy::Central,
                None,
                SelfTransformations::new(None, None),
            );

            assert_eq!(star.name_hans(), name_hans);
            assert_eq!(star.name_hant(), name_hant);
        }
    }

    #[test]
    fn star_carries_confirmed_hans_and_hant_abbreviations() {
        let expected = [
            (StarName::ZiWei, "紫", "紫"),
            (StarName::TianJi, "机", "機"),
            (StarName::TaiYang, "阳", "陽"),
            (StarName::WuQu, "武", "武"),
            (StarName::TianTong, "同", "同"),
            (StarName::LianZhen, "廉", "廉"),
            (StarName::TianFu, "府", "府"),
            (StarName::TaiYin, "阴", "陰"),
            (StarName::TanLang, "贪", "貪"),
            (StarName::JuMen, "巨", "巨"),
            (StarName::TianXiang, "相", "相"),
            (StarName::TianLiang, "梁", "梁"),
            (StarName::QiSha, "杀", "殺"),
            (StarName::PoJun, "破", "破"),
            (StarName::ZuoFu, "辅", "輔"),
            (StarName::YouBi, "弼", "弼"),
            (StarName::WenChang, "昌", "昌"),
            (StarName::WenQu, "曲", "曲"),
        ];

        for (name, abbr_hans, abbr_hant) in expected {
            let star = Star::new(
                name,
                StarCategory::Major,
                StarGalaxy::Central,
                None,
                SelfTransformations::new(None, None),
            );

            assert_eq!(star.abbr_hans(), abbr_hans);
            assert_eq!(star.abbr_hant(), abbr_hant);
        }
    }
}
