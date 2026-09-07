//! 独立于 construction-120 的混合输入与读取负载。
//! 宏让同一负载可在隔离实验中实例化为两个 crate，避免两份计时逻辑漂移。

macro_rules! define_workload {
    ($module:ident, $engine:ident) => {
        #[allow(dead_code, reason = "单版本运行器、配对实验与测试共享同一负载")]
        mod $module {
            use std::{fmt::Write, hint::black_box, time::Instant};
            use $engine as z;

            pub const ID: &str = "ziwei-read-path-512";
            pub const VERSION: u32 = 2;
            pub const SEED: u32 = 0x5a17_2026;
            pub const CASES: usize = 512;
            pub const ENTRIES: [&str; 18] = [
                "from_birth",
                "from_parameters",
                "retain_birth",
                "retain_parameters",
                "star",
                "palace_by_star",
                "palace_star",
                "birth_transformations",
                "self_transformations",
                "palace_transformations",
                "decade",
                "decade_years",
                "yearly",
                "names_hot",
                "names_mixed",
                "lifecycle_birth",
                "lifecycle_parameters",
                "palace_by_name",
            ];

            fn next(seed: &mut u32) -> u32 {
                *seed ^= *seed << 13;
                *seed ^= *seed >> 17;
                *seed ^= *seed << 5;
                *seed
            }

            fn repeat<'a, I, O>(
                items: &'a [I],
                repetitions: usize,
                mut operation: impl FnMut(&'a I) -> O,
            ) -> usize {
                for _ in 0..repetitions {
                    for item in black_box(items) {
                        let _ = black_box(operation(black_box(item)));
                    }
                }
                items.len() * repetitions
            }

            fn names(chart: &z::Natal) {
                for palace in chart.palaces() {
                    for star in palace.stars() {
                        black_box((
                            star.name_hans(),
                            star.name_hant(),
                            star.abbr_hans(),
                            star.abbr_hant(),
                        ));
                    }
                }
            }

            // 固定使用场景，不把几种操作混在一起后称为单个查询的延迟。
            fn read_chart(chart: &z::Natal) {
                names(chart);
                for star in z::StarName::ALL {
                    black_box(chart.star(black_box(star)));
                    black_box(chart.palace_by_star(black_box(star)));
                }
                black_box(chart.birth_transformations());
                for item in chart.self_transformations() {
                    black_box(item);
                }
                for branch in z::Branch::ALL {
                    black_box(chart.palace_transformations(black_box(branch)));
                }
            }

            /// 一次计时样本；完整批时长和实际操作数共同定义平均耗时。
            pub struct Measurement {
                pub batches: usize,
                pub operations: usize,
                pub elapsed_ns: u128,
            }

            pub struct Workload {
                births: [z::Birth; CASES],
                parameters: [z::Parameters; CASES],
                charts: Vec<z::Natal>,
                star_cases: Vec<(usize, z::StarName)>,
                palace_cases: Vec<(
                    usize,
                    z::Branch,
                    z::StarName,
                    z::DecadeIndex,
                    z::YearlyIndex,
                    z::PalaceName,
                )>,
            }

            impl Workload {
                pub fn new() -> Self {
                    let mut seed = SEED;
                    let births = std::array::from_fn(|i| z::Birth {
                        gender: if next(&mut seed).is_multiple_of(2) {
                            z::Gender::Female
                        } else {
                            z::Gender::Male
                        },
                        birth_year: match i {
                            0 => i32::MIN,
                            1 => i32::MAX,
                            2 => 0,
                            3 => -1000,
                            _ => 1984 + (next(&mut seed) % 120) as i32,
                        },
                        birth_month: z::BirthMonth::try_from(1 + (next(&mut seed) % 12) as u8)
                            .unwrap(),
                        birth_day: z::BirthDay::try_from(1 + (next(&mut seed) % 30) as u8).unwrap(),
                        birth_hour: z::Branch::ALL[(next(&mut seed) % 12) as usize],
                    });
                    let parameters = std::array::from_fn(|_| {
                        let year = (next(&mut seed) % 60) as usize;
                        z::Parameters::new(
                            if next(&mut seed).is_multiple_of(2) {
                                z::Gender::Male
                            } else {
                                z::Gender::Female
                            },
                            z::Stem::ALL[year % 10],
                            z::Branch::ALL[year % 12],
                            z::BirthMonth::try_from(1 + (next(&mut seed) % 12) as u8).unwrap(),
                            z::Branch::ALL[(next(&mut seed) % 12) as usize],
                            z::Branch::ALL[(next(&mut seed) % 12) as usize],
                        )
                        .unwrap()
                    });
                    let charts: Vec<_> = births
                        .iter()
                        .map(|&b| z::Ziwei::from_birth(b).unwrap())
                        .chain(
                            parameters
                                .iter()
                                .map(|&p| z::Ziwei::from_parameters(p).unwrap()),
                        )
                        .collect();
                    let mut star_cases: Vec<_> = (0..charts.len())
                        .flat_map(|i| z::StarName::ALL.map(|star| (i, star)))
                        .collect();
                    // 打散查找顺序，避免永远按宫位或星序命中。
                    for i in (1..star_cases.len()).rev() {
                        star_cases.swap(i, next(&mut seed) as usize % (i + 1));
                    }
                    let palace_cases = (0..charts.len())
                        .flat_map(|chart| {
                            (0..12).map(move |i| {
                                (
                                    chart,
                                    z::Branch::ALL[i],
                                    z::StarName::ALL[(chart + i) % 18],
                                    z::DecadeIndex::try_from(i as u8).unwrap(),
                                    z::YearlyIndex::try_from(((chart + i) % 10) as u8).unwrap(),
                                    z::PalaceName::ALL[i],
                                )
                            })
                        })
                        .collect();
                    Self {
                        births,
                        parameters,
                        charts,
                        star_cases,
                        palace_cases,
                    }
                }

                pub fn validate(&self) {
                    assert_eq!(self.charts.len(), CASES * 2);
                    assert_eq!(self.star_cases.len(), CASES * 2 * 18);
                    assert_eq!(self.palace_cases.len(), CASES * 2 * 12);
                    assert_eq!(self.births[0].birth_year, i32::MIN);
                    assert_eq!(self.births[1].birth_year, i32::MAX);
                    for chart in &self.charts {
                        assert_eq!(
                            chart
                                .palaces()
                                .iter()
                                .map(|p| p.stars().len())
                                .sum::<usize>(),
                            18
                        );
                        for name in z::StarName::ALL {
                            assert_eq!(chart.star(name).name(), name);
                            assert!(std::ptr::eq(
                                chart.palace_by_star(name).star(name).unwrap(),
                                chart.star(name)
                            ));
                        }
                        for (palace, star) in chart.birth_transformations() {
                            assert!(std::ptr::eq(palace.star(star.name()).unwrap(), star));
                            assert!(star.birth_transformation().is_some());
                        }
                        for (_, star) in chart.self_transformations() {
                            let t = star.self_transformations();
                            assert!(t.inward().is_some() || t.outward().is_some());
                        }
                    }
                    let hits = self
                        .palace_cases
                        .iter()
                        .filter(|&&(i, branch, star, _, _, _)| {
                            self.charts[i].palace(branch).star(star).is_some()
                        })
                        .count();
                    assert!(hits > 0 && hits < self.palace_cases.len());
                }

                /// 用完整值对照不同布局；不把 Debug 格式化计入运行时间。
                pub fn facts(&self) -> Vec<String> {
                    let mut facts: Vec<_> = self
                        .charts
                        .iter()
                        .map(|c| {
                            let mut s = format!(
                                "{c:?}|{:?}|{:?}",
                                c.birth_transformations(),
                                c.self_transformations().collect::<Vec<_>>()
                            );
                            for n in z::StarName::ALL {
                                write!(&mut s, "|{:?}|{:?}", c.star(n), c.palace_by_star(n))
                                    .unwrap();
                            }
                            s
                        })
                        .collect();
                    for &(i, branch, star, decade, yearly, name) in &self.palace_cases {
                        let c = &self.charts[i];
                        write!(
                            &mut facts[i],
                            "|{:?}|{:?}|{:?}|{:?}|{:?}|{:?}",
                            c.palace(branch).star(star),
                            c.palace_transformations(branch),
                            c.decade(decade),
                            c.decade_years(decade),
                            c.yearly(decade, yearly),
                            c.palace_by_name(name)
                        )
                        .unwrap();
                    }
                    facts
                }

                /// V2 仅延长两项高波动查询的计时批次；smoke 保持单批。
                pub fn measure(&self, entry: usize, smoke: bool) -> Measurement {
                    let batches = if !smoke
                        && matches!(ENTRIES[entry], "palace_star" | "self_transformations")
                    {
                        16
                    } else {
                        1
                    };
                    let start = Instant::now();
                    let mut operations = 0;
                    for _ in 0..batches {
                        operations += self.execute(entry);
                    }
                    let elapsed_ns = start.elapsed().as_nanos();
                    Measurement {
                        batches,
                        operations,
                        elapsed_ns,
                    }
                }

                /// 单位随 entry 明确为盘、查询或星；整个批次的准备规则固定。
                pub fn execute(&self, entry: usize) -> usize {
                    match entry {
                        0 => repeat(&self.births, 16, |&b| z::Ziwei::from_birth(b).unwrap()),
                        1 => repeat(&self.parameters, 16, |&p| {
                            z::Ziwei::from_parameters(p).unwrap()
                        }),
                        // 512 盘同时存活后统一销毁；包括外层 Vec 的申请与销毁。
                        2 | 3 => {
                            for _ in 0..16 {
                                let batch: Vec<_> = if entry == 2 {
                                    self.births
                                        .iter()
                                        .map(|&b| z::Ziwei::from_birth(black_box(b)).unwrap())
                                        .collect()
                                } else {
                                    self.parameters
                                        .iter()
                                        .map(|&p| z::Ziwei::from_parameters(black_box(p)).unwrap())
                                        .collect()
                                };
                                black_box(batch);
                            }
                            CASES * 16
                        }
                        4 => repeat(&self.star_cases, 2, |&(i, star)| {
                            black_box(&self.charts[i]).star(star)
                        }),
                        5 => repeat(&self.star_cases, 2, |&(i, star)| {
                            black_box(&self.charts[i]).palace_by_star(star)
                        }),
                        6 => repeat(&self.palace_cases, 4, |&(i, b, s, _, _, _)| {
                            black_box(black_box(&self.charts[i]).palace(b)).star(s)
                        }),
                        7 => repeat(&self.charts, 32, |c| c.birth_transformations()),
                        8 => repeat(&self.charts, 32, |c| {
                            for item in c.self_transformations() {
                                black_box(item);
                            }
                        }),
                        9 => repeat(&self.palace_cases, 4, |&(i, b, _, _, _, _)| {
                            black_box(&self.charts[i]).palace_transformations(b)
                        }),
                        10 => repeat(&self.palace_cases, 4, |&(i, _, _, d, _, _)| {
                            black_box(&self.charts[i]).decade(d)
                        }),
                        11 => repeat(&self.palace_cases, 4, |&(i, _, _, d, _, _)| {
                            black_box(&self.charts[i]).decade_years(d)
                        }),
                        12 => repeat(&self.palace_cases, 4, |&(i, _, _, d, y, _)| {
                            black_box(&self.charts[i]).yearly(d, y)
                        }),
                        13 => repeat(&self.charts[..1], CASES * 2 * 8, names) * 18,
                        14 => repeat(&self.charts, 8, names) * 18,
                        15 => repeat(&self.births, 4, |&b| {
                            let c = z::Ziwei::from_birth(b).unwrap();
                            read_chart(black_box(&c));
                            black_box(c);
                        }),
                        16 => repeat(&self.parameters, 4, |&p| {
                            let c = z::Ziwei::from_parameters(p).unwrap();
                            read_chart(black_box(&c));
                            black_box(c);
                        }),
                        17 => repeat(&self.palace_cases, 4, |&(i, _, _, _, _, name)| {
                            black_box(&self.charts[i]).palace_by_name(name)
                        }),
                        _ => panic!("未知负载编号"),
                    }
                }

                /// 单独进程测量峰值 RSS 时使用；计时模式不调用。
                pub fn hold_many(&self, count: usize) {
                    let charts: Vec<_> = (0..count)
                        .map(|i| z::Ziwei::from_birth(self.births[i % CASES]).unwrap())
                        .collect();
                    println!(
                        "retained,{count},Star={},Palace={},Natal={}",
                        std::mem::size_of::<z::Star>(),
                        std::mem::size_of::<z::Palace>(),
                        std::mem::size_of::<z::Natal>()
                    );
                    black_box(charts);
                }
            }
        }
    };
}

pub(crate) use define_workload;
