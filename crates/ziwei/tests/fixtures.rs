use ziwei::{
    Birth, BirthDay, BirthMonth, Branch, DecadeIndex, FiveElementBureau, Gender, PalaceName,
    Parameters, StarName, Stem, Transformation, YearlyIndex, Ziwei,
};

#[test]
fn hand_derived_jia_zi_chart_matches_both_entry_points() {
    let birth = Birth {
        gender: Gender::Male,
        birth_year: 1984,
        birth_month: BirthMonth::try_from(1).unwrap(),
        birth_day: BirthDay::try_from(6).unwrap(),
        birth_hour: Branch::Zi,
    };
    let from_birth = Ziwei::from_birth(birth).unwrap();
    let from_parameters = Ziwei::from_parameters(
        ziwei::Parameters::new(
            birth.gender,
            Stem::Jia,
            Branch::Zi,
            birth.birth_month,
            Branch::Yin,
            birth.birth_hour,
        )
        .unwrap(),
    )
    .unwrap();
    // 样例文本显式对应领域身份，不借用被测 ALL 数组解释预期值。
    let identities = [
        ("ZiWei", StarName::ZiWei),
        ("TianJi", StarName::TianJi),
        ("TaiYang", StarName::TaiYang),
        ("WuQu", StarName::WuQu),
        ("TianTong", StarName::TianTong),
        ("LianZhen", StarName::LianZhen),
        ("TianFu", StarName::TianFu),
        ("TaiYin", StarName::TaiYin),
        ("TanLang", StarName::TanLang),
        ("JuMen", StarName::JuMen),
        ("TianXiang", StarName::TianXiang),
        ("TianLiang", StarName::TianLiang),
        ("QiSha", StarName::QiSha),
        ("PoJun", StarName::PoJun),
        ("ZuoFu", StarName::ZuoFu),
        ("YouBi", StarName::YouBi),
        ("WenChang", StarName::WenChang),
        ("WenQu", StarName::WenQu),
    ];
    let branches = [
        ("Zi", Branch::Zi),
        ("Chou", Branch::Chou),
        ("Yin", Branch::Yin),
        ("Mao", Branch::Mao),
        ("Chen", Branch::Chen),
        ("Si", Branch::Si),
        ("Wu", Branch::Wu),
        ("Wei", Branch::Wei),
        ("Shen", Branch::Shen),
        ("You", Branch::You),
        ("Xu", Branch::Xu),
        ("Hai", Branch::Hai),
    ];
    let transform = |value| match value {
        "-" => None,
        "A" => Some(Transformation::A),
        "B" => Some(Transformation::B),
        "C" => Some(Transformation::C),
        "D" => Some(Transformation::D),
        _ => panic!("未知样例化象"),
    };
    let rows: Vec<_> = include_str!("fixtures/jia_zi_fire_six.csv")
        .lines()
        .filter(|line| !line.starts_with('#') && !line.is_empty())
        .map(|line| line.split(',').collect::<Vec<_>>())
        .collect();
    assert_eq!(rows.len(), 18);
    for natal in [&from_birth, &from_parameters] {
        assert_eq!(
            natal.five_element_bureau(),
            ziwei::FiveElementBureau::FireSix
        );
        assert_eq!(natal.ming_palace().branch(), Branch::Yin);
        assert_eq!(natal.shen_palace().branch(), Branch::Yin);
        assert_eq!(natal.origin_palace().branch(), Branch::Xu);
        for (i, row) in rows.iter().enumerate() {
            assert_eq!(row.len(), 5);
            let (identity, name) = identities[i];
            assert_eq!(row[0], identity);
            let star = natal.star(name);
            assert_eq!(star.name(), name);
            let expected_branch = branches
                .iter()
                .find(|(identity, _)| *identity == row[1])
                .expect("样例地支必须有显式身份映射")
                .1;
            assert_eq!(
                natal.palace_by_star(star.name()).branch(),
                expected_branch,
                "{}",
                row[0]
            );
            assert_eq!(star.birth_transformation(), transform(row[2]), "{}", row[0]);
            assert_eq!(
                star.self_transformations().inward(),
                transform(row[3]),
                "{}",
                row[0]
            );
            assert_eq!(
                star.self_transformations().outward(),
                transform(row[4]),
                "{}",
                row[0]
            );
        }
        let names = [
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
        let stems = [
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
        ];
        for (i, palace) in natal.palaces().iter().enumerate() {
            assert_eq!(palace.name(), names[i]);
            assert_eq!(palace.stem(), stems[i]);
            assert_eq!(palace.decade_age_range().start(), 6 + 10 * i as u8);
            assert_eq!(palace.decade_age_range().end(), 15 + 10 * i as u8);
        }
    }
}

#[test]
fn hand_derived_day_boundaries_cover_all_five_element_bureaus() {
    // 正月子时，命身皆在寅。五虎遁、纳音局数、安紫微及天府定位的
    // 手算过程记录在 fixtures/README.md；这里不调用生产规则生成预期。
    let cases = [
        (
            1988,
            Stem::Wu,
            Branch::Chen,
            Stem::Jia,
            FiveElementBureau::WaterTwo,
            [
                (1, Branch::Chou, Branch::Mao),
                (30, Branch::Chen, Branch::Zi),
            ],
        ),
        (
            1986,
            Stem::Bing,
            Branch::Yin,
            Stem::Geng,
            FiveElementBureau::WoodThree,
            [(1, Branch::Chen, Branch::Zi), (30, Branch::Hai, Branch::Si)],
        ),
        (
            1987,
            Stem::Ding,
            Branch::Mao,
            Stem::Ren,
            FiveElementBureau::MetalFour,
            [(1, Branch::Hai, Branch::Si), (30, Branch::Hai, Branch::Si)],
        ),
        (
            1985,
            Stem::Yi,
            Branch::Chou,
            Stem::Wu,
            FiveElementBureau::EarthFive,
            [(1, Branch::Wu, Branch::Xu), (30, Branch::Wei, Branch::You)],
        ),
        (
            1984,
            Stem::Jia,
            Branch::Zi,
            Stem::Bing,
            FiveElementBureau::FireSix,
            [(1, Branch::You, Branch::Wei), (30, Branch::Wu, Branch::Xu)],
        ),
    ];

    for (year, stem, branch, ming_stem, bureau, days) in cases {
        for (day, ziwei_branch, tianfu_branch) in days {
            let birth = Birth {
                gender: Gender::Female,
                birth_year: year,
                birth_month: BirthMonth::try_from(1).unwrap(),
                birth_day: BirthDay::try_from(day).unwrap(),
                birth_hour: Branch::Zi,
            };
            let from_birth = Ziwei::from_birth(birth).unwrap();
            let from_parameters = Ziwei::from_parameters(
                Parameters::new(
                    birth.gender,
                    stem,
                    branch,
                    birth.birth_month,
                    ziwei_branch,
                    birth.birth_hour,
                )
                .unwrap(),
            )
            .unwrap();

            for natal in [from_birth, from_parameters] {
                assert_eq!(natal.profile().birth_stem(), stem, "{year} 正月 {day} 日");
                assert_eq!(natal.profile().birth_branch(), branch);
                assert_eq!(natal.ming_palace().branch(), Branch::Yin);
                assert_eq!(natal.shen_palace().branch(), Branch::Yin);
                assert_eq!(natal.ming_palace().stem(), ming_stem);
                assert_eq!(natal.five_element_bureau(), bureau);
                assert_eq!(
                    natal.ziwei_palace().branch(),
                    ziwei_branch,
                    "{year} 正月 {day} 日"
                );
                assert_eq!(
                    natal.palace_by_star(StarName::TianFu).branch(),
                    tianfu_branch
                );
            }
        }
    }
}

type ExpectedStar = (
    StarName,
    Branch,
    Option<Transformation>,
    Option<Transformation>,
    Option<Transformation>,
);

struct WorkedChart {
    birth: Birth,
    year_pillar: (Stem, Branch),
    bureau: FiveElementBureau,
    locations: [Branch; 4], // 命、身、来因、紫微。
    palaces: [(Branch, PalaceName, Stem, u8); 12],
    stars: [ExpectedStar; 18], // 星、落宫、生年、向心、离心。
    second_decade: [PalaceName; 12],
    last_year: [PalaceName; 12], // 第二大限内第十流年。
    ages: [u8; 10],
    years: [i64; 10],
}

fn assert_worked_chart(case: WorkedChart) {
    // 固定的十干四化口诀。只从手算命例查目标落宫，不调用生产规则推导预期。
    use StarName::*;
    let four_stars = [
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
    ];
    let branch_of = |name| case.stars.iter().find(|row| row.0 == name).unwrap().1;
    let targets = |stem| four_stars.iter().find(|row| row.0 == stem).unwrap().1;
    let births = [
        Ziwei::from_birth(case.birth).unwrap(),
        Ziwei::from_parameters(
            Parameters::new(
                case.birth.gender,
                case.year_pillar.0,
                case.year_pillar.1,
                case.birth.birth_month,
                case.locations[3],
                case.birth.birth_hour,
            )
            .unwrap(),
        )
        .unwrap(),
    ];
    for (input_index, natal) in births.iter().enumerate() {
        assert_eq!(natal.five_element_bureau(), case.bureau);
        assert_eq!(natal.profile().birth_stem(), case.year_pillar.0);
        assert_eq!(natal.profile().birth_branch(), case.year_pillar.1);
        assert_eq!(
            [
                natal.ming_palace(),
                natal.shen_palace(),
                natal.origin_palace(),
                natal.ziwei_palace()
            ]
            .map(|palace| palace.branch()),
            case.locations
        );
        for (palace, &(branch, name, stem, age)) in natal.palaces().iter().zip(&case.palaces) {
            assert_eq!(
                (palace.branch(), palace.name(), palace.stem()),
                (branch, name, stem)
            );
            assert_eq!(palace.decade_age_range().start(), age);
            assert_eq!(palace.decade_age_range().end(), age + 9);
            let names: Vec<_> = case
                .stars
                .iter()
                .filter(|row| row.1 == branch)
                .map(|row| row.0)
                .collect();
            assert_eq!(
                palace
                    .stars()
                    .iter()
                    .map(|star| star.name())
                    .collect::<Vec<_>>(),
                names
            );
            for (relation, (star, transformation)) in natal
                .palace_transformations(branch)
                .iter()
                .zip(targets(stem).into_iter().zip([
                    Transformation::A,
                    Transformation::B,
                    Transformation::C,
                    Transformation::D,
                ]))
            {
                assert_eq!(relation.source_branch(), branch);
                assert_eq!(relation.target_branch(), branch_of(star));
                assert_eq!(relation.star(), star);
                assert_eq!(relation.transformation(), transformation);
            }
        }
        for &(name, branch, birth, inward, outward) in &case.stars {
            let star = natal.star(name);
            assert_eq!(natal.palace_by_star(name).branch(), branch, "{name:?}");
            assert_eq!(star.birth_transformation(), birth, "{name:?}");
            assert_eq!(star.self_transformations().inward(), inward, "{name:?}");
            assert_eq!(star.self_transformations().outward(), outward, "{name:?}");
        }
        let expected_birth = targets(case.year_pillar.0).map(|name| (branch_of(name), name));
        assert_eq!(
            natal
                .birth_transformations()
                .map(|(palace, star)| (palace.branch(), star.name())),
            expected_birth
        );
        let expected_self: Vec<_> = case
            .palaces
            .iter()
            .flat_map(|&(branch, _, _, _)| {
                case.stars
                    .iter()
                    .filter(move |row| row.1 == branch && (row.3.is_some() || row.4.is_some()))
                    .map(move |row| (branch, row.0))
            })
            .collect();
        assert_eq!(
            natal
                .self_transformations()
                .map(|(palace, star)| (palace.branch(), star.name()))
                .collect::<Vec<_>>(),
            expected_self
        );
        let decade = DecadeIndex::try_from(1).unwrap();
        assert_eq!(
            natal.decade(decade).map(|role| role.name()),
            case.second_decade
        );
        assert_eq!(
            natal
                .yearly(decade, YearlyIndex::try_from(9).unwrap())
                .map(|role| role.name()),
            case.last_year
        );
        let years = natal.decade_years(decade);
        assert_eq!(years.map(|year| year.age()), case.ages);
        assert_eq!(
            years.map(|year| year.year()),
            case.years.map(|year| (input_index == 0).then_some(year))
        );
    }
}

#[test]
fn hand_derived_ding_mao_male_chart_covers_reverse_periods_and_all_flights() {
    use Branch::*;
    use PalaceName::*;
    use StarName::*;
    use Transformation::*;
    // 丁卯男命五月二十酉时：己酉土五局，紫微巳、天府亥。推导见 fixtures/README.md。
    assert_worked_chart(WorkedChart {
        birth: Birth {
            gender: Gender::Male,
            birth_year: 1987,
            birth_month: BirthMonth::try_from(5).unwrap(),
            birth_day: BirthDay::try_from(20).unwrap(),
            birth_hour: You,
        },
        year_pillar: (Stem::Ding, Mao),
        bureau: FiveElementBureau::EarthFive,
        locations: [You, Mao, Wei, Si],
        palaces: [
            (Yin, JiaoYou, Stem::Ren, 75),
            (Mao, QianYi, Stem::Gui, 65),
            (Chen, JiE, Stem::Jia, 55),
            (Si, CaiBo, Stem::Yi, 45),
            (Wu, ZiNv, Stem::Bing, 35),
            (Wei, FuQi, Stem::Ding, 25),
            (Shen, XiongDi, Stem::Wu, 15),
            (You, Ming, Stem::Ji, 5),
            (Xu, FuMu, Stem::Geng, 115),
            (Hai, FuDe, Stem::Xin, 105),
            (Zi, TianZhai, Stem::Ren, 95),
            (Chou, GuanLu, Stem::Gui, 85),
        ],
        stars: [
            (ZiWei, Si, None, None, Some(C)),
            (TianJi, Chen, Some(C), None, None),
            (TaiYang, Yin, None, None, None),
            (WuQu, Chou, None, None, None),
            (TianTong, Zi, Some(B), Some(A), None),
            (LianZhen, You, None, None, None),
            (TianFu, Hai, None, None, None),
            (TaiYin, Zi, Some(A), None, None),
            (TanLang, Chou, None, None, Some(D)),
            (JuMen, Yin, Some(D), None, None),
            (TianXiang, Mao, None, None, None),
            (TianLiang, Chen, None, None, None),
            (QiSha, Si, None, None, None),
            (PoJun, You, None, Some(A), None),
            (ZuoFu, Shen, None, Some(C), None),
            (YouBi, Wu, None, None, None),
            (WenChang, Chou, None, None, None),
            (WenQu, Chou, None, None, None),
        ],
        second_decade: [
            QianYi, JiE, CaiBo, ZiNv, FuQi, XiongDi, Ming, FuMu, FuDe, TianZhai, GuanLu, JiaoYou,
        ],
        last_year: [
            Ming, FuMu, FuDe, TianZhai, GuanLu, JiaoYou, QianYi, JiE, CaiBo, ZiNv, FuQi, XiongDi,
        ],
        ages: [15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
        years: [2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010],
    });
}

#[test]
fn hand_derived_xin_you_female_chart_covers_forward_periods_and_all_flights() {
    use Branch::*;
    use PalaceName::*;
    use StarName::*;
    use Transformation::*;
    // 辛酉女命十一月初七丑时：己亥木三局，初七补二按偶数补数顺移，紫微午、天府戌。
    assert_worked_chart(WorkedChart {
        birth: Birth {
            gender: Gender::Female,
            birth_year: 1981,
            birth_month: BirthMonth::try_from(11).unwrap(),
            birth_day: BirthDay::try_from(7).unwrap(),
            birth_hour: Chou,
        },
        year_pillar: (Stem::Xin, You),
        bureau: FiveElementBureau::WoodThree,
        locations: [Hai, Chou, Mao, Wu],
        palaces: [
            (Yin, TianZhai, Stem::Geng, 33),
            (Mao, GuanLu, Stem::Xin, 43),
            (Chen, JiaoYou, Stem::Ren, 53),
            (Si, QianYi, Stem::Gui, 63),
            (Wu, JiE, Stem::Jia, 73),
            (Wei, CaiBo, Stem::Yi, 83),
            (Shen, ZiNv, Stem::Bing, 93),
            (You, FuQi, Stem::Ding, 103),
            (Xu, XiongDi, Stem::Wu, 113),
            (Hai, Ming, Stem::Ji, 3),
            (Zi, FuMu, Stem::Geng, 13),
            (Chou, FuDe, Stem::Xin, 23),
        ],
        stars: [
            (ZiWei, Wu, None, None, None),
            (TianJi, Si, None, None, None),
            (TaiYang, Mao, Some(B), None, Some(B)),
            (WuQu, Yin, None, None, Some(B)),
            (TianTong, Chou, None, None, None),
            (LianZhen, Xu, None, None, None),
            (TianFu, Xu, None, None, None),
            (TaiYin, Hai, None, Some(C), None),
            (TanLang, Zi, None, None, None),
            (JuMen, Chou, Some(A), None, Some(A)),
            (TianXiang, Yin, None, None, None),
            (TianLiang, Mao, None, None, None),
            (QiSha, Chen, None, None, None),
            (PoJun, Shen, None, None, None),
            (ZuoFu, Yin, None, None, None),
            (YouBi, Zi, None, None, None),
            (WenChang, You, Some(D), Some(D), None),
            (WenQu, Si, Some(C), Some(D), None),
        ],
        second_decade: [
            FuDe, TianZhai, GuanLu, JiaoYou, QianYi, JiE, CaiBo, ZiNv, FuQi, XiongDi, Ming, FuMu,
        ],
        last_year: [
            CaiBo, ZiNv, FuQi, XiongDi, Ming, FuMu, FuDe, TianZhai, GuanLu, JiaoYou, QianYi, JiE,
        ],
        ages: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
        years: [1993, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002],
    });
}
