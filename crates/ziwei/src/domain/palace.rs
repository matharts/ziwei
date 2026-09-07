use crate::{Branch, FiveElementBureau, Star, StarName, Stem};

// 当前十八星规则的单宫最大值；规则或星集变化时须重新验证，不是公开领域上限。
const MAX_STARS_PER_PALACE: usize = 6;
pub(crate) type PalaceStars = arrayvec::ArrayVec<Star, MAX_STARS_PER_PALACE>;

/// 宫位名称的稳定领域身份。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PalaceName {
    /// 命宫。
    Ming,
    /// 兄弟。
    XiongDi,
    /// 夫妻。
    FuQi,
    /// 子女。
    ZiNv,
    /// 财帛。
    CaiBo,
    /// 疾厄。
    JiE,
    /// 迁移。
    QianYi,
    /// 交友。
    JiaoYou,
    /// 官禄。
    GuanLu,
    /// 田宅。
    TianZhai,
    /// 福德。
    FuDe,
    /// 父母。
    FuMu,
}

impl PalaceName {
    /// 十二宫位名称全集，顺序固定为命、兄、夫、子、财、疾、迁、友、官、田、福、父。
    pub const ALL: [Self; 12] = [
        Self::Ming,
        Self::XiongDi,
        Self::FuQi,
        Self::ZiNv,
        Self::CaiBo,
        Self::JiE,
        Self::QianYi,
        Self::JiaoYou,
        Self::GuanLu,
        Self::TianZhai,
        Self::FuDe,
        Self::FuMu,
    ];

    /// 宫职在 [`Self::ALL`] 中的位置；从命宫起逆布。
    pub(crate) const fn index(self) -> usize {
        match self {
            Self::Ming => 0,
            Self::XiongDi => 1,
            Self::FuQi => 2,
            Self::ZiNv => 3,
            Self::CaiBo => 4,
            Self::JiE => 5,
            Self::QianYi => 6,
            Self::JiaoYou => 7,
            Self::GuanLu => 8,
            Self::TianZhai => 9,
            Self::FuDe => 10,
            Self::FuMu => 11,
        }
    }
}

/// 实际宫位对应的十年虚岁区间。
///
/// 内部顺序固定为 `[start, end]`，且结束虚岁恒为起始虚岁的九年后。
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct DecadeAgeRange([u8; 2]);

impl DecadeAgeRange {
    /// 由五行局与宫位的大限顺逆位置构造年龄区间。
    ///
    /// `position` 为从命宫沿大限顺逆方向计算的零基位置；`0` 为第一大限，
    /// `11` 为第十二大限。
    #[must_use]
    pub(crate) const fn new(bureau: FiveElementBureau, position: u8) -> Self {
        assert!(position <= 11, "大限宫位位置必须在 0..=11");

        let start = bureau as u8 + 10 * position;

        Self([start, start + 9])
    }

    /// 返回起始虚岁。
    #[must_use]
    pub const fn start(self) -> u8 {
        self.0[0]
    }

    /// 返回结束虚岁。
    #[must_use]
    pub const fn end(self) -> u8 {
        self.0[1]
    }
}

/// 本命盘中的一个实际宫位。
///
/// 它持有固定的宫位事实，不随大限或流年改变。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Palace {
    name: PalaceName,
    branch: Branch,
    stem: Stem,
    stars: PalaceStars,
    decade_age_range: DecadeAgeRange,
}

impl Palace {
    /// 由 crate 内的排盘规则创建实际宫位。
    pub(crate) fn new(
        name: PalaceName,
        branch: Branch,
        stem: Stem,
        stars: PalaceStars,
        decade_age_range: DecadeAgeRange,
    ) -> Self {
        Self {
            name,
            branch,
            stem,
            stars,
            decade_age_range,
        }
    }

    /// 返回宫位名称。
    #[must_use]
    pub const fn name(&self) -> PalaceName {
        self.name
    }

    /// 返回本命宫职的简体中文名称。
    #[must_use]
    pub const fn name_hans(&self) -> &'static str {
        let (name_hans, _) = natal_names(self.name);

        name_hans
    }

    /// 返回本命宫职的繁体中文名称。
    #[must_use]
    pub const fn name_hant(&self) -> &'static str {
        let (_, name_hant) = natal_names(self.name);

        name_hant
    }

    /// 返回宫位地支。
    #[must_use]
    pub const fn branch(&self) -> Branch {
        self.branch
    }

    /// 返回宫干。
    #[must_use]
    pub const fn stem(&self) -> Stem {
        self.stem
    }

    /// 返回按固定顺序保存的宫内星曜。
    #[must_use]
    pub fn stars(&self) -> &[Star] {
        &self.stars
    }

    /// 按星曜名称返回宫内星曜；不存在时返回 `None`。
    #[must_use]
    pub fn star(&self, name: StarName) -> Option<&Star> {
        self.stars.iter().find(|star| star.name() == name)
    }

    /// 返回该实际宫位对应的大限年龄区间。
    #[must_use]
    pub const fn decade_age_range(&self) -> DecadeAgeRange {
        self.decade_age_range
    }
}

const fn natal_names(name: PalaceName) -> (&'static str, &'static str) {
    match name {
        PalaceName::Ming => ("命宫", "命宮"),
        PalaceName::XiongDi => ("兄弟", "兄弟"),
        PalaceName::FuQi => ("夫妻", "夫妻"),
        PalaceName::ZiNv => ("子女", "子女"),
        PalaceName::CaiBo => ("财帛", "財帛"),
        PalaceName::JiE => ("疾厄", "疾厄"),
        PalaceName::QianYi => ("迁移", "遷移"),
        PalaceName::JiaoYou => ("交友", "交友"),
        PalaceName::GuanLu => ("官禄", "官祿"),
        PalaceName::TianZhai => ("田宅", "田宅"),
        PalaceName::FuDe => ("福德", "福德"),
        PalaceName::FuMu => ("父母", "父母"),
    }
}

#[cfg(test)]
mod tests {
    use super::{DecadeAgeRange, Palace, PalaceName};
    use crate::{
        Branch, FiveElementBureau, SelfTransformations, Star, StarCategory, StarGalaxy, StarName,
        Stem,
    };

    #[test]
    fn palace_name_all_follows_confirmed_natal_order() {
        assert_eq!(
            PalaceName::ALL,
            [
                PalaceName::Ming,
                PalaceName::XiongDi,
                PalaceName::FuQi,
                PalaceName::ZiNv,
                PalaceName::CaiBo,
                PalaceName::JiE,
                PalaceName::QianYi,
                PalaceName::JiaoYou,
                PalaceName::GuanLu,
                PalaceName::TianZhai,
                PalaceName::FuDe,
                PalaceName::FuMu,
            ]
        );
    }

    #[test]
    fn decade_age_range_follows_the_confirmed_bureau_and_position_rule() {
        let expected = [
            (FiveElementBureau::WaterTwo, 0, 2, 11),
            (FiveElementBureau::WoodThree, 0, 3, 12),
            (FiveElementBureau::MetalFour, 0, 4, 13),
            (FiveElementBureau::EarthFive, 0, 5, 14),
            (FiveElementBureau::FireSix, 0, 6, 15),
            (FiveElementBureau::FireSix, 11, 116, 125),
        ];

        for (bureau, position, start, end) in expected {
            let age = DecadeAgeRange::new(bureau, position);

            assert_eq!(age.start(), start);
            assert_eq!(age.end(), end);
        }
    }

    #[test]
    fn palace_holds_confirmed_natal_facts() {
        let palace = Palace::new(
            PalaceName::Ming,
            Branch::Yin,
            Stem::Jia,
            [Star::new(
                StarName::ZiWei,
                StarCategory::Major,
                StarGalaxy::Central,
                None,
                SelfTransformations::new(None, None),
            )]
            .into_iter()
            .collect(),
            DecadeAgeRange::new(FiveElementBureau::WaterTwo, 0),
        );

        assert_eq!(palace.name(), PalaceName::Ming);
        assert_eq!(palace.name_hans(), "命宫");
        assert_eq!(palace.name_hant(), "命宮");
        assert_eq!(palace.branch(), Branch::Yin);
        assert_eq!(palace.stem(), Stem::Jia);
        assert_eq!(palace.stars().len(), 1);
        assert_eq!(palace.stars()[0].name(), StarName::ZiWei);
        assert_eq!(
            palace.star(StarName::ZiWei).map(Star::name),
            Some(StarName::ZiWei)
        );
        assert_eq!(palace.star(StarName::TianJi), None);
        assert_eq!(palace.decade_age_range().start(), 2);
        assert_eq!(palace.decade_age_range().end(), 11);
    }

    #[test]
    fn palace_provides_confirmed_natal_names() {
        let expected = [
            (PalaceName::Ming, "命宫", "命宮"),
            (PalaceName::XiongDi, "兄弟", "兄弟"),
            (PalaceName::FuQi, "夫妻", "夫妻"),
            (PalaceName::ZiNv, "子女", "子女"),
            (PalaceName::CaiBo, "财帛", "財帛"),
            (PalaceName::JiE, "疾厄", "疾厄"),
            (PalaceName::QianYi, "迁移", "遷移"),
            (PalaceName::JiaoYou, "交友", "交友"),
            (PalaceName::GuanLu, "官禄", "官祿"),
            (PalaceName::TianZhai, "田宅", "田宅"),
            (PalaceName::FuDe, "福德", "福德"),
            (PalaceName::FuMu, "父母", "父母"),
        ];

        for (name, name_hans, name_hant) in expected {
            let palace = Palace::new(
                name,
                Branch::Yin,
                Stem::Jia,
                super::PalaceStars::new(),
                DecadeAgeRange::new(FiveElementBureau::WaterTwo, 0),
            );

            assert_eq!(palace.name(), name);
            assert_eq!(palace.name_hans(), name_hans);
            assert_eq!(palace.name_hant(), name_hant);
        }
    }
}
