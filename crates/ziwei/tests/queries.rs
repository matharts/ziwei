use ziwei::{
    Birth, BirthDay, BirthMonth, Branch, Gender, PalaceName, Parameters, StarName, Stem,
    Transformation, Ziwei,
};

#[test]
fn all_star_placements_have_at_most_six_stars_in_one_palace() {
    // 星曜落宫只由紫微支、月份和时辰决定；穷尽 12 × 12 × 12 种组合。
    // 验证公开可见的真实星数，不访问 ArrayVec 或私有容量常量。
    let mut largest_palace = 0;
    for month in 1..=12 {
        for hour in Branch::ALL {
            for ziwei_branch in Branch::ALL {
                let natal = Ziwei::from_parameters(
                    Parameters::new(
                        Gender::Male,
                        Stem::Jia,
                        Branch::Zi,
                        BirthMonth::try_from(month).unwrap(),
                        ziwei_branch,
                        hour,
                    )
                    .unwrap(),
                )
                .unwrap();
                for palace in natal.palaces() {
                    largest_palace = largest_palace.max(palace.stars().len());
                }
            }
        }
    }
    assert_eq!(largest_palace, 6);
}

#[test]
fn cloned_and_moved_charts_borrow_stars_from_their_own_storage() {
    // 两种创建入口、十二月、十二时辰和十二个直接紫微位置。
    // 预期来自实际宫内切片，不依赖查询使用何种索引或容器。
    for month in 1..=12 {
        for hour in Branch::ALL {
            for ziwei_branch in Branch::ALL {
                let birth_month = BirthMonth::try_from(month).unwrap();
                let birth = Ziwei::from_birth(Birth {
                    gender: Gender::Female,
                    birth_year: 1984 + i32::from(ziwei_branch.index()),
                    birth_month,
                    birth_day: BirthDay::try_from(1 + (month + hour.index()) % 30).unwrap(),
                    birth_hour: hour,
                })
                .unwrap();
                let parameters = Ziwei::from_parameters(
                    Parameters::new(
                        Gender::Male,
                        Stem::Ren,
                        Branch::Shen,
                        birth_month,
                        ziwei_branch,
                        hour,
                    )
                    .unwrap(),
                )
                .unwrap();

                for original in [birth, parameters] {
                    let expected = original.clone();
                    // 移入新的所有者，再释放原始对象；查询不得依赖其地址。
                    let moved = Box::new(original.clone());
                    drop(original);
                    assert_eq!(*moved, expected);
                    for palace in moved.palaces() {
                        for star in palace.stars() {
                            assert!(std::ptr::eq(moved.star(star.name()), star));
                            assert!(std::ptr::eq(moved.palace_by_star(star.name()), palace));
                            assert!(!std::ptr::eq(
                                moved.star(star.name()),
                                expected.star(star.name())
                            ));
                        }
                    }
                    for (palace, star) in moved.birth_transformations() {
                        assert!(std::ptr::eq(palace.star(star.name()).unwrap(), star));
                        assert!(std::ptr::eq(moved.palace(palace.branch()), palace));
                    }
                }
            }
        }
    }
}

#[test]
fn palace_by_name_borrows_the_original_palace_for_every_ming_position() {
    // 项目固定宫序与 D-134：两种入口、十二命宫位置、十二宫职，共 288 次查询。
    // 子时的命宫随月份从寅顺行至丑；查询预期独立扫描已构建的宫位，不复算索引。
    let ming_branches = [
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
    for (month, ming_branch) in (1..=12).zip(ming_branches) {
        let birth_month = BirthMonth::try_from(month).unwrap();
        let from_birth = Ziwei::from_birth(Birth {
            gender: Gender::Female,
            birth_year: 1984,
            birth_month,
            birth_day: BirthDay::try_from(15).unwrap(),
            birth_hour: Branch::Zi,
        })
        .unwrap();
        let from_parameters = Ziwei::from_parameters(
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
        .unwrap();

        for natal in [from_birth, from_parameters] {
            assert_eq!(natal.ming_palace().branch(), ming_branch);
            let before = natal.clone();
            for name in PalaceName::ALL {
                let expected = natal
                    .palaces()
                    .iter()
                    .find(|palace| palace.name() == name)
                    .unwrap();
                let actual = natal.palace_by_name(name);
                assert!(std::ptr::eq(actual, expected));
                assert_eq!(actual.name(), name);
            }
            assert_eq!(natal, before);
        }
    }
}

#[test]
fn queries_borrow_the_original_stars_and_keep_all_transformation_facts() {
    // Independent query oracle: traverse the original palace/star fields, not another query.
    // Exercise all stems, twelve Ziwei placements, months and hours (17,280 charts).
    for stem in Stem::ALL {
        let birth_branch = if stem.index().is_multiple_of(2) {
            Branch::Zi
        } else {
            Branch::Chou
        };
        for ziwei_branch in Branch::ALL {
            for month in 1..=12 {
                for hour in Branch::ALL {
                    let natal = Ziwei::from_parameters(
                        Parameters::new(
                            Gender::Female,
                            stem,
                            birth_branch,
                            BirthMonth::try_from(month).unwrap(),
                            ziwei_branch,
                            hour,
                        )
                        .unwrap(),
                    )
                    .unwrap();
                    let before = natal.clone();
                    for palace in natal.palaces() {
                        for star in palace.stars() {
                            assert!(std::ptr::eq(star, natal.star(star.name())));
                            assert!(std::ptr::eq(palace, natal.palace_by_star(star.name())));
                        }
                    }
                    for (transformation, (palace, star)) in Transformation::ALL
                        .into_iter()
                        .zip(natal.birth_transformations())
                    {
                        assert_eq!(star.birth_transformation(), Some(transformation));
                        assert!(std::ptr::eq(palace.star(star.name()).unwrap(), star));
                    }
                    let expected: Vec<_> = natal
                        .palaces()
                        .iter()
                        .flat_map(|palace| {
                            palace.stars().iter().filter_map(move |star| {
                                let value = star.self_transformations();
                                if value.inward().is_none() && value.outward().is_none() {
                                    None
                                } else {
                                    Some((palace, star))
                                }
                            })
                        })
                        .collect();
                    let actual: Vec<_> = natal.self_transformations().collect();
                    assert_eq!(actual, expected);
                    for ((p1, s1), (p2, s2)) in actual.into_iter().zip(expected) {
                        assert!(std::ptr::eq(p1, p2));
                        assert!(std::ptr::eq(s1, s2));
                    }
                    assert_eq!(natal, before);
                }
            }
        }
    }
}

#[test]
fn ren_birth_ke_is_zuofu_and_two_self_directions_stay_on_one_star() {
    // Project rule D-030 / fixed chart D-223, not a claim about other traditions.
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
    assert_eq!(
        natal.birth_transformations().map(|(_, star)| star.name()),
        [
            StarName::TianLiang,
            StarName::ZiWei,
            StarName::ZuoFu,
            StarName::WuQu,
        ]
    );
    let matches: Vec<_> = natal
        .self_transformations()
        .filter(|(_, star)| star.name() == StarName::TanLang)
        .collect();
    assert_eq!(matches.len(), 1);
    let (palace, star) = matches[0];
    assert_eq!(palace.branch(), Branch::You);
    assert_eq!(
        star.self_transformations().inward(),
        Some(Transformation::D)
    );
    assert_eq!(
        star.self_transformations().outward(),
        Some(Transformation::B)
    );
}

#[test]
fn palace_transformations_cover_ten_stems_and_twelve_ziwei_positions() {
    use StarName::*;
    // Static oracle from the project's ten-stem rule, including Ren C = ZuoFu.
    // 120 input layouts x 12 source palaces x 4 transformations = 5,760 relations.
    let targets = [
        [LianZhen, PoJun, WuQu, TaiYang],
        [TianJi, TianLiang, ZiWei, TaiYin],
        [TianTong, TianJi, WenChang, LianZhen],
        [TaiYin, TianTong, TianJi, JuMen],
        [TanLang, TaiYin, YouBi, TianJi],
        [WuQu, TanLang, TianLiang, WenQu],
        [TaiYang, WuQu, TaiYin, TianTong],
        [JuMen, TaiYang, WenQu, WenChang],
        [TianLiang, ZiWei, ZuoFu, WuQu],
        [PoJun, JuMen, TaiYin, TanLang],
    ];
    let mut covered = [false; 3];
    for (i, stem) in Stem::ALL.into_iter().enumerate() {
        for ziwei_branch in Branch::ALL {
            let natal = Ziwei::from_parameters(
                Parameters::new(
                    Gender::Male,
                    stem,
                    Branch::ALL[i],
                    BirthMonth::try_from(8).unwrap(),
                    ziwei_branch,
                    Branch::Mao,
                )
                .unwrap(),
            )
            .unwrap();
            let before = natal.clone();
            for source in natal.palaces() {
                let relations: [ziwei::PalaceTransformation; 4] =
                    natal.palace_transformations(source.branch());
                assert_eq!(relations, natal.palace_transformations(source.branch()));
                for (j, relation) in relations.into_iter().enumerate() {
                    let star_name = targets[usize::from(source.stem().index())][j];
                    let target = natal
                        .palaces()
                        .iter()
                        .find(|p| p.star(star_name).is_some())
                        .unwrap();
                    assert_eq!(relation.source_branch(), source.branch());
                    assert_eq!(relation.target_branch(), target.branch());
                    assert_eq!(relation.transformation(), Transformation::ALL[j]);
                    assert_eq!(relation.star(), star_name);
                    let star = target.star(star_name).unwrap();
                    if target.branch() == source.branch() {
                        assert_eq!(
                            star.self_transformations().outward(),
                            Some(relation.transformation())
                        );
                        covered[0] = true;
                    } else if (source.branch().index() + 6) % 12 == target.branch().index() {
                        assert_eq!(
                            star.self_transformations().inward(),
                            Some(relation.transformation())
                        );
                        covered[1] = true;
                    } else {
                        covered[2] = true;
                    }
                }
            }
            assert_eq!(natal, before);
        }
    }
    assert_eq!(covered, [true; 3]);
}
