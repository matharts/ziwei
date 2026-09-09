use ziwei::{
    Birth, BirthDay, BirthMonth, Branch, DecadeIndex, Gender, Natal, PalaceName, Parameters, Stem,
    YearlyIndex, Ziwei,
};

fn chart_pair(birth: Birth, stem: Stem, branch: Branch, ziwei_branch: Branch) -> [Natal; 2] {
    let parameters = Parameters::new(
        birth.gender,
        stem,
        branch,
        birth.birth_month,
        ziwei_branch,
        birth.birth_hour,
    )
    .unwrap();

    [
        Ziwei::from_birth(birth).unwrap(),
        Ziwei::from_parameters(parameters).unwrap(),
    ]
}

#[test]
fn period_palace_queries_match_hand_derived_forward_and_reverse_charts() {
    // fixtures/README.md、D-225、D-227，适用项目唯一规则，非外部专家审定。
    // 丁卯男：本命命宫酉、土五局逆行，第二大限大命申，末年虚岁 24，流命寅。
    // 辛酉女：本命命宫亥、木三局顺行，第二大限大命子，末年虚岁 22，流命午。
    // 各列从相应命宫逐宫逆数，显式记录十二宫职对应地支，不从被测数组生成。
    let cases = [
        (
            Gender::Male,
            1987,
            5,
            20,
            Branch::You,
            Stem::Ding,
            Branch::Mao,
            Branch::Si,
            [
                (PalaceName::Ming, Branch::Shen, Branch::Yin),
                (PalaceName::XiongDi, Branch::Wei, Branch::Chou),
                (PalaceName::FuQi, Branch::Wu, Branch::Zi),
                (PalaceName::ZiNv, Branch::Si, Branch::Hai),
                (PalaceName::CaiBo, Branch::Chen, Branch::Xu),
                (PalaceName::JiE, Branch::Mao, Branch::You),
                (PalaceName::QianYi, Branch::Yin, Branch::Shen),
                (PalaceName::JiaoYou, Branch::Chou, Branch::Wei),
                (PalaceName::GuanLu, Branch::Zi, Branch::Wu),
                (PalaceName::TianZhai, Branch::Hai, Branch::Si),
                (PalaceName::FuDe, Branch::Xu, Branch::Chen),
                (PalaceName::FuMu, Branch::You, Branch::Mao),
            ],
        ),
        (
            Gender::Female,
            1981,
            11,
            7,
            Branch::Chou,
            Stem::Xin,
            Branch::You,
            Branch::Wu,
            [
                (PalaceName::Ming, Branch::Zi, Branch::Wu),
                (PalaceName::XiongDi, Branch::Hai, Branch::Si),
                (PalaceName::FuQi, Branch::Xu, Branch::Chen),
                (PalaceName::ZiNv, Branch::You, Branch::Mao),
                (PalaceName::CaiBo, Branch::Shen, Branch::Yin),
                (PalaceName::JiE, Branch::Wei, Branch::Chou),
                (PalaceName::QianYi, Branch::Wu, Branch::Zi),
                (PalaceName::JiaoYou, Branch::Si, Branch::Hai),
                (PalaceName::GuanLu, Branch::Chen, Branch::Xu),
                (PalaceName::TianZhai, Branch::Mao, Branch::You),
                (PalaceName::FuDe, Branch::Yin, Branch::Shen),
                (PalaceName::FuMu, Branch::Chou, Branch::Wei),
            ],
        ),
    ];
    let decade = DecadeIndex::try_from(1).unwrap();
    let yearly = YearlyIndex::try_from(9).unwrap();

    for (gender, birth_year, month, day, birth_hour, stem, branch, ziwei_branch, expected) in cases
    {
        let birth = Birth {
            gender,
            birth_year,
            birth_month: BirthMonth::try_from(month).unwrap(),
            birth_day: BirthDay::try_from(day).unwrap(),
            birth_hour,
        };
        for natal in chart_pair(birth, stem, branch, ziwei_branch) {
            let before = natal.clone();
            for (name, decade_branch, yearly_branch) in expected {
                let decade_palace = natal.decade_palace_by_name(decade, name);
                let yearly_palace = natal.yearly_palace_by_name(decade, yearly, name);

                assert_eq!(decade_palace.branch(), decade_branch);
                assert_eq!(yearly_palace.branch(), yearly_branch);
                assert!(core::ptr::eq(decade_palace, natal.palace(decade_branch)));
                assert!(core::ptr::eq(yearly_palace, natal.palace(yearly_branch)));
                assert_eq!(natal.decade_by_branch(decade, decade_branch).name(), name);
                assert_eq!(
                    natal.yearly_by_branch(decade, yearly, yearly_branch).name(),
                    name
                );
            }
            let decade_ming = natal.decade_by_branch(decade, expected[0].1);
            let yearly_ming = natal.yearly_by_branch(decade, yearly, expected[0].2);
            assert_eq!(
                (decade_ming.name_hans(), decade_ming.name_hant()),
                ("大命", "大命")
            );
            assert_eq!(
                (yearly_ming.name_hans(), yearly_ming.name_hant()),
                ("流命", "流命")
            );
            // 返回的仍是本命实际宫位；期间命宫不会把该宫的本命宫职改为 Ming。
            assert_ne!(
                natal.decade_palace_by_name(decade, PalaceName::Ming).name(),
                PalaceName::Ming,
            );
            assert_ne!(
                natal
                    .yearly_palace_by_name(decade, yearly, PalaceName::Ming)
                    .name(),
                PalaceName::Ming,
            );
            assert_eq!(natal, before);
        }
    }
}

#[test]
fn period_palace_queries_borrow_the_layout_palace_for_all_periods_and_names() {
    // 一致性证据：五种局的生年干、两种性别、十二个本命命宫及两种入口。
    // 独立的规则预期由上面的固定锚点承担，此处验证单宫查询和原布局的衔接。
    for (birth_year, stem, branch) in [
        (1984, Stem::Jia, Branch::Zi),
        (1985, Stem::Yi, Branch::Chou),
        (1986, Stem::Bing, Branch::Yin),
        (1987, Stem::Ding, Branch::Mao),
        (1988, Stem::Wu, Branch::Chen),
    ] {
        for gender in [Gender::Male, Gender::Female] {
            for month in 1..=12 {
                let birth = Birth {
                    gender,
                    birth_year,
                    birth_month: BirthMonth::try_from(month).unwrap(),
                    birth_day: BirthDay::try_from(6).unwrap(),
                    birth_hour: Branch::Zi,
                };
                let from_birth = Ziwei::from_birth(birth).unwrap();
                let parameters = Parameters::new(
                    gender,
                    stem,
                    branch,
                    birth.birth_month,
                    from_birth.ziwei_palace().branch(),
                    birth.birth_hour,
                )
                .unwrap();
                let from_parameters = Ziwei::from_parameters(parameters).unwrap();

                for natal in [&from_birth, &from_parameters] {
                    let before = natal.clone();
                    for index in 0..12 {
                        let decade = DecadeIndex::try_from(index).unwrap();
                        for (period, palace) in natal.decade(decade).iter().zip(natal.palaces()) {
                            let single = natal.decade_by_branch(decade, palace.branch());
                            assert_eq!(single, *period);
                            assert_eq!(single.name_hans(), period.name_hans());
                            assert_eq!(single.name_hant(), period.name_hant());
                            assert!(core::ptr::eq(
                                natal.decade_palace_by_name(decade, single.name()),
                                palace,
                            ));
                        }
                        for index in 0..10 {
                            let yearly = YearlyIndex::try_from(index).unwrap();
                            for (period, palace) in
                                natal.yearly(decade, yearly).iter().zip(natal.palaces())
                            {
                                let single =
                                    natal.yearly_by_branch(decade, yearly, palace.branch());
                                assert_eq!(single, *period);
                                assert_eq!(single.name_hans(), period.name_hans());
                                assert_eq!(single.name_hant(), period.name_hant());
                                assert!(core::ptr::eq(
                                    natal.yearly_palace_by_name(decade, yearly, single.name()),
                                    palace,
                                ));
                            }
                        }
                    }
                    assert_eq!(natal, &before);
                }
            }
        }
    }
}

#[test]
fn period_palace_queries_cover_first_and_last_periods_at_maximum_age() {
    // D-225、D-227：乙亥女、十一月子时，命宫戊子火六局顺行。
    // 第十二大限大命亥；首年虚岁 6（庚辰），末年虚岁 125（己卯）。
    // 生年支索引 11 加虚岁 125 达到 136，不能在取模前转成 i8。
    let birth = Birth {
        gender: Gender::Female,
        birth_year: 1995,
        birth_month: BirthMonth::try_from(11).unwrap(),
        birth_day: BirthDay::try_from(6).unwrap(),
        birth_hour: Branch::Zi,
    };
    for natal in chart_pair(birth, Stem::Yi, Branch::Hai, Branch::Yin) {
        for (decade, yearly, decade_branch, yearly_branch) in [
            (0, 0, Branch::Zi, Branch::Chen),
            (11, 9, Branch::Hai, Branch::Mao),
        ] {
            let decade = DecadeIndex::try_from(decade).unwrap();
            let yearly = YearlyIndex::try_from(yearly).unwrap();

            assert_eq!(
                natal
                    .decade_palace_by_name(decade, PalaceName::Ming)
                    .branch(),
                decade_branch,
            );
            assert_eq!(
                natal
                    .yearly_palace_by_name(decade, yearly, PalaceName::Ming)
                    .branch(),
                yearly_branch,
            );
            assert_eq!(
                natal.decade_by_branch(decade, decade_branch).name(),
                PalaceName::Ming
            );
            assert_eq!(
                natal.yearly_by_branch(decade, yearly, yearly_branch).name(),
                PalaceName::Ming,
            );
        }
    }
}
