use serde_json::Value;
use ziwei::{
    Birth, BirthDay, BirthMonth, Branch, DecadeIndex, FiveElementBureau, Gender, PalaceName,
    Parameters, StarName, Stem, YearlyIndex, Ziwei, ZiweiError,
};

const CASE: &str = include_str!("../../../conformance/cases/jia-zi-fire-six.json");
const BUREAU_BOUNDARIES: [&str; 4] = [
    include_str!("../../../conformance/cases/bureau-day-one-water-two.json"),
    include_str!("../../../conformance/cases/bureau-day-one-wood-three.json"),
    include_str!("../../../conformance/cases/bureau-day-one-metal-four.json"),
    include_str!("../../../conformance/cases/bureau-day-one-earth-five.json"),
];
const WORKED_CHARTS: [&str; 2] = [
    include_str!("../../../conformance/cases/ding-mao-reverse-periods.json"),
    include_str!("../../../conformance/cases/xin-you-forward-periods.json"),
];
const INVALID_YEAR_CASE: &str =
    include_str!("../../../conformance/cases/reject-inconsistent-sexagenary-year.json");

#[test]
fn shared_jia_zi_fire_six_case_matches_independent_expectations() {
    let case: Value = serde_json::from_str(CASE).expect("共享 conformance case 必须是有效 JSON");
    assert_keys(
        &case,
        &[
            "id",
            "contractVersion",
            "scenario",
            "input",
            "expected",
            "queries",
            "provenance",
            "evidence",
        ],
    );
    assert_eq!(string(&case["id"]), "natal.jia-zi-fire-six.1984-01-06");
    assert_eq!(string(&case["contractVersion"]), "v1");
    assert_eq!(string(&case["scenario"]), "construct-chart");

    let input = &case["input"];
    assert_keys(
        input,
        &[
            "kind",
            "gender",
            "birthYear",
            "birthMonth",
            "birthDay",
            "birthHour",
        ],
    );
    assert_eq!(string(&input["kind"]), "Birth");
    let birth = Birth {
        gender: match string(&input["gender"]) {
            "Female" => Gender::Female,
            "Male" => Gender::Male,
            other => panic!("未知 gender case 身份：{other}"),
        },
        birth_year: integer(&input["birthYear"]),
        birth_month: BirthMonth::try_from(byte(&input["birthMonth"]))
            .expect("case 中的月份应符合公开值域"),
        birth_day: BirthDay::try_from(byte(&input["birthDay"]))
            .expect("case 中的日期应符合公开值域"),
        birth_hour: branch(string(&input["birthHour"])),
    };
    let natal = Ziwei::from_birth(birth).expect("共享 case 输入应能排盘");

    let expected = &case["expected"];
    assert_keys(
        expected,
        &[
            "yearPillar",
            "fiveElementBureau",
            "mingBranch",
            "shenBranch",
            "originBranch",
            "ziweiBranch",
            "tianfuBranch",
        ],
    );
    let year_pillar = &expected["yearPillar"];
    assert_keys(year_pillar, &["stem", "branch"]);
    assert_eq!(
        natal.profile().birth_stem(),
        stem(string(&year_pillar["stem"]))
    );
    assert_eq!(
        natal.profile().birth_branch(),
        branch(string(&year_pillar["branch"]))
    );
    assert_eq!(
        natal.five_element_bureau(),
        match string(&expected["fiveElementBureau"]) {
            "WaterTwo" => FiveElementBureau::WaterTwo,
            "WoodThree" => FiveElementBureau::WoodThree,
            "MetalFour" => FiveElementBureau::MetalFour,
            "EarthFive" => FiveElementBureau::EarthFive,
            "FireSix" => FiveElementBureau::FireSix,
            other => panic!("未知 fiveElementBureau case 身份：{other}"),
        }
    );
    assert_eq!(
        natal.ming_palace().branch(),
        branch(string(&expected["mingBranch"]))
    );
    assert_eq!(
        natal.shen_palace().branch(),
        branch(string(&expected["shenBranch"]))
    );
    assert_eq!(
        natal.origin_palace().branch(),
        branch(string(&expected["originBranch"]))
    );
    assert_eq!(
        natal.ziwei_palace().branch(),
        branch(string(&expected["ziweiBranch"]))
    );
    assert_eq!(
        natal.palace_by_star(StarName::TianFu).branch(),
        branch(string(&expected["tianfuBranch"]))
    );

    let queries = case["queries"]
        .as_array()
        .expect("共享 case queries 必须是数组");
    for query in queries {
        assert_keys(query, &["kind", "star", "expectedBranch"]);
        match string(&query["kind"]) {
            "star-branch" => {
                let name = star(string(&query["star"]));
                let actual = natal.palace_by_star(name).branch();
                assert_eq!(actual, branch(string(&query["expectedBranch"])));
            }
            other => panic!("Rust conformance consumer 不支持查询操作：{other}"),
        }
    }

    assert_eq!(
        case["evidence"]["independentOfImplementationOutput"],
        Value::Bool(true),
        "预期必须独立于被测实现输出推导"
    );
    assert!(matches!(
        string(&case["evidence"]["externalReview"]),
        "not-reviewed" | "reviewed"
    ));
}

#[test]
fn shared_day_one_cases_cover_the_other_four_bureaus() {
    for source in BUREAU_BOUNDARIES {
        let case: Value = serde_json::from_str(source).expect("共享 bureau case 必须是有效 JSON");
        assert_eq!(string(&case["contractVersion"]), "v1");
        assert_eq!(string(&case["scenario"]), "construct-chart");
        let input = &case["input"];
        let birth = Birth {
            gender: match string(&input["gender"]) {
                "Female" => Gender::Female,
                "Male" => Gender::Male,
                other => panic!("未知 gender case 身份：{other}"),
            },
            birth_year: integer(&input["birthYear"]),
            birth_month: BirthMonth::try_from(byte(&input["birthMonth"]))
                .expect("case 月份应符合公开值域"),
            birth_day: BirthDay::try_from(byte(&input["birthDay"]))
                .expect("case 日期应符合公开值域"),
            birth_hour: branch(string(&input["birthHour"])),
        };
        let natal = Ziwei::from_birth(birth).expect("共享 bureau case 输入应能排盘");
        let expected = &case["expected"];
        assert_eq!(
            natal.profile().birth_stem(),
            stem(string(&expected["yearPillar"]["stem"]))
        );
        assert_eq!(
            natal.profile().birth_branch(),
            branch(string(&expected["yearPillar"]["branch"]))
        );
        assert_eq!(
            natal.five_element_bureau(),
            match string(&expected["fiveElementBureau"]) {
                "WaterTwo" => FiveElementBureau::WaterTwo,
                "WoodThree" => FiveElementBureau::WoodThree,
                "MetalFour" => FiveElementBureau::MetalFour,
                "EarthFive" => FiveElementBureau::EarthFive,
                "FireSix" => FiveElementBureau::FireSix,
                other => panic!("未知 fiveElementBureau case 身份：{other}"),
            }
        );
        assert_eq!(
            natal.ming_palace().branch(),
            branch(string(&expected["mingBranch"]))
        );
        assert_eq!(
            natal.shen_palace().branch(),
            branch(string(&expected["shenBranch"]))
        );
        assert_eq!(
            natal.origin_palace().branch(),
            branch(string(&expected["originBranch"]))
        );
        assert_eq!(
            natal.ziwei_palace().branch(),
            branch(string(&expected["ziweiBranch"]))
        );
        assert_eq!(
            natal.palace_by_star(StarName::TianFu).branch(),
            branch(string(&expected["tianfuBranch"]))
        );
        for query in case["queries"].as_array().expect("queries 必须是数组") {
            assert_eq!(string(&query["kind"]), "star-branch");
            assert_eq!(
                natal.palace_by_star(star(string(&query["star"]))).branch(),
                branch(string(&query["expectedBranch"])),
                "case {} query {}",
                string(&case["id"]),
                string(&query["star"])
            );
        }
        assert_eq!(
            case["evidence"]["independentOfImplementationOutput"],
            Value::Bool(true)
        );
    }
}

#[test]
fn shared_worked_charts_cover_all_stars_and_period_boundaries() {
    for source in WORKED_CHARTS {
        let case: Value = serde_json::from_str(source).expect("完整手算 case 必须是有效 JSON");
        let input = &case["input"];
        let birth = Birth {
            gender: match string(&input["gender"]) {
                "Female" => Gender::Female,
                "Male" => Gender::Male,
                other => panic!("未知 gender case 身份：{other}"),
            },
            birth_year: integer(&input["birthYear"]),
            birth_month: BirthMonth::try_from(byte(&input["birthMonth"]))
                .expect("月份应在公开值域"),
            birth_day: BirthDay::try_from(byte(&input["birthDay"])).expect("日期应在公开值域"),
            birth_hour: branch(string(&input["birthHour"])),
        };
        let natal = Ziwei::from_birth(birth).expect("固定完整命例应能建盘");
        let expected = &case["expected"];
        assert_eq!(
            natal.profile().birth_stem(),
            stem(string(&expected["yearPillar"]["stem"]))
        );
        assert_eq!(
            natal.profile().birth_branch(),
            branch(string(&expected["yearPillar"]["branch"]))
        );
        assert_eq!(
            natal.five_element_bureau(),
            bureau(string(&expected["fiveElementBureau"]))
        );
        assert_eq!(
            natal.ming_palace().branch(),
            branch(string(&expected["mingBranch"]))
        );
        assert_eq!(
            natal.shen_palace().branch(),
            branch(string(&expected["shenBranch"]))
        );
        assert_eq!(
            natal.origin_palace().branch(),
            branch(string(&expected["originBranch"]))
        );
        assert_eq!(
            natal.ziwei_palace().branch(),
            branch(string(&expected["ziweiBranch"]))
        );
        assert_eq!(
            natal.palace_by_star(StarName::TianFu).branch(),
            branch(string(&expected["tianfuBranch"]))
        );
        for (palace, fact) in natal
            .palaces()
            .iter()
            .zip(expected["palaces"].as_array().expect("palaces 必须是数组"))
        {
            assert_eq!(palace.branch(), branch(string(&fact["branch"])));
            assert_eq!(palace.name(), palace_name(string(&fact["name"])));
            assert_eq!(palace.stem(), stem(string(&fact["stem"])));
            assert_eq!(palace.decade_age_range().start(), byte(&fact["ageStart"]));
            assert_eq!(palace.decade_age_range().end(), byte(&fact["ageEnd"]));
        }
        for query in case["queries"].as_array().expect("queries 必须是数组") {
            match string(&query["kind"]) {
                "star-branch" => {
                    assert_eq!(
                        natal.palace_by_star(star(string(&query["star"]))).branch(),
                        branch(string(&query["expectedBranch"])),
                        "case {} star {}",
                        string(&case["id"]),
                        string(&query["star"])
                    );
                }
                "period-boundary" => {
                    let decade_index = DecadeIndex::try_from(byte(&query["decadeIndex"]))
                        .expect("固定大限序号有效");
                    let yearly_index = YearlyIndex::try_from(byte(&query["yearlyIndex"]))
                        .expect("固定流年序号有效");
                    let decade_ming = branch(string(&query["decadeMingBranch"]));
                    let yearly_ming = branch(string(&query["yearlyMingBranch"]));
                    assert_eq!(
                        natal.decade_by_branch(decade_index, decade_ming).name(),
                        ziwei::PalaceName::Ming
                    );
                    assert_eq!(
                        natal
                            .yearly_by_branch(decade_index, yearly_index, yearly_ming)
                            .name(),
                        ziwei::PalaceName::Ming
                    );
                    let years = natal.decade_years(decade_index);
                    assert_eq!(years[0].age(), byte(&query["firstAge"]));
                    assert_eq!(years[9].age(), byte(&query["lastAge"]));
                    assert_eq!(
                        years[0].year(),
                        Some(i64::from(integer(&query["firstYear"])))
                    );
                    assert_eq!(
                        years[9].year(),
                        Some(i64::from(integer(&query["lastYear"])))
                    );
                }
                other => panic!("未知 query kind：{other}"),
            }
        }
    }
}

#[test]
fn shared_invalid_sexagenary_year_preserves_semantic_error_and_identity() {
    let case: Value = serde_json::from_str(INVALID_YEAR_CASE).expect("错误 case 必须是有效 JSON");
    assert_eq!(string(&case["scenario"]), "reject-input");
    let input = &case["input"];
    let expected = &case["expected"];
    let expected_stem = stem(string(&expected["stem"]));
    let expected_branch = branch(string(&expected["branch"]));
    let result = Parameters::new(
        Gender::Female,
        expected_stem,
        expected_branch,
        BirthMonth::try_from(byte(&input["birthMonth"])).expect("月份应在公开值域"),
        branch(string(&input["ziweiBranch"])),
        branch(string(&input["birthHour"])),
    );
    assert_eq!(
        result,
        Err(ZiweiError::InvalidSexagenaryYear {
            stem: expected_stem,
            branch: expected_branch
        })
    );
    assert_eq!(string(&expected["code"]), "INVALID_SEXAGENARY_YEAR");
}

fn bureau(value: &str) -> FiveElementBureau {
    match value {
        "WaterTwo" => FiveElementBureau::WaterTwo,
        "WoodThree" => FiveElementBureau::WoodThree,
        "MetalFour" => FiveElementBureau::MetalFour,
        "EarthFive" => FiveElementBureau::EarthFive,
        "FireSix" => FiveElementBureau::FireSix,
        other => panic!("未知 fiveElementBureau case 身份：{other}"),
    }
}

fn palace_name(value: &str) -> PalaceName {
    match value {
        "Ming" => PalaceName::Ming,
        "FuMu" => PalaceName::FuMu,
        "FuDe" => PalaceName::FuDe,
        "TianZhai" => PalaceName::TianZhai,
        "GuanLu" => PalaceName::GuanLu,
        "JiaoYou" => PalaceName::JiaoYou,
        "QianYi" => PalaceName::QianYi,
        "JiE" => PalaceName::JiE,
        "CaiBo" => PalaceName::CaiBo,
        "ZiNv" => PalaceName::ZiNv,
        "FuQi" => PalaceName::FuQi,
        "XiongDi" => PalaceName::XiongDi,
        other => panic!("未知 PalaceName case 身份：{other}"),
    }
}

fn assert_keys(value: &Value, expected: &[&str]) {
    let object = value.as_object().expect("case value 必须是对象");
    let actual = object
        .keys()
        .map(String::as_str)
        .collect::<std::collections::BTreeSet<_>>();
    let expected = expected
        .iter()
        .copied()
        .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(
        actual, expected,
        "case 的字段必须被显式消费；新增字段需更新 Rust consumer"
    );
}

fn string(value: &Value) -> &str {
    value.as_str().expect("case 字段必须是字符串")
}

fn integer(value: &Value) -> i32 {
    value
        .as_i64()
        .and_then(|value| i32::try_from(value).ok())
        .expect("case 字段必须是 i32 整数")
}

fn byte(value: &Value) -> u8 {
    u8::try_from(integer(value)).expect("case 字段必须在 u8 范围内")
}

fn branch(value: &str) -> Branch {
    match value {
        "Zi" => Branch::Zi,
        "Chou" => Branch::Chou,
        "Yin" => Branch::Yin,
        "Mao" => Branch::Mao,
        "Chen" => Branch::Chen,
        "Si" => Branch::Si,
        "Wu" => Branch::Wu,
        "Wei" => Branch::Wei,
        "Shen" => Branch::Shen,
        "You" => Branch::You,
        "Xu" => Branch::Xu,
        "Hai" => Branch::Hai,
        other => panic!("未知 branch case 身份：{other}"),
    }
}

fn stem(value: &str) -> Stem {
    match value {
        "Jia" => Stem::Jia,
        "Yi" => Stem::Yi,
        "Bing" => Stem::Bing,
        "Ding" => Stem::Ding,
        "Wu" => Stem::Wu,
        "Ji" => Stem::Ji,
        "Geng" => Stem::Geng,
        "Xin" => Stem::Xin,
        "Ren" => Stem::Ren,
        "Gui" => Stem::Gui,
        other => panic!("未知 stem case 身份：{other}"),
    }
}

fn star(value: &str) -> StarName {
    match value {
        "ZiWei" => StarName::ZiWei,
        "TianJi" => StarName::TianJi,
        "TaiYang" => StarName::TaiYang,
        "WuQu" => StarName::WuQu,
        "TianTong" => StarName::TianTong,
        "LianZhen" => StarName::LianZhen,
        "TianFu" => StarName::TianFu,
        "TaiYin" => StarName::TaiYin,
        "TanLang" => StarName::TanLang,
        "JuMen" => StarName::JuMen,
        "TianXiang" => StarName::TianXiang,
        "TianLiang" => StarName::TianLiang,
        "QiSha" => StarName::QiSha,
        "PoJun" => StarName::PoJun,
        "ZuoFu" => StarName::ZuoFu,
        "YouBi" => StarName::YouBi,
        "WenChang" => StarName::WenChang,
        "WenQu" => StarName::WenQu,
        other => panic!("未知 star case 身份：{other}"),
    }
}
