use ziwei::{
    Birth, BirthDay, BirthMonth, Branch, DecadeIndex, FiveElementBureau, Gender, Natal, Parameters,
    Stem, Ziwei,
};

fn chart_pair(
    birth_year: i32,
    stem: Stem,
    branch: Branch,
    ziwei_branch: Branch,
    gender: Gender,
) -> [Natal; 2] {
    // fixtures/README.md 的五局初一锚点：正月子时，命宫在寅。
    let birth_month = BirthMonth::try_from(1).unwrap();
    [
        Ziwei::from_birth(Birth {
            gender,
            birth_year,
            birth_month,
            birth_day: BirthDay::try_from(1).unwrap(),
            birth_hour: Branch::Zi,
        })
        .unwrap(),
        Ziwei::from_parameters(
            Parameters::new(gender, stem, branch, birth_month, ziwei_branch, Branch::Zi).unwrap(),
        )
        .unwrap(),
    ]
}

#[test]
fn age_queries_cover_five_bureaus_all_u8_inputs_and_both_creation_paths() {
    use FiveElementBureau::{EarthFive, FireSix, MetalFour, WaterTwo, WoodThree};

    // 项目固定五行局与十二个十年期间，逐项写出边界，不从生产公式生成预期。
    // 年龄列：零岁、起限前一年、首年、第一限末年、第二限首年、末年、超出一年、255。
    let cases = [
        (
            1984,
            Stem::Jia,
            Branch::Zi,
            Branch::You,
            FireSix,
            [0, 5, 6, 15, 16, 125, 126, 255],
        ),
        (
            1985,
            Stem::Yi,
            Branch::Chou,
            Branch::Wu,
            EarthFive,
            [0, 4, 5, 14, 15, 124, 125, 255],
        ),
        (
            1986,
            Stem::Bing,
            Branch::Yin,
            Branch::Chen,
            WoodThree,
            [0, 2, 3, 12, 13, 122, 123, 255],
        ),
        (
            1987,
            Stem::Ding,
            Branch::Mao,
            Branch::Hai,
            MetalFour,
            [0, 3, 4, 13, 14, 123, 124, 255],
        ),
        (
            1988,
            Stem::Wu,
            Branch::Chen,
            Branch::Chou,
            WaterTwo,
            [0, 1, 2, 11, 12, 121, 122, 255],
        ),
    ];
    let boundary_indices = [
        None,
        None,
        Some((0, 0)),
        Some((0, 9)),
        Some((1, 0)),
        Some((11, 9)),
        None,
        None,
    ];

    // 阳男、阳女、阴男、阴女均覆盖；Parameters 无数字出生年份，仍取相同期间。
    for (year, stem, branch, ziwei_branch, bureau, boundary_ages) in cases {
        for gender in [Gender::Male, Gender::Female] {
            for natal in chart_pair(year, stem, branch, ziwei_branch, gender) {
                let before = natal.clone();
                assert_eq!(natal.five_element_bureau(), bureau);
                for (age, expected) in boundary_ages.into_iter().zip(boundary_indices) {
                    let actual = natal
                        .period_indices_at_age(age)
                        .map(|(decade, yearly)| (decade.get(), yearly.get()));
                    assert_eq!(actual, expected, "{bureau:?}, {gender:?}, age={age}");
                }
                // 已确认的火六局虚岁 35 锚点，位于第三大限末年。
                if bureau == FireSix {
                    assert_eq!(
                        natal
                            .period_indices_at_age(35)
                            .map(|(d, y)| (d.get(), y.get())),
                        Some((2, 9))
                    );
                }

                // 另以现有年度摘要建立年龄到期间的映射，验证全部 u8 输入。
                // 不重复除法/取余实现；摘要之外保持 None，不能饱和或循环到有效期间。
                let mut expected_by_age = [None; 256];
                for index in 0..12 {
                    let decade = DecadeIndex::try_from(index).unwrap();
                    for (yearly, summary) in natal.decade_years(decade).into_iter().enumerate() {
                        let slot = &mut expected_by_age[usize::from(summary.age())];
                        assert!(slot.is_none(), "不同期间不能占用同一虚岁");
                        *slot = Some((decade.get(), yearly as u8));
                    }
                }
                for age in u8::MIN..=u8::MAX {
                    let indices = natal.period_indices_at_age(age);
                    let actual = indices.map(|(decade, yearly)| (decade.get(), yearly.get()));
                    assert_eq!(
                        actual,
                        expected_by_age[usize::from(age)],
                        "{bureau:?}, {gender:?}, age={age}"
                    );
                    assert_eq!(natal.period_indices_at_age(age), indices);
                }
                assert_eq!(natal, before);
            }
        }
    }
}

#[test]
fn opposite_queries_follow_six_explicit_pairs_and_borrow_each_charts_own_palace() {
    // CONTEXT.md：对宫相隔六宫。显式列出六对，避免复用地支索引或偏移公式。
    let pairs = [
        (Branch::Zi, Branch::Wu),
        (Branch::Chou, Branch::Wei),
        (Branch::Yin, Branch::Shen),
        (Branch::Mao, Branch::You),
        (Branch::Chen, Branch::Xu),
        (Branch::Si, Branch::Hai),
    ];
    for original in chart_pair(1984, Stem::Jia, Branch::Zi, Branch::You, Gender::Male) {
        let before = original.clone();
        let moved_clone = Box::new(original.clone());
        for natal in [&original, moved_clone.as_ref()] {
            for (left, right) in pairs {
                for (branch, opposite_branch) in [(left, right), (right, left)] {
                    let palace = natal.palace(branch);
                    let opposite = natal.opposite_palace(branch);
                    assert_eq!(opposite.branch(), opposite_branch);
                    assert!(core::ptr::eq(opposite, natal.palace(opposite_branch)));
                    assert!(core::ptr::eq(
                        natal.opposite_palace(opposite.branch()),
                        palace
                    ));
                    assert!(core::ptr::eq(natal.opposite_palace(branch), opposite));
                }
                assert!(!core::ptr::eq(
                    original.opposite_palace(left),
                    moved_clone.opposite_palace(left)
                ));
            }
            assert_eq!(natal, &before);
        }
    }
}
