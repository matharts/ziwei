use ziwei::{
    Birth, BirthDay, BirthMonth, Branch, Decade, DecadeIndex, DecadeYear, FiveElementBureau,
    Gender, Natal, PalaceName, Parameters, Profile, Star, StarName, Stem, Transformation, Yearly,
    YearlyIndex, Ziwei, ZiweiError, Zodiac,
};

#[test]
fn birth_is_exported_from_the_crate_root() {
    let birth = Birth {
        gender: Gender::Female,
        birth_year: 1992,
        birth_month: BirthMonth::try_from(8).expect("范围内月份必须有效"),
        birth_day: BirthDay::try_from(15).expect("范围内日期必须有效"),
        birth_hour: Branch::Shen,
    };

    assert_eq!(birth.birth_year, 1992);
}

#[test]
fn parameters_are_exported_from_the_crate_root() {
    let parameters = Parameters::new(
        Gender::Male,
        Stem::Ren,
        Branch::Shen,
        BirthMonth::try_from(5).expect("范围内月份必须有效"),
        Branch::Chen,
        Branch::Hai,
    )
    .expect("壬申必须是有效六十甲子");

    assert_eq!(parameters.ziwei_branch(), Branch::Chen);
}

#[test]
fn profile_is_exported_from_the_crate_root() {
    let profile: Option<Profile> = None;

    assert!(profile.is_none());
}

#[test]
fn from_parameters_returns_the_confirmed_natal_chart() {
    // D-223、CONTEXT.md；适用项目唯一规则。
    // 壬申年女命、八月卯时、紫微在酉：命宫丙午、水二局逆行。
    // 固定预期直接记录宫位和安星规则的结果，不调用 crate 内部计算函数。
    let birth_month = BirthMonth::try_from(8).expect("范围内月份必须有效");
    let parameters = Parameters::new(
        Gender::Female,
        Stem::Ren,
        Branch::Shen,
        birth_month,
        Branch::You,
        Branch::Mao,
    )
    .expect("壬申必须是有效六十甲子");
    let result: Result<Natal, ZiweiError> = Ziwei::from_parameters(parameters);
    let natal = result.expect("已验证的参数必须能够排盘");
    let profile = natal.profile();

    assert_eq!(profile.birth_year(), None);
    assert_eq!(profile.birth_day(), None);
    assert_eq!(profile.gender(), Gender::Female);
    assert_eq!(profile.birth_stem(), Stem::Ren);
    assert_eq!(profile.birth_branch(), Branch::Shen);
    assert_eq!(profile.birth_month(), birth_month);
    assert_eq!(profile.birth_hour(), Branch::Mao);
    assert_eq!(natal.zodiac(), Zodiac::Monkey);
    assert_eq!(natal.five_element_bureau(), FiveElementBureau::WaterTwo);

    let expected: [(Branch, PalaceName, Stem, u8, &[StarName]); 12] = [
        (Branch::Yin, PalaceName::CaiBo, Stem::Ren, 42, &[]),
        (
            Branch::Mao,
            PalaceName::ZiNv,
            Stem::Gui,
            32,
            &[StarName::YouBi],
        ),
        (
            Branch::Chen,
            PalaceName::FuQi,
            Stem::Jia,
            22,
            &[StarName::TianTong],
        ),
        (
            Branch::Si,
            PalaceName::XiongDi,
            Stem::Yi,
            12,
            &[StarName::WuQu, StarName::PoJun],
        ),
        (
            Branch::Wu,
            PalaceName::Ming,
            Stem::Bing,
            2,
            &[StarName::TaiYang],
        ),
        (
            Branch::Wei,
            PalaceName::FuMu,
            Stem::Ding,
            112,
            &[StarName::TianFu, StarName::WenChang, StarName::WenQu],
        ),
        (
            Branch::Shen,
            PalaceName::FuDe,
            Stem::Wu,
            102,
            &[StarName::TianJi, StarName::TaiYin],
        ),
        (
            Branch::You,
            PalaceName::TianZhai,
            Stem::Ji,
            92,
            &[StarName::ZiWei, StarName::TanLang],
        ),
        (
            Branch::Xu,
            PalaceName::GuanLu,
            Stem::Geng,
            82,
            &[StarName::JuMen],
        ),
        (
            Branch::Hai,
            PalaceName::JiaoYou,
            Stem::Xin,
            72,
            &[StarName::TianXiang, StarName::ZuoFu],
        ),
        (
            Branch::Zi,
            PalaceName::QianYi,
            Stem::Ren,
            62,
            &[StarName::TianLiang],
        ),
        (
            Branch::Chou,
            PalaceName::JiE,
            Stem::Gui,
            52,
            &[StarName::LianZhen, StarName::QiSha],
        ),
    ];
    for (palace, (branch, name, stem, start, stars)) in natal.palaces().iter().zip(expected) {
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
        assert!(core::ptr::eq(palace, natal.palace(branch)));
        assert!(core::ptr::eq(palace, natal.palace_by_name(name)));
    }
    for (palace, branch, name) in [
        (natal.ming_palace(), Branch::Wu, PalaceName::Ming),
        (natal.shen_palace(), Branch::Zi, PalaceName::QianYi),
        (natal.origin_palace(), Branch::Yin, PalaceName::CaiBo),
        (natal.ziwei_palace(), Branch::You, PalaceName::TianZhai),
    ] {
        assert_eq!((palace.branch(), palace.name()), (branch, name));
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
            (StarName::WuQu, Transformation::D),
            (StarName::ZiWei, Transformation::B),
            (StarName::ZuoFu, Transformation::C),
            (StarName::TianLiang, Transformation::A),
        ]
    );
    for (branch, name, inward, outward) in [
        (Branch::You, StarName::ZiWei, None, None),
        (
            Branch::Chen,
            StarName::TianTong,
            Some(Transformation::D),
            None,
        ),
        (
            Branch::Shen,
            StarName::TianJi,
            None,
            Some(Transformation::D),
        ),
        (
            Branch::You,
            StarName::TanLang,
            Some(Transformation::D),
            Some(Transformation::B),
        ),
        (
            Branch::Zi,
            StarName::TianLiang,
            None,
            Some(Transformation::A),
        ),
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

#[test]
fn from_birth_returns_the_confirmed_natal_chart_and_birth_dates() {
    // D-180、D-212、D-224，适用项目唯一规则。
    // 1992 年为壬申；八月卯时命宫丙午，水二局，十七日紫微在酉。
    // 直接参数路径的同一固定命盘已由上方完整宫位与星曜样例验证。
    let birth = Birth {
        gender: Gender::Female,
        birth_year: 1992,
        birth_month: BirthMonth::try_from(8).expect("范围内月份必须有效"),
        birth_day: BirthDay::try_from(17).expect("范围内日期必须有效"),
        birth_hour: Branch::Mao,
    };
    let result: Result<Natal, ZiweiError> = Ziwei::from_birth(birth);
    let natal = result.expect("归一化出生资料必须能够排盘");
    let parameters = Parameters::new(
        Gender::Female,
        Stem::Ren,
        Branch::Shen,
        BirthMonth::try_from(8).expect("范围内月份必须有效"),
        Branch::You,
        Branch::Mao,
    )
    .expect("壬申必须是有效六十甲子");
    let expected = Ziwei::from_parameters(parameters).expect("已验证的参数必须能够排盘");

    assert_eq!(natal.profile().birth_year(), Some(1992));
    assert_eq!(natal.profile().birth_day(), Some(birth.birth_day));
    assert_eq!(natal.profile().gender(), birth.gender);
    assert_eq!(natal.profile().birth_month(), birth.birth_month);
    assert_eq!(natal.profile().birth_hour(), birth.birth_hour);
    assert_eq!(natal.profile().birth_stem(), Stem::Ren);
    assert_eq!(natal.profile().birth_branch(), Branch::Shen);
    assert_eq!(natal.zodiac(), Zodiac::Monkey);
    assert_eq!(natal.five_element_bureau(), FiveElementBureau::WaterTwo);
    assert_eq!(natal.palaces(), expected.palaces());
    assert_eq!(natal.ming_palace(), expected.ming_palace());
    assert_eq!(natal.shen_palace(), expected.shen_palace());
    assert_eq!(natal.origin_palace(), expected.origin_palace());
    assert_eq!(natal.ziwei_palace(), expected.ziwei_palace());
    assert_eq!(natal.ziwei_palace().branch(), Branch::You);
}

#[test]
fn from_birth_preserves_year_boundaries_and_confirmed_sexagenary_years() {
    // D-180、D-224：数字年份只采用甲子同余规则，不限定年代或排除零与负数。
    // 固定年柱独立于排盘输出，覆盖 i32 两端及前后相邻值。
    let cases = [
        (i32::MIN, Stem::Ren, Branch::Zi),
        (i32::MIN + 1, Stem::Gui, Branch::Chou),
        (-1, Stem::Ji, Branch::Wei),
        (0, Stem::Geng, Branch::Shen),
        (1, Stem::Xin, Branch::You),
        (3, Stem::Gui, Branch::Hai),
        (4, Stem::Jia, Branch::Zi),
        (1984, Stem::Jia, Branch::Zi),
        (2025, Stem::Yi, Branch::Si),
        (i32::MAX - 1, Stem::Bing, Branch::Yin),
        (i32::MAX, Stem::Ding, Branch::Mao),
    ];
    for (birth_year, stem, branch) in cases {
        for month in [1, 12] {
            for day in [1, 30] {
                for birth_hour in [Branch::Zi, Branch::Hai] {
                    let birth = Birth {
                        gender: Gender::Male,
                        birth_year,
                        birth_month: BirthMonth::try_from(month).expect("月份边界必须有效"),
                        birth_day: BirthDay::try_from(day).expect("日期边界必须有效"),
                        birth_hour,
                    };
                    let natal = Ziwei::from_birth(birth).expect("任意 i32 数字年份均可排盘");
                    let profile = natal.profile();

                    assert_eq!(profile.birth_year(), Some(birth_year));
                    assert_eq!(profile.birth_day(), Some(birth.birth_day));
                    assert_eq!(profile.gender(), birth.gender);
                    assert_eq!(profile.birth_month(), birth.birth_month);
                    assert_eq!(profile.birth_hour(), birth_hour);
                    assert_eq!(
                        (profile.birth_stem(), profile.birth_branch()),
                        (stem, branch)
                    );
                    assert_eq!(natal.zodiac(), branch.zodiac());
                }
            }
        }
    }
}

#[test]
fn birth_and_parameters_produce_matching_natal_facts() {
    // D-212、D-224：十个固定年柱 × 两种性别 × 十二月 × 十二时辰 × 三十日，86,400 组。
    // 以逐局扣日、逐宫移动的独立计数基准定位紫微，不使用生产公式或 Birth 输出的紫微支。
    let years = [
        (1984, Stem::Jia, Branch::Zi),
        (1985, Stem::Yi, Branch::Chou),
        (1986, Stem::Bing, Branch::Yin),
        (1987, Stem::Ding, Branch::Mao),
        (1988, Stem::Wu, Branch::Chen),
        (1989, Stem::Ji, Branch::Si),
        (1990, Stem::Geng, Branch::Wu),
        (1991, Stem::Xin, Branch::Wei),
        (1992, Stem::Ren, Branch::Shen),
        (1993, Stem::Gui, Branch::You),
    ];
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
    for (birth_year, birth_stem, birth_branch) in years {
        for gender in [Gender::Female, Gender::Male] {
            for month in 1..=12 {
                let birth_month = BirthMonth::try_from(month).expect("范围内月份必须有效");
                for birth_hour in Branch::ALL {
                    for day in 1..=30 {
                        let birth = Birth {
                            gender,
                            birth_year,
                            birth_month,
                            birth_day: BirthDay::try_from(day).expect("范围内日期必须有效"),
                            birth_hour,
                        };
                        let from_birth =
                            Ziwei::from_birth(birth).expect("归一化出生资料必须能够排盘");
                        let bureau = from_birth.five_element_bureau() as u8;
                        let mut remaining_days = day;
                        let mut ziwei_index = 0;
                        while remaining_days > bureau {
                            remaining_days -= bureau;
                            ziwei_index = (ziwei_index + 1) % 12;
                        }
                        let padding = bureau - remaining_days;
                        for _ in 0..padding {
                            ziwei_index = if padding.is_multiple_of(2) {
                                (ziwei_index + 1) % 12
                            } else {
                                (ziwei_index + 11) % 12
                            };
                        }
                        let ziwei_branch = branches_from_yin[ziwei_index];
                        let parameters = Parameters::new(
                            gender,
                            birth_stem,
                            birth_branch,
                            birth_month,
                            ziwei_branch,
                            birth_hour,
                        )
                        .expect("固定年柱必须有效");
                        let from_parameters =
                            Ziwei::from_parameters(parameters).expect("已验证的参数必须能够排盘");

                        assert_eq!(from_birth.profile().birth_year(), Some(birth_year));
                        assert_eq!(from_birth.profile().birth_day(), Some(birth.birth_day));
                        assert_eq!(from_parameters.profile().birth_year(), None);
                        assert_eq!(from_parameters.profile().birth_day(), None);
                        for natal in [&from_birth, &from_parameters] {
                            let profile = natal.profile();
                            assert_eq!(
                                (
                                    profile.gender(),
                                    profile.birth_stem(),
                                    profile.birth_branch(),
                                    profile.birth_month(),
                                    profile.birth_hour()
                                ),
                                (gender, birth_stem, birth_branch, birth_month, birth_hour)
                            );
                        }
                        assert_eq!(
                            from_birth.ziwei_palace().branch(),
                            ziwei_branch,
                            "出生资料 {birth:?}"
                        );
                        assert_eq!(
                            from_birth.palaces(),
                            from_parameters.palaces(),
                            "出生资料 {birth:?}"
                        );
                        assert_eq!(from_birth.zodiac(), from_parameters.zodiac());
                        assert_eq!(
                            from_birth.five_element_bureau(),
                            from_parameters.five_element_bureau()
                        );
                        assert_eq!(from_birth.ming_palace(), from_parameters.ming_palace());
                        assert_eq!(from_birth.shen_palace(), from_parameters.shen_palace());
                        assert_eq!(from_birth.origin_palace(), from_parameters.origin_palace());
                        assert_eq!(from_birth.ziwei_palace(), from_parameters.ziwei_palace());
                    }
                }
            }
        }
    }
}

#[test]
fn from_parameters_preserves_input_facts_without_inventing_dates() {
    // D-223：六十甲子、两种性别、月份及时辰边界、十二紫微落宫，共 5,760 盘。
    // 检查六个输入字段没有丢失或交叉传入，不使用内部 Profile 构造器或排盘函数。
    for year_index in 0..60 {
        let birth_stem = Stem::ALL[year_index % 10];
        let birth_branch = Branch::ALL[year_index % 12];
        for gender in [Gender::Female, Gender::Male] {
            for month in [1, 12] {
                let birth_month = BirthMonth::try_from(month).expect("月份边界必须有效");
                for birth_hour in [Branch::Zi, Branch::Hai] {
                    for ziwei_branch in Branch::ALL {
                        let parameters = Parameters::new(
                            gender,
                            birth_stem,
                            birth_branch,
                            birth_month,
                            ziwei_branch,
                            birth_hour,
                        )
                        .expect("同阴阳的生年干支必须有效");
                        let natal =
                            Ziwei::from_parameters(parameters).expect("已验证的参数必须能够排盘");
                        let profile = natal.profile();

                        assert_eq!(profile.birth_year(), None);
                        assert_eq!(profile.birth_day(), None);
                        assert_eq!(
                            (
                                profile.gender(),
                                profile.birth_stem(),
                                profile.birth_branch(),
                                profile.birth_month(),
                                profile.birth_hour()
                            ),
                            (gender, birth_stem, birth_branch, birth_month, birth_hour)
                        );
                        assert_eq!(natal.zodiac(), birth_branch.zodiac());
                        assert_eq!(natal.ziwei_palace().branch(), ziwei_branch);
                        assert!(natal.ziwei_palace().star(StarName::ZiWei).is_some());
                    }
                }
            }
        }
    }
}

#[test]
fn decade_returns_the_confirmed_forward_and_reverse_palace_names() {
    // D-019、D-225：项目唯一规则；正月子时命宫在寅。
    // 第二大限：阳男、阴女的大命在卯，阴男、阳女的大命在丑；其余宫职始终逆布。
    let forward_names = [
        PalaceName::XiongDi,
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
    ];
    let reverse_names = [
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
        PalaceName::Ming,
    ];

    for (birth_year, gender, expected) in [
        (1984, Gender::Male, forward_names),
        (1985, Gender::Female, forward_names),
        (1984, Gender::Female, reverse_names),
        (1985, Gender::Male, reverse_names),
    ] {
        let natal = Ziwei::from_birth(Birth {
            gender,
            birth_year,
            birth_month: BirthMonth::try_from(1).unwrap(),
            birth_day: BirthDay::try_from(1).unwrap(),
            birth_hour: Branch::Zi,
        })
        .unwrap();
        assert_eq!(natal.ming_palace().branch(), Branch::Yin);

        let decade: [Decade; 12] = natal.decade(DecadeIndex::try_from(1).unwrap());
        assert_eq!(
            decade.map(Decade::name),
            expected,
            "{birth_year} {gender:?}"
        );
    }
}

#[test]
fn decade_matches_all_palace_positions_and_indices_for_both_inputs() {
    // D-019、D-225：正月子时以寅为命宫，此后月份每增一，命宫顺移一宫。
    // 预期从固定的寅宫大命布局逐宫旋转，不复写实现中的索引公式。
    let palace_branches = [
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
    let ming_at_yin = [
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

    for (birth_year, birth_stem, birth_branch, gender, forward) in [
        (1984, Stem::Jia, Branch::Zi, Gender::Male, true),
        (1985, Stem::Yi, Branch::Chou, Gender::Female, true),
        (1984, Stem::Jia, Branch::Zi, Gender::Female, false),
        (1985, Stem::Yi, Branch::Chou, Gender::Male, false),
    ] {
        for month in 1..=12 {
            let birth_month = BirthMonth::try_from(month).unwrap();
            let birth = Ziwei::from_birth(Birth {
                gender,
                birth_year,
                birth_month,
                birth_day: BirthDay::try_from(1).unwrap(),
                birth_hour: Branch::Zi,
            })
            .unwrap();
            let parameters = Ziwei::from_parameters(
                Parameters::new(
                    gender,
                    birth_stem,
                    birth_branch,
                    birth_month,
                    Branch::You,
                    Branch::Zi,
                )
                .unwrap(),
            )
            .unwrap();

            for natal in [birth, parameters] {
                let before = natal.clone();
                let mut expected = ming_at_yin;
                expected.rotate_right(usize::from(month - 1));
                assert_eq!(
                    natal.ming_palace().branch(),
                    palace_branches[usize::from(month - 1)]
                );
                assert_eq!(
                    natal.palaces().each_ref().map(|palace| palace.branch()),
                    palace_branches
                );

                for index in 0..=11 {
                    let index = DecadeIndex::try_from(index).unwrap();
                    let decade = natal.decade(index);
                    assert_eq!(
                        decade.map(Decade::name),
                        expected,
                        "{birth_year} {gender:?} month={month} index={index:?}"
                    );
                    let ming_index = decade
                        .iter()
                        .position(|palace| palace.name() == PalaceName::Ming)
                        .unwrap();
                    // 大命所在实际宫位必须对应同一大限的既有年龄区间。
                    assert_eq!(
                        natal.palaces()[ming_index].decade_age_range().start(),
                        natal.ming_palace().decade_age_range().start() + 10 * index.get()
                    );
                    assert_eq!(natal.decade(index), decade);

                    if forward {
                        expected.rotate_right(1);
                    } else {
                        expected.rotate_left(1);
                    }
                }
                // 查询期间宫职不得重排星曜、宫干或修改其他本命事实。
                assert_eq!(natal, before);
            }
        }
    }
}

#[test]
fn invalid_decade_indices_are_rejected_before_the_query() {
    // D-144、D-145、D-225～D-227：序号错误发生在 DecadeIndex 转换处，查询不重复校验。
    let natal = Ziwei::from_birth(Birth {
        gender: Gender::Male,
        birth_year: 1984,
        birth_month: BirthMonth::try_from(1).unwrap(),
        birth_day: BirthDay::try_from(1).unwrap(),
        birth_hour: Branch::Zi,
    })
    .unwrap();

    for value in 12..=u8::MAX {
        let result = DecadeIndex::try_from(value).map(|index| natal.decade(index));
        assert_eq!(result, Err(ZiweiError::InvalidDecadeIndex { value }));
        let years = DecadeIndex::try_from(value).map(|index| natal.decade_years(index));
        assert_eq!(years, Err(ZiweiError::InvalidDecadeIndex { value }));
        let yearly = DecadeIndex::try_from(value)
            .map(|decade| natal.yearly(decade, YearlyIndex::try_from(0).unwrap()));
        assert_eq!(yearly, Err(ZiweiError::InvalidDecadeIndex { value }));
    }
}

#[test]
fn decade_years_returns_ten_ordered_ages_and_numeric_years() {
    // D-149、D-226：1992 年八月卯时为水二局，第一大限从虚岁二岁开始。
    // 虚岁一岁对应出生年，因此第一项年份为 1993，而不是 1992。
    let natal = Ziwei::from_birth(Birth {
        gender: Gender::Female,
        birth_year: 1992,
        birth_month: BirthMonth::try_from(8).unwrap(),
        birth_day: BirthDay::try_from(17).unwrap(),
        birth_hour: Branch::Mao,
    })
    .unwrap();
    assert_eq!(natal.five_element_bureau(), FiveElementBureau::WaterTwo);

    for (index, expected) in [
        (
            0,
            [
                (2, Some(1993)),
                (3, Some(1994)),
                (4, Some(1995)),
                (5, Some(1996)),
                (6, Some(1997)),
                (7, Some(1998)),
                (8, Some(1999)),
                (9, Some(2000)),
                (10, Some(2001)),
                (11, Some(2002)),
            ],
        ),
        (
            11,
            [
                (112, Some(2103)),
                (113, Some(2104)),
                (114, Some(2105)),
                (115, Some(2106)),
                (116, Some(2107)),
                (117, Some(2108)),
                (118, Some(2109)),
                (119, Some(2110)),
                (120, Some(2111)),
                (121, Some(2112)),
            ],
        ),
    ] {
        let years: [DecadeYear; 10] = natal.decade_years(DecadeIndex::try_from(index).unwrap());
        let actual: [(u8, Option<i64>); 10] = years.map(|year| (year.age(), year.year()));
        assert_eq!(actual, expected, "decade={index}");
    }
}

#[test]
fn decade_years_covers_all_bureaus_and_decades_for_both_inputs() {
    // D-019、D-149、D-203、D-226：甲年子时，以下月份的命宫干支依次为
    // 丙子、戊辰、壬申、庚午、丙寅，对应五种五行局。
    // 首项年龄与年份为固定预期；逐年递增覆盖全部 120 年，不复写大限索引公式。
    for (month, bureau, first_age, first_year) in [
        (11, FiveElementBureau::WaterTwo, 2, 1985),
        (3, FiveElementBureau::WoodThree, 3, 1986),
        (7, FiveElementBureau::MetalFour, 4, 1987),
        (5, FiveElementBureau::EarthFive, 5, 1988),
        (1, FiveElementBureau::FireSix, 6, 1989),
    ] {
        let birth_month = BirthMonth::try_from(month).unwrap();
        for gender in [Gender::Female, Gender::Male] {
            let from_birth = Ziwei::from_birth(Birth {
                gender,
                birth_year: 1984,
                birth_month,
                birth_day: BirthDay::try_from(1).unwrap(),
                birth_hour: Branch::Zi,
            })
            .unwrap();
            let from_parameters = Ziwei::from_parameters(
                Parameters::new(
                    gender,
                    Stem::Jia,
                    Branch::Zi,
                    birth_month,
                    Branch::You,
                    Branch::Zi,
                )
                .unwrap(),
            )
            .unwrap();

            for (natal, has_year) in [(from_birth, true), (from_parameters, false)] {
                let before = natal.clone();
                assert_eq!(natal.five_element_bureau(), bureau);
                let birth_year: Option<i32> = natal.profile().birth_year();
                assert_eq!(birth_year, has_year.then_some(1984));
                let mut expected_age = first_age;
                let mut expected_year = first_year;

                for index in 0..=11 {
                    let decade = DecadeIndex::try_from(index).unwrap();
                    let years = natal.decade_years(decade);
                    for year in years {
                        assert_eq!(
                            (year.age(), year.year()),
                            (expected_age, has_year.then_some(expected_year)),
                            "{bureau:?} {gender:?} decade={index} has_year={has_year}"
                        );
                        expected_age += 1;
                        expected_year += 1;
                    }

                    // 摘要首尾虚岁必须与大命所在本命宫位的既有年龄区间一致。
                    let palace_index = natal
                        .decade(decade)
                        .iter()
                        .position(|palace| palace.name() == PalaceName::Ming)
                        .unwrap();
                    let range = natal.palaces()[palace_index].decade_age_range();
                    assert_eq!(years[0].age(), range.start());
                    assert_eq!(years[9].age(), range.end());
                    assert_eq!(natal.decade_years(decade), years);
                }
                assert_eq!(natal, before);
            }
        }
    }
}

#[test]
fn decade_years_preserves_wide_years_and_crosses_numeric_zero() {
    // D-180、D-203、D-226：所列命宫干支均为火六局；以固定年份核验扩宽先于加法。
    // 年份只做数字运算，不跳过零年，也不把超过 i32 范围的结果改为 None。
    for (birth_year, month, decade, first_age, first_year, last_year) in [
        (i32::MIN, 3, 0, 6, -2_147_483_643_i64, -2_147_483_634_i64),
        (i32::MIN, 3, 11, 116, -2_147_483_533, -2_147_483_524),
        (i32::MAX, 3, 0, 6, 2_147_483_652, 2_147_483_661),
        (i32::MAX, 3, 11, 116, 2_147_483_762, 2_147_483_771),
        (-6, 1, 0, 6, -1, 8),
        (0, 11, 0, 6, 5, 14),
    ] {
        let natal = Ziwei::from_birth(Birth {
            gender: Gender::Female,
            birth_year,
            birth_month: BirthMonth::try_from(month).unwrap(),
            birth_day: BirthDay::try_from(1).unwrap(),
            birth_hour: Branch::Zi,
        })
        .unwrap();
        assert_eq!(natal.five_element_bureau(), FiveElementBureau::FireSix);
        assert_eq!(natal.profile().birth_year(), Some(birth_year));

        let years = natal.decade_years(DecadeIndex::try_from(decade).unwrap());
        let expected = (first_age..first_age + 10).zip(first_year..=last_year);
        for (year, (age, expected_year)) in years.iter().zip(expected) {
            assert_eq!((year.age(), year.year()), (age, Some(expected_year)));
        }
        assert_eq!(years[0].year(), Some(first_year));
        assert_eq!(years[9].year(), Some(last_year));
    }
}

#[test]
fn yearly_returns_the_confirmed_palace_names() {
    // D-020、D-227：1992 壬申年、水二局，第一大限第一年为虚岁二岁，流命在酉。
    // 宫职从流命逆布，按寅至丑的实际宫位顺序输出，与本命命宫所在的午宫不同。
    let natal = Ziwei::from_birth(Birth {
        gender: Gender::Female,
        birth_year: 1992,
        birth_month: BirthMonth::try_from(8).unwrap(),
        birth_day: BirthDay::try_from(17).unwrap(),
        birth_hour: Branch::Mao,
    })
    .unwrap();
    assert_eq!(natal.five_element_bureau(), FiveElementBureau::WaterTwo);
    assert_eq!(natal.ming_palace().branch(), Branch::Wu);

    let yearly: [Yearly; 12] = natal.yearly(
        DecadeIndex::try_from(0).unwrap(),
        YearlyIndex::try_from(0).unwrap(),
    );
    assert_eq!(
        yearly.map(Yearly::name),
        [
            PalaceName::JiaoYou,
            PalaceName::QianYi,
            PalaceName::JiE,
            PalaceName::CaiBo,
            PalaceName::ZiNv,
            PalaceName::FuQi,
            PalaceName::XiongDi,
            PalaceName::Ming,
            PalaceName::FuMu,
            PalaceName::FuDe,
            PalaceName::TianZhai,
            PalaceName::GuanLu,
        ]
    );
    assert_eq!(natal.palaces()[7].branch(), Branch::You);
    assert_eq!(yearly[7].name_hans(), "流命");
    assert_eq!(yearly[3].name_hans(), "流财");
    assert_eq!(yearly[3].name_hant(), "流財");
}

#[test]
fn yearly_covers_all_birth_branches_and_period_indices_for_both_inputs() {
    // D-020、D-227：十二个固定干支年逐一覆盖生年支，各年十二个月覆盖全部五行局。
    // 预期从虚岁一岁的固定布局出发逐年旋转，不复写实现中的虚岁取模公式。
    let palace_branches = [
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
    let ming_at_yin = [
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

    for (birth_year, birth_stem, birth_branch) in [
        (1984, Stem::Jia, Branch::Zi),
        (1985, Stem::Yi, Branch::Chou),
        (1986, Stem::Bing, Branch::Yin),
        (1987, Stem::Ding, Branch::Mao),
        (1988, Stem::Wu, Branch::Chen),
        (1989, Stem::Ji, Branch::Si),
        (1990, Stem::Geng, Branch::Wu),
        (1991, Stem::Xin, Branch::Wei),
        (1992, Stem::Ren, Branch::Shen),
        (1993, Stem::Gui, Branch::You),
        (1994, Stem::Jia, Branch::Xu),
        (1995, Stem::Yi, Branch::Hai),
    ] {
        let birth_position = palace_branches
            .iter()
            .position(|&branch| branch == birth_branch)
            .unwrap();
        let mut covered_bureaus = [false; 5];
        for month in 1..=12 {
            let birth_month = BirthMonth::try_from(month).unwrap();
            for gender in [Gender::Female, Gender::Male] {
                let from_birth = Ziwei::from_birth(Birth {
                    gender,
                    birth_year,
                    birth_month,
                    birth_day: BirthDay::try_from(1).unwrap(),
                    birth_hour: Branch::Zi,
                })
                .unwrap();
                let from_parameters = Ziwei::from_parameters(
                    Parameters::new(
                        gender,
                        birth_stem,
                        birth_branch,
                        birth_month,
                        Branch::You,
                        Branch::Zi,
                    )
                    .unwrap(),
                )
                .unwrap();

                for (natal, has_year) in [(from_birth, true), (from_parameters, false)] {
                    let before = natal.clone();
                    assert_eq!(natal.profile().birth_branch(), birth_branch);
                    assert_eq!(natal.profile().birth_year(), has_year.then_some(birth_year));
                    assert_eq!(
                        natal.palaces().each_ref().map(|palace| palace.branch()),
                        palace_branches
                    );
                    let (first_age, bureau_index) = match natal.five_element_bureau() {
                        FiveElementBureau::WaterTwo => (2, 0),
                        FiveElementBureau::WoodThree => (3, 1),
                        FiveElementBureau::MetalFour => (4, 2),
                        FiveElementBureau::EarthFive => (5, 3),
                        FiveElementBureau::FireSix => (6, 4),
                    };
                    covered_bureaus[bureau_index] = true;
                    let mut expected = ming_at_yin;
                    expected.rotate_right(birth_position);
                    for _ in 1..first_age {
                        expected.rotate_right(1);
                    }
                    let first_layout = expected;

                    for decade in 0..=11 {
                        let decade = DecadeIndex::try_from(decade).unwrap();
                        for index in 0..=9 {
                            let index = YearlyIndex::try_from(index).unwrap();
                            let yearly = natal.yearly(decade, index);
                            assert_eq!(
                                yearly.map(Yearly::name),
                                expected,
                                "{birth_year} month={month} {gender:?} {decade:?} {index:?} has_year={has_year}"
                            );
                            expected.rotate_right(1);
                        }
                    }
                    assert_eq!(
                        natal
                            .yearly(
                                DecadeIndex::try_from(0).unwrap(),
                                YearlyIndex::try_from(0).unwrap(),
                            )
                            .map(Yearly::name),
                        first_layout
                    );
                    assert_eq!(natal, before);
                }
            }
        }
        assert_eq!(covered_bureaus, [true; 5], "{birth_year}");
    }
}

#[test]
fn yearly_handles_maximum_age_and_numeric_year_boundaries() {
    // D-020、D-180、D-203、D-227：固定火六局，首末流年分别为虚岁六岁与 125 岁。
    // 乙亥年末流年的生年支索引加虚岁达到 136，不能在取模前转成 i8。
    for (birth_year, month, first_branch, last_branch) in [
        (i32::MIN, 3, Branch::Si, Branch::Chen),
        (i32::MAX, 3, Branch::Shen, Branch::Wei),
        (-6, 1, Branch::Wei, Branch::Wu),
        (0, 11, Branch::Chou, Branch::Zi),
        (1995, 11, Branch::Chen, Branch::Mao),
    ] {
        let natal = Ziwei::from_birth(Birth {
            gender: Gender::Female,
            birth_year,
            birth_month: BirthMonth::try_from(month).unwrap(),
            birth_day: BirthDay::try_from(1).unwrap(),
            birth_hour: Branch::Zi,
        })
        .unwrap();
        assert_eq!(natal.five_element_bureau(), FiveElementBureau::FireSix);

        for (decade, index, expected_branch) in [(0, 0, first_branch), (11, 9, last_branch)] {
            let yearly = natal.yearly(
                DecadeIndex::try_from(decade).unwrap(),
                YearlyIndex::try_from(index).unwrap(),
            );
            let ming_index = yearly
                .iter()
                .position(|palace| palace.name() == PalaceName::Ming)
                .unwrap();
            assert_eq!(natal.palaces()[ming_index].branch(), expected_branch);
        }
        assert_eq!(natal.profile().birth_year(), Some(birth_year));
    }
}

#[test]
fn invalid_yearly_indices_are_rejected_before_the_query() {
    // D-144、D-145、D-227：流年序号由 YearlyIndex 校验，查询不增加错误分支。
    let natal = Ziwei::from_parameters(
        Parameters::new(
            Gender::Female,
            Stem::Ren,
            Branch::Shen,
            BirthMonth::try_from(8).unwrap(),
            Branch::You,
            Branch::Mao,
        )
        .unwrap(),
    )
    .unwrap();
    let decade = DecadeIndex::try_from(0).unwrap();

    for value in 10..=u8::MAX {
        let result = YearlyIndex::try_from(value).map(|index| natal.yearly(decade, index));
        assert_eq!(result, Err(ZiweiError::InvalidYearlyIndex { value }));
    }
}

#[test]
fn invalid_birth_values_are_rejected_before_natal_construction() {
    // D-170、D-224：月份与日期范围由值类型校验，入口不再引入实际历法日期校验。
    for (month, day, expected) in [
        (0, 1, ZiweiError::InvalidLunisolarMonth { value: 0 }),
        (13, 1, ZiweiError::InvalidLunisolarMonth { value: 13 }),
        (1, 0, ZiweiError::InvalidLunisolarDay { value: 0 }),
        (1, 31, ZiweiError::InvalidLunisolarDay { value: 31 }),
    ] {
        let result = BirthMonth::try_from(month)
            .and_then(|birth_month| {
                BirthDay::try_from(day).map(|birth_day| Birth {
                    gender: Gender::Female,
                    birth_year: 1992,
                    birth_month,
                    birth_day,
                    birth_hour: Branch::Mao,
                })
            })
            .and_then(Ziwei::from_birth);
        assert_eq!(result, Err(expected));
    }
}

#[test]
fn invalid_parameters_are_rejected_before_natal_construction() {
    // D-125、D-170、D-223：错误属于输入构造阶段，公开排盘入口不重复校验。
    for (stem, branch) in [(Stem::Jia, Branch::Chou), (Stem::Gui, Branch::Zi)] {
        let result = Parameters::new(
            Gender::Female,
            stem,
            branch,
            BirthMonth::try_from(1).expect("范围内月份必须有效"),
            Branch::You,
            Branch::Mao,
        )
        .and_then(Ziwei::from_parameters);
        assert_eq!(
            result,
            Err(ZiweiError::InvalidSexagenaryYear { stem, branch })
        );
    }
    for value in [0, 13] {
        let result = BirthMonth::try_from(value)
            .and_then(|month| {
                Parameters::new(
                    Gender::Female,
                    Stem::Ren,
                    Branch::Shen,
                    month,
                    Branch::You,
                    Branch::Mao,
                )
            })
            .and_then(Ziwei::from_parameters);
        assert_eq!(result, Err(ZiweiError::InvalidLunisolarMonth { value }));
    }
}
