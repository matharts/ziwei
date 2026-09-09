use ziwei::{Birth, BirthDay, BirthMonth, Branch, Gender, Natal, Palace, Parameters, Stem, Ziwei};

fn chart_pair() -> [Natal; 2] {
    // fixtures/README.md 的甲子火六局手算命例：正月初六子时，紫微在寅。
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

fn assert_borrowed_sequence<'a>(
    natal: &'a Natal,
    mut palaces: impl ExactSizeIterator<Item = &'a Palace>,
    expected: &[Branch],
) {
    // 泛型约束同时验证公开返回类型确实提供 ExactSizeIterator 合同。
    for (index, &branch) in expected.iter().enumerate() {
        let remaining = expected.len() - index;
        assert_eq!(palaces.len(), remaining);
        assert_eq!(palaces.size_hint(), (remaining, Some(remaining)));
        let palace = palaces.next().expect("预期宫位必须存在");
        assert_eq!(palace.branch(), branch);
        assert_eq!(palace, natal.palace(branch));
        assert!(core::ptr::eq(palace, natal.palace(branch)));
    }
    assert_eq!(palaces.len(), 0);
    assert_eq!(palaces.size_hint(), (0, Some(0)));
    assert!(palaces.next().is_none());
}

#[test]
fn sanfang_and_sizheng_follow_explicit_order_and_borrow_the_current_chart() {
    use Branch::{Chen, Chou, Hai, Mao, Shen, Si, Wei, Wu, Xu, Yin, You, Zi};

    // 本轮确认的项目查询合同：四正依次为本宫、两个三合宫、对宫。
    // 三方 false 去掉首项本宫，true 保留四项；名称及顺序不推广为其他流派规则。
    // 十二组预期逐项写明，不用 Branch::index、ALL 或生产偏移公式推导。
    let cases = [
        (Zi, [Zi, Chen, Shen, Wu]),
        (Chou, [Chou, Si, You, Wei]),
        (Yin, [Yin, Wu, Xu, Shen]),
        (Mao, [Mao, Wei, Hai, You]),
        (Chen, [Chen, Shen, Zi, Xu]),
        (Si, [Si, You, Chou, Hai]),
        (Wu, [Wu, Xu, Yin, Zi]),
        (Wei, [Wei, Hai, Mao, Chou]),
        (Shen, [Shen, Zi, Chen, Yin]),
        (You, [You, Chou, Si, Mao]),
        (Xu, [Xu, Yin, Wu, Chen]),
        (Hai, [Hai, Mao, Wei, Si]),
    ];

    for original in chart_pair() {
        let before = original.clone();
        let moved_clone = Box::new(original.clone());
        for natal in [&original, moved_clone.as_ref()] {
            for (branch, expected) in cases {
                let sizheng: [&Palace; 4] = natal.sizheng_palaces(branch);
                assert_eq!(sizheng.map(Palace::branch), expected);
                assert!(core::ptr::eq(sizheng[0], natal.palace(branch)));
                assert!(core::ptr::eq(sizheng[3], natal.opposite_palace(branch)));
                for (index, palace) in sizheng.iter().enumerate() {
                    assert!(core::ptr::eq(*palace, natal.palace(expected[index])));
                    for other in &sizheng[index + 1..] {
                        assert_ne!(palace.branch(), other.branch());
                        assert!(!core::ptr::eq(*palace, *other));
                    }
                }
                assert_borrowed_sequence(
                    natal,
                    natal.sanfang_palaces(branch, false),
                    &expected[1..],
                );
                assert_borrowed_sequence(natal, natal.sanfang_palaces(branch, true), &expected);

                // 两个入口均验证三方与四正返回同一批对象，而非仅有相同的宫位值。
                for (include_self, expected_palaces) in
                    [(false, &sizheng[1..]), (true, &sizheng[..])]
                {
                    for (palace, expected_palace) in natal
                        .sanfang_palaces(branch, include_self)
                        .zip(expected_palaces)
                    {
                        assert!(core::ptr::eq(palace, *expected_palace));
                    }
                }
            }
            assert_eq!(natal, &before);
        }

        // 克隆后移入另一个所有者；查询仍借用各自存储，不沿用原命盘的地址。
        for (branch, _) in cases {
            for (palace, cloned_palace) in original
                .sizheng_palaces(branch)
                .into_iter()
                .zip(moved_clone.sizheng_palaces(branch))
            {
                assert_eq!(palace, cloned_palace);
                assert!(!core::ptr::eq(palace, cloned_palace));
            }
            for include_self in [false, true] {
                for (palace, cloned_palace) in original
                    .sanfang_palaces(branch, include_self)
                    .zip(moved_clone.sanfang_palaces(branch, include_self))
                {
                    assert_eq!(palace, cloned_palace);
                    assert!(!core::ptr::eq(palace, cloned_palace));
                }
            }
        }
    }
}
