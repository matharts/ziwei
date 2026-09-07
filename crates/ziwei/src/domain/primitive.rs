use core::fmt;

/// 阴阳的稳定领域身份。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum YinYang {
    /// 阴。
    Yin,
    /// 阳。
    Yang,
}

/// 性别的稳定领域身份。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Gender {
    /// 女。
    Female,
    /// 男。
    Male,
}

impl Gender {
    /// 返回性别对应的阴阳。
    #[must_use]
    pub const fn yin_yang(self) -> YinYang {
        match self {
            Self::Female => YinYang::Yin,
            Self::Male => YinYang::Yang,
        }
    }
}

/// 五行的稳定领域身份。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FiveElement {
    /// 水。
    Water,
    /// 木。
    Wood,
    /// 金。
    Metal,
    /// 土。
    Earth,
    /// 火。
    Fire,
}

/// 五行局的稳定领域身份。
///
/// 五行局不提供五行或局数的组成部分读取方法；数值判别值按 D-114 保持可观察。
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FiveElementBureau {
    /// 水二局。
    WaterTwo = 2,
    /// 木三局。
    WoodThree = 3,
    /// 金四局。
    MetalFour = 4,
    /// 土五局。
    EarthFive = 5,
    /// 火六局。
    FireSix = 6,
}

/// 命宫干支对应的五行局表。
///
/// 行顺序为甲乙、丙丁、戊己、庚辛、壬癸；列顺序为子丑、寅卯、辰巳、午未、申酉、戌亥。
const FIVE_ELEMENT_BUREAUS_BY_MING_PALACE: [[FiveElementBureau; 6]; 5] = [
    [
        FiveElementBureau::MetalFour,
        FiveElementBureau::WaterTwo,
        FiveElementBureau::FireSix,
        FiveElementBureau::MetalFour,
        FiveElementBureau::WaterTwo,
        FiveElementBureau::FireSix,
    ],
    [
        FiveElementBureau::WaterTwo,
        FiveElementBureau::FireSix,
        FiveElementBureau::EarthFive,
        FiveElementBureau::WaterTwo,
        FiveElementBureau::FireSix,
        FiveElementBureau::EarthFive,
    ],
    [
        FiveElementBureau::FireSix,
        FiveElementBureau::EarthFive,
        FiveElementBureau::WoodThree,
        FiveElementBureau::FireSix,
        FiveElementBureau::EarthFive,
        FiveElementBureau::WoodThree,
    ],
    [
        FiveElementBureau::EarthFive,
        FiveElementBureau::WoodThree,
        FiveElementBureau::MetalFour,
        FiveElementBureau::EarthFive,
        FiveElementBureau::WoodThree,
        FiveElementBureau::MetalFour,
    ],
    [
        FiveElementBureau::WoodThree,
        FiveElementBureau::MetalFour,
        FiveElementBureau::WaterTwo,
        FiveElementBureau::WoodThree,
        FiveElementBureau::MetalFour,
        FiveElementBureau::WaterTwo,
    ],
];

impl FiveElementBureau {
    /// 根据命宫的天干和地支返回五行局。
    #[must_use]
    pub(crate) const fn from_ming_palace(stem: Stem, branch: Branch) -> Self {
        FIVE_ELEMENT_BUREAUS_BY_MING_PALACE[five_element_bureau_stem_group(stem)]
            [five_element_bureau_branch_group(branch)]
    }
}

const fn five_element_bureau_stem_group(stem: Stem) -> usize {
    match stem {
        Stem::Jia | Stem::Yi => 0,
        Stem::Bing | Stem::Ding => 1,
        Stem::Wu | Stem::Ji => 2,
        Stem::Geng | Stem::Xin => 3,
        Stem::Ren | Stem::Gui => 4,
    }
}

const fn five_element_bureau_branch_group(branch: Branch) -> usize {
    match branch {
        Branch::Zi | Branch::Chou => 0,
        Branch::Yin | Branch::Mao => 1,
        Branch::Chen | Branch::Si => 2,
        Branch::Wu | Branch::Wei => 3,
        Branch::Shen | Branch::You => 4,
        Branch::Xu | Branch::Hai => 5,
    }
}

/// 天干的稳定领域身份。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Stem {
    /// 甲。
    Jia,
    /// 乙。
    Yi,
    /// 丙。
    Bing,
    /// 丁。
    Ding,
    /// 戊。
    Wu,
    /// 己。
    Ji,
    /// 庚。
    Geng,
    /// 辛。
    Xin,
    /// 壬。
    Ren,
    /// 癸。
    Gui,
}

impl Stem {
    /// 十天干全集，顺序固定为甲至癸，并与 [`Self::index`] 对齐。
    pub const ALL: [Self; 10] = [
        Self::Jia,
        Self::Yi,
        Self::Bing,
        Self::Ding,
        Self::Wu,
        Self::Ji,
        Self::Geng,
        Self::Xin,
        Self::Ren,
        Self::Gui,
    ];

    /// 五虎遁十二宫干表。
    ///
    /// 外层顺序依次为甲己、乙庚、丙辛、丁壬、戊癸；内层顺序固定为寅至丑。
    pub(crate) const FIVE_TIGER_DUN_PALACE_STEMS: [[Self; 12]; 5] = [
        [
            Self::Bing,
            Self::Ding,
            Self::Wu,
            Self::Ji,
            Self::Geng,
            Self::Xin,
            Self::Ren,
            Self::Gui,
            Self::Jia,
            Self::Yi,
            Self::Bing,
            Self::Ding,
        ],
        [
            Self::Wu,
            Self::Ji,
            Self::Geng,
            Self::Xin,
            Self::Ren,
            Self::Gui,
            Self::Jia,
            Self::Yi,
            Self::Bing,
            Self::Ding,
            Self::Wu,
            Self::Ji,
        ],
        [
            Self::Geng,
            Self::Xin,
            Self::Ren,
            Self::Gui,
            Self::Jia,
            Self::Yi,
            Self::Bing,
            Self::Ding,
            Self::Wu,
            Self::Ji,
            Self::Geng,
            Self::Xin,
        ],
        [
            Self::Ren,
            Self::Gui,
            Self::Jia,
            Self::Yi,
            Self::Bing,
            Self::Ding,
            Self::Wu,
            Self::Ji,
            Self::Geng,
            Self::Xin,
            Self::Ren,
            Self::Gui,
        ],
        [
            Self::Jia,
            Self::Yi,
            Self::Bing,
            Self::Ding,
            Self::Wu,
            Self::Ji,
            Self::Geng,
            Self::Xin,
            Self::Ren,
            Self::Gui,
            Self::Jia,
            Self::Yi,
        ],
    ];

    /// 返回甲为 `0` 至癸为 `9` 的固定领域序号。
    #[must_use]
    pub const fn index(self) -> u8 {
        match self {
            Self::Jia => 0,
            Self::Yi => 1,
            Self::Bing => 2,
            Self::Ding => 3,
            Self::Wu => 4,
            Self::Ji => 5,
            Self::Geng => 6,
            Self::Xin => 7,
            Self::Ren => 8,
            Self::Gui => 9,
        }
    }

    /// 返回天干对应的阴阳。
    #[must_use]
    pub const fn yin_yang(self) -> YinYang {
        match self {
            Self::Jia | Self::Bing | Self::Wu | Self::Geng | Self::Ren => YinYang::Yang,
            Self::Yi | Self::Ding | Self::Ji | Self::Xin | Self::Gui => YinYang::Yin,
        }
    }
}

impl fmt::Display for Stem {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let label = match self {
            Self::Jia => "甲",
            Self::Yi => "乙",
            Self::Bing => "丙",
            Self::Ding => "丁",
            Self::Wu => "戊",
            Self::Ji => "己",
            Self::Geng => "庚",
            Self::Xin => "辛",
            Self::Ren => "壬",
            Self::Gui => "癸",
        };

        formatter.write_str(label)
    }
}

/// 地支的稳定领域身份。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Branch {
    /// 子。
    Zi,
    /// 丑。
    Chou,
    /// 寅。
    Yin,
    /// 卯。
    Mao,
    /// 辰。
    Chen,
    /// 巳。
    Si,
    /// 午。
    Wu,
    /// 未。
    Wei,
    /// 申。
    Shen,
    /// 酉。
    You,
    /// 戌。
    Xu,
    /// 亥。
    Hai,
}

impl Branch {
    /// 十二地支全集，顺序固定为子至亥，并与 [`Self::index`] 对齐。
    pub const ALL: [Self; 12] = [
        Self::Zi,
        Self::Chou,
        Self::Yin,
        Self::Mao,
        Self::Chen,
        Self::Si,
        Self::Wu,
        Self::Wei,
        Self::Shen,
        Self::You,
        Self::Xu,
        Self::Hai,
    ];

    /// 返回子为 `0` 至亥为 `11` 的固定领域序号。
    #[must_use]
    pub const fn index(self) -> u8 {
        match self {
            Self::Zi => 0,
            Self::Chou => 1,
            Self::Yin => 2,
            Self::Mao => 3,
            Self::Chen => 4,
            Self::Si => 5,
            Self::Wu => 6,
            Self::Wei => 7,
            Self::Shen => 8,
            Self::You => 9,
            Self::Xu => 10,
            Self::Hai => 11,
        }
    }

    /// 返回以寅为 `0`、沿地支正序至丑为 `11` 的索引。
    #[must_use]
    pub(crate) const fn index_from_yin(self) -> u8 {
        match self {
            Self::Yin => 0,
            Self::Mao => 1,
            Self::Chen => 2,
            Self::Si => 3,
            Self::Wu => 4,
            Self::Wei => 5,
            Self::Shen => 6,
            Self::You => 7,
            Self::Xu => 8,
            Self::Hai => 9,
            Self::Zi => 10,
            Self::Chou => 11,
        }
    }

    /// 返回地支对应的阴阳。
    #[must_use]
    pub const fn yin_yang(self) -> YinYang {
        match self {
            Self::Zi | Self::Yin | Self::Chen | Self::Wu | Self::Shen | Self::Xu => YinYang::Yang,
            Self::Chou | Self::Mao | Self::Si | Self::Wei | Self::You | Self::Hai => YinYang::Yin,
        }
    }

    /// 返回地支对应的生肖。
    #[must_use]
    pub const fn zodiac(self) -> Zodiac {
        match self {
            Self::Zi => Zodiac::Rat,
            Self::Chou => Zodiac::Ox,
            Self::Yin => Zodiac::Tiger,
            Self::Mao => Zodiac::Rabbit,
            Self::Chen => Zodiac::Dragon,
            Self::Si => Zodiac::Snake,
            Self::Wu => Zodiac::Horse,
            Self::Wei => Zodiac::Goat,
            Self::Shen => Zodiac::Monkey,
            Self::You => Zodiac::Rooster,
            Self::Xu => Zodiac::Dog,
            Self::Hai => Zodiac::Pig,
        }
    }
}

impl fmt::Display for Branch {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let label = match self {
            Self::Zi => "子",
            Self::Chou => "丑",
            Self::Yin => "寅",
            Self::Mao => "卯",
            Self::Chen => "辰",
            Self::Si => "巳",
            Self::Wu => "午",
            Self::Wei => "未",
            Self::Shen => "申",
            Self::You => "酉",
            Self::Xu => "戌",
            Self::Hai => "亥",
        };

        formatter.write_str(label)
    }
}

/// 生肖的稳定领域身份。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Zodiac {
    /// 鼠。
    Rat,
    /// 牛。
    Ox,
    /// 虎。
    Tiger,
    /// 兔。
    Rabbit,
    /// 龙。
    Dragon,
    /// 蛇。
    Snake,
    /// 马。
    Horse,
    /// 羊。
    Goat,
    /// 猴。
    Monkey,
    /// 鸡。
    Rooster,
    /// 狗。
    Dog,
    /// 猪。
    Pig,
}

#[cfg(test)]
mod tests {
    use super::{Branch, FiveElementBureau, Gender, Stem, YinYang, Zodiac};

    #[test]
    fn five_element_bureau_has_confirmed_values() {
        let expected = [
            (FiveElementBureau::WaterTwo, 2),
            (FiveElementBureau::WoodThree, 3),
            (FiveElementBureau::MetalFour, 4),
            (FiveElementBureau::EarthFive, 5),
            (FiveElementBureau::FireSix, 6),
        ];

        for (bureau, value) in expected {
            assert_eq!(bureau as u8, value);
        }
    }

    #[test]
    fn five_element_bureau_follows_confirmed_ming_palace_groups() {
        let stem_groups = [
            [Stem::Jia, Stem::Yi],
            [Stem::Bing, Stem::Ding],
            [Stem::Wu, Stem::Ji],
            [Stem::Geng, Stem::Xin],
            [Stem::Ren, Stem::Gui],
        ];
        let branch_groups = [
            [Branch::Zi, Branch::Chou],
            [Branch::Yin, Branch::Mao],
            [Branch::Chen, Branch::Si],
            [Branch::Wu, Branch::Wei],
            [Branch::Shen, Branch::You],
            [Branch::Xu, Branch::Hai],
        ];
        let expected = [
            [
                FiveElementBureau::MetalFour,
                FiveElementBureau::WaterTwo,
                FiveElementBureau::FireSix,
                FiveElementBureau::MetalFour,
                FiveElementBureau::WaterTwo,
                FiveElementBureau::FireSix,
            ],
            [
                FiveElementBureau::WaterTwo,
                FiveElementBureau::FireSix,
                FiveElementBureau::EarthFive,
                FiveElementBureau::WaterTwo,
                FiveElementBureau::FireSix,
                FiveElementBureau::EarthFive,
            ],
            [
                FiveElementBureau::FireSix,
                FiveElementBureau::EarthFive,
                FiveElementBureau::WoodThree,
                FiveElementBureau::FireSix,
                FiveElementBureau::EarthFive,
                FiveElementBureau::WoodThree,
            ],
            [
                FiveElementBureau::EarthFive,
                FiveElementBureau::WoodThree,
                FiveElementBureau::MetalFour,
                FiveElementBureau::EarthFive,
                FiveElementBureau::WoodThree,
                FiveElementBureau::MetalFour,
            ],
            [
                FiveElementBureau::WoodThree,
                FiveElementBureau::MetalFour,
                FiveElementBureau::WaterTwo,
                FiveElementBureau::WoodThree,
                FiveElementBureau::MetalFour,
                FiveElementBureau::WaterTwo,
            ],
        ];

        for (stem_group_index, stems) in stem_groups.into_iter().enumerate() {
            for (branch_group_index, branches) in branch_groups.into_iter().enumerate() {
                for stem in stems {
                    for branch in branches {
                        assert_eq!(
                            FiveElementBureau::from_ming_palace(stem, branch),
                            expected[stem_group_index][branch_group_index]
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn gender_maps_to_its_confirmed_yin_yang() {
        let expected = [
            (Gender::Female, YinYang::Yin),
            (Gender::Male, YinYang::Yang),
        ];

        for (gender, yin_yang) in expected {
            assert_eq!(gender.yin_yang(), yin_yang);
        }
    }

    #[test]
    fn branch_has_confirmed_order_and_simplified_display() {
        let expected = [
            (Branch::Zi, 0, "子", YinYang::Yang, Zodiac::Rat),
            (Branch::Chou, 1, "丑", YinYang::Yin, Zodiac::Ox),
            (Branch::Yin, 2, "寅", YinYang::Yang, Zodiac::Tiger),
            (Branch::Mao, 3, "卯", YinYang::Yin, Zodiac::Rabbit),
            (Branch::Chen, 4, "辰", YinYang::Yang, Zodiac::Dragon),
            (Branch::Si, 5, "巳", YinYang::Yin, Zodiac::Snake),
            (Branch::Wu, 6, "午", YinYang::Yang, Zodiac::Horse),
            (Branch::Wei, 7, "未", YinYang::Yin, Zodiac::Goat),
            (Branch::Shen, 8, "申", YinYang::Yang, Zodiac::Monkey),
            (Branch::You, 9, "酉", YinYang::Yin, Zodiac::Rooster),
            (Branch::Xu, 10, "戌", YinYang::Yang, Zodiac::Dog),
            (Branch::Hai, 11, "亥", YinYang::Yin, Zodiac::Pig),
        ];

        assert_eq!(Branch::ALL, expected.map(|(branch, _, _, _, _)| branch));

        for (branch, index, display, yin_yang, zodiac) in expected {
            assert_eq!(branch.index(), index);
            assert_eq!(branch.to_string(), display);
            assert_eq!(branch.yin_yang(), yin_yang);
            assert_eq!(branch.zodiac(), zodiac);
        }
    }

    #[test]
    fn branch_index_from_yin_follows_confirmed_palace_order() {
        let expected = [
            (Branch::Yin, 0),
            (Branch::Mao, 1),
            (Branch::Chen, 2),
            (Branch::Si, 3),
            (Branch::Wu, 4),
            (Branch::Wei, 5),
            (Branch::Shen, 6),
            (Branch::You, 7),
            (Branch::Xu, 8),
            (Branch::Hai, 9),
            (Branch::Zi, 10),
            (Branch::Chou, 11),
        ];

        for (branch, index) in expected {
            assert_eq!(branch.index_from_yin(), index);
        }
    }

    #[test]
    fn stem_has_confirmed_order_and_simplified_display() {
        let expected = [
            (Stem::Jia, 0, "甲", YinYang::Yang),
            (Stem::Yi, 1, "乙", YinYang::Yin),
            (Stem::Bing, 2, "丙", YinYang::Yang),
            (Stem::Ding, 3, "丁", YinYang::Yin),
            (Stem::Wu, 4, "戊", YinYang::Yang),
            (Stem::Ji, 5, "己", YinYang::Yin),
            (Stem::Geng, 6, "庚", YinYang::Yang),
            (Stem::Xin, 7, "辛", YinYang::Yin),
            (Stem::Ren, 8, "壬", YinYang::Yang),
            (Stem::Gui, 9, "癸", YinYang::Yin),
        ];

        assert_eq!(Stem::ALL, expected.map(|(stem, _, _, _)| stem));

        for (stem, index, display, yin_yang) in expected {
            assert_eq!(stem.index(), index);
            assert_eq!(stem.to_string(), display);
            assert_eq!(stem.yin_yang(), yin_yang);
        }
    }

    #[test]
    fn five_tiger_dun_palace_stems_has_the_confirmed_five_groups() {
        let expected = [
            (
                [Stem::Jia, Stem::Ji],
                [
                    Stem::Bing,
                    Stem::Ding,
                    Stem::Wu,
                    Stem::Ji,
                    Stem::Geng,
                    Stem::Xin,
                    Stem::Ren,
                    Stem::Gui,
                    Stem::Jia,
                    Stem::Yi,
                    Stem::Bing,
                    Stem::Ding,
                ],
            ),
            (
                [Stem::Yi, Stem::Geng],
                [
                    Stem::Wu,
                    Stem::Ji,
                    Stem::Geng,
                    Stem::Xin,
                    Stem::Ren,
                    Stem::Gui,
                    Stem::Jia,
                    Stem::Yi,
                    Stem::Bing,
                    Stem::Ding,
                    Stem::Wu,
                    Stem::Ji,
                ],
            ),
            (
                [Stem::Bing, Stem::Xin],
                [
                    Stem::Geng,
                    Stem::Xin,
                    Stem::Ren,
                    Stem::Gui,
                    Stem::Jia,
                    Stem::Yi,
                    Stem::Bing,
                    Stem::Ding,
                    Stem::Wu,
                    Stem::Ji,
                    Stem::Geng,
                    Stem::Xin,
                ],
            ),
            (
                [Stem::Ding, Stem::Ren],
                [
                    Stem::Ren,
                    Stem::Gui,
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
                ],
            ),
            (
                [Stem::Wu, Stem::Gui],
                [
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
                    Stem::Jia,
                    Stem::Yi,
                ],
            ),
        ];

        assert_eq!(
            Stem::FIVE_TIGER_DUN_PALACE_STEMS,
            expected.map(|(_, palace_stems)| palace_stems)
        );
    }
}
