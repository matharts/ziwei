use ziwei::{
    Birth, BirthDay, BirthMonth, Branch, Gender, Natal, Parameters, StarName, Stem, Transformation,
    Ziwei,
};

fn jia_zi_charts() -> [Natal; 2] {
    // fixtures/README.md 的甲子火六局完整手算例：初六紫微在寅。
    let birth_month = BirthMonth::try_from(1).unwrap();
    [
        Ziwei::from_birth(Birth {
            gender: Gender::Male,
            birth_year: 1984,
            birth_month,
            birth_day: BirthDay::try_from(6).unwrap(),
            birth_hour: Branch::Zi,
        })
        .unwrap(),
        Ziwei::from_parameters(
            Parameters::new(
                Gender::Male,
                Stem::Jia,
                Branch::Zi,
                birth_month,
                Branch::Yin,
                Branch::Zi,
            )
            .unwrap(),
        )
        .unwrap(),
    ]
}

#[test]
fn single_transformation_matches_hand_derived_relations_for_both_inputs() {
    use Branch::{Chen, Hai, Shen, Wei, Wu, Xu, Yin, Zi};
    use StarName::{LianZhen, PoJun, TaiYang, TianLiang, WuQu, ZiWei, ZuoFu};
    use Transformation::{A, B, C, D};

    // fixtures/README.md 与 jia_zi_fire_six.csv 的甲子火六局静态星位；
    // 宫干由五虎遁手算为申宫壬、戌宫甲，再按 D-216、D-217 逐化象查表。
    // 预期不读取批量四化查询，也不使用生产四化常量生成。
    let expected = [
        (Shen, A, Wei, TianLiang),
        (Shen, B, Yin, ZiWei),
        (Shen, C, Chen, ZuoFu), // 项目壬干化科为左辅。
        (Shen, D, Xu, WuQu),
        (Xu, A, Wu, LianZhen),
        (Xu, B, Zi, PoJun),
        (Xu, C, Xu, WuQu), // 戌宫甲干使本宫武曲化科，同宫关系必须保留。
        (Xu, D, Hai, TaiYang),
    ];

    for natal in jia_zi_charts() {
        let before = natal.clone();
        for (source, kind, target, star) in expected {
            let relation = natal.palace_transformation(source, kind);
            assert_eq!(
                (
                    relation.source_branch(),
                    relation.transformation(),
                    relation.target_branch(),
                    relation.star(),
                ),
                (source, kind, target, star),
            );
            assert_eq!(natal.palace_transformation(source, kind), relation);
        }
        assert_eq!(natal, before);
    }
}

#[test]
fn incoming_transformations_match_hand_derived_relations_for_both_inputs() {
    use Branch::{Chen, Shen, Si, Wei, Wu, Xu, Yin, You, Zi};
    use StarName::{TanLang, WenChang, WenQu, WuQu, YouBi, ZuoFu};
    use Transformation::{A, B, C, D};

    // 依据 fixtures/jia_zi_fire_six.csv 的静态星位与 README.md 的五虎遁宫干，
    // 逐干套用 D-216、D-217 的十干四化表手算；预期不读取被测查询或生产常量。
    // 戌有武曲、右弼、文昌；辰有贪狼、左辅、文曲。
    let expected_xu = [
        (Yin, C, WenChang), // 丙干文昌科。
        (Chen, C, YouBi),   // 戊干右弼科。
        (Si, A, WuQu),      // 己干武曲禄。
        (Wu, B, WuQu),      // 庚干武曲权。
        (Wei, D, WenChang),
        (Shen, D, WuQu),
        (Xu, C, WuQu), // 甲干武曲科，同宫关系保留。
        (Zi, C, WenChang),
    ];
    let expected_chen = [
        (Chen, A, TanLang),
        (Si, B, TanLang),
        (Si, D, WenQu), // 己干两条关系同时落辰，仍按 B、D 返回。
        (Wei, C, WenQu),
        (Shen, C, ZuoFu), // 项目壬干化科固定为左辅。
        (You, D, TanLang),
    ];

    for natal in jia_zi_charts() {
        let before = natal.clone();
        for (target, expected) in [(Xu, expected_xu.as_slice()), (Chen, &expected_chen)] {
            let relations: Vec<_> = natal.palace_transformation_sources(target).collect();
            assert!(
                relations
                    .iter()
                    .all(|relation| relation.target_branch() == target)
            );
            let actual: Vec<_> = relations
                .iter()
                .map(|relation| {
                    (
                        relation.source_branch(),
                        relation.transformation(),
                        relation.star(),
                    )
                })
                .collect();
            assert_eq!(actual, expected);
            assert_eq!(
                natal
                    .palace_transformation_sources(target)
                    .collect::<Vec<_>>(),
                relations
            );
        }
        // 申有七杀，但七杀不参与十干四化；非空宫也可以没有入宫关系。
        assert_eq!(natal.palace(Shen).stars().len(), 1);
        assert_eq!(natal.palace(Shen).stars()[0].name(), StarName::QiSha);
        assert!(natal.palace_transformation_sources(Shen).next().is_none());
        assert_eq!(natal, before);
    }
}

#[test]
fn empty_target_palace_has_no_incoming_transformations_for_both_inputs() {
    // fixtures/README.md 的壬申女命手算例：八月十七日卯时，紫微在酉，寅宫为空。
    let birth_month = BirthMonth::try_from(8).unwrap();
    let birth = Ziwei::from_birth(Birth {
        gender: Gender::Female,
        birth_year: 1992,
        birth_month,
        birth_day: BirthDay::try_from(17).unwrap(),
        birth_hour: Branch::Mao,
    })
    .unwrap();
    let parameters = Ziwei::from_parameters(
        Parameters::new(
            Gender::Female,
            Stem::Ren,
            Branch::Shen,
            birth_month,
            Branch::You,
            Branch::Mao,
        )
        .unwrap(),
    )
    .unwrap();

    for natal in [birth, parameters] {
        assert!(natal.palace(Branch::Yin).stars().is_empty());
        assert!(
            natal
                .palace_transformation_sources(Branch::Yin)
                .next()
                .is_none()
        );
    }
}

#[test]
fn incoming_transformations_partition_all_48_relations_for_both_inputs() {
    // 一致性证据：覆盖十种生年干、十二个月、十二时辰、两入口及所有源宫/目标宫。
    // 复用命盘样本，同时验证单项查询的全部宫位/化象与批量查询一致。
    // Parameters 另覆盖全部十二种紫微落宫；独立规则预期见上面的固定命例。
    for year_offset in 0..10 {
        for month in 1..=12 {
            for hour in Branch::ALL {
                let birth_month = BirthMonth::try_from(month).unwrap();
                let birth = Ziwei::from_birth(Birth {
                    gender: Gender::Female,
                    birth_year: 1984 + year_offset,
                    birth_month,
                    birth_day: BirthDay::try_from(1 + hour.index()).unwrap(),
                    birth_hour: hour,
                })
                .unwrap();
                let parameters = Ziwei::from_parameters(
                    Parameters::new(
                        Gender::Male,
                        birth.profile().birth_stem(),
                        birth.profile().birth_branch(),
                        birth_month,
                        hour,
                        hour,
                    )
                    .unwrap(),
                )
                .unwrap();

                for natal in [birth, parameters] {
                    let before = natal.clone();
                    for source in Branch::ALL {
                        for (kind, expected) in Transformation::ALL
                            .into_iter()
                            .zip(natal.palace_transformations(source))
                        {
                            assert_eq!(natal.palace_transformation(source, kind), expected);
                        }
                    }
                    let mut relation_count = 0;
                    for target in Branch::ALL {
                        // 源序直接取已公开的十二宫顺序，避免复算反查内部索引。
                        let expected: Vec<_> = natal
                            .palaces()
                            .iter()
                            .flat_map(|palace| natal.palace_transformations(palace.branch()))
                            .filter(|relation| relation.target_branch() == target)
                            .collect();
                        let actual: Vec<_> = natal.palace_transformation_sources(target).collect();
                        assert_eq!(actual, expected);
                        relation_count += actual.len();
                    }
                    assert_eq!(relation_count, 48);
                    assert_eq!(natal, before);
                }
            }
        }
    }
}
