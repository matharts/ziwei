use serde_json::{Value, json};
use ziwei_xtask::benchmark::Suite;
use ziwei_xtask::benchmark::{read_sampling, summary};

#[test]
fn statistics_preserve_median_and_nearest_rank_p95() {
    let statistics = summary(&[3.0, 1.0, 2.0]).unwrap();
    assert_eq!(statistics.median_ns, 2.0);
    assert_eq!(
        statistics.to_json(),
        json!({"median_ns": 2.0, "p95_ns": 3.0, "min_ns": 1.0, "max_ns": 3.0})
    );
    assert_eq!(summary(&[1.0, 2.0]).unwrap().median_ns, 1.5);
    let values: Vec<_> = (1..=20).map(f64::from).collect();
    assert_eq!(summary(&values).unwrap().p95_ns, 19.0);
    for values in [
        vec![],
        vec![0.0],
        vec![-1.0],
        vec![f64::NAN],
        vec![f64::INFINITY],
    ] {
        assert!(summary(&values).is_err());
    }
}

#[test]
fn construction_csv_rejects_wrong_identity_missing_duplicate_and_invalid_samples() {
    let valid =
        "suite,ziwei-construction-120,1,120\nsample,from_birth,0,10\nsample,from_parameters,0,12";
    assert_eq!(
        Suite::Construction.parse(valid, 1, 1, true).unwrap().rounds[0]["from_birth"],
        [10.0]
    );
    for invalid in [
        valid.replace(",1,120", ",2,120"),
        valid.replace(",0,10", ",1,10"),
        valid.replace(",0,10", ",0,NaN"),
        format!("{valid}\nsample,from_birth,0,10"),
        valid.replace("from_parameters", "unknown"),
        "suite,ziwei-construction-120,1,120".into(),
    ] {
        assert!(
            Suite::Construction.parse(&invalid, 1, 1, true).is_err(),
            "{invalid}"
        );
    }
}

fn read_csv(rounds: usize, samples: usize) -> String {
    let entries = Suite::Read.entries();
    let mut csv = String::from("suite,ziwei-read-path-512,2,512,1511464998\n");
    for round in 0..rounds {
        for offset in 0..entries.len() {
            let entry = entries[(round + offset) % entries.len()];
            for sample in 0..samples {
                let (batches, operations) = match entry {
                    "palace_star" => (16, 786_432),
                    "self_transformations" => (16, 524_288),
                    "from_birth" | "from_parameters" | "retain_birth" | "retain_parameters" => {
                        (1, 8_192)
                    }
                    "star" | "palace_by_star" => (1, 36_864),
                    "birth_transformations" => (1, 32_768),
                    "names_hot" | "names_mixed" => (1, 147_456),
                    "lifecycle_birth" | "lifecycle_parameters" => (1, 2_048),
                    _ => (1, 49_152),
                };
                let elapsed_ns = operations * 10;
                csv.push_str(&format!(
                    "sample,{entry},{round},{sample},{batches},{operations},{elapsed_ns}\n"
                ));
            }
        }
    }
    csv
}

#[test]
fn read_csv_requires_complete_rotating_rounds() {
    let valid = read_csv(2, 2);
    let parsed = Suite::Read.parse(&valid, 2, 2, false).unwrap();
    let rounds = parsed.rounds;
    assert_eq!(rounds.len(), 2);
    assert_eq!(rounds[1]["star"], [10.0, 10.0]);
    assert_eq!(
        parsed.batch_elapsed_ns.unwrap()[1]["star"],
        [368_640, 368_640]
    );
    for invalid in [
        valid.replace(",2,512", ",1,512"),
        valid.replace("sample,star,0,0,1,36864,368640\n", ""),
        format!("{valid}unknown,row\n"),
        valid.replace(",1,36864,368640", ",1,36864,NaN"),
        valid.replace("sample,star,0,0,", "sample,star,0,1,"),
        valid.replace("sample,from_parameters,1,0,", "sample,from_birth,1,0,"),
        valid.replace(",16,786432,7864320", ",1,786432,7864320"),
        valid.replace(",16,786432,7864320", ",16,49152,7864320"),
        valid.replace(",16,786432,7864320", ",16,0,7864320"),
        valid.replace(",16,524288,5242880", ",16,524288,0"),
        valid.replace(",16,524288,5242880", ",16,524288,-1"),
        valid.replace(",16,524288,5242880", ",16,524288,1.5"),
        valid.replace(",16,524288,5242880", ",16,524288,18446744073709551616"),
        valid.replace(",16,524288,5242880", ",16,524288,5242880,extra"),
    ] {
        assert!(Suite::Read.parse(&invalid, 2, 2, false).is_err());
    }
    assert!(Suite::Read.parse(&valid, 2, 2, true).is_err());
}

#[test]
fn baseline_requires_matching_contract_environment_and_valid_formal_record() {
    for suite in [Suite::Construction, Suite::Read] {
        let mut baseline = json!({"suite_id": format!("{suite:?}"), "suite_version": 1,
            "contract_fingerprint": "same", "environment": {"runner_id": "fixed"},
            "mode": "calibrate", "run_count": 20, "round_count": 20, "samples_per_round": 31,
            "case_count_per_entry": 512, "seed": 1511464998, "status": "baseline", "dirty": false,
            "summary": {}});
        if suite == Suite::Read {
            baseline["suite_version"] = json!(2);
            baseline["sampling"] = read_sampling(false);
        }
        for entry in suite.entries() {
            baseline["summary"][entry] = json!({"median_ns": 10, "p95_ns": 12});
        }
        let mut current = baseline.clone();
        current["status"] = json!("provisional");
        current["dirty"] = json!(true);
        baseline["recorder_fingerprint"] = json!("old-package-tool");
        current["recorder_fingerprint"] = json!("new-package-tool");
        suite.ensure_comparable(&current, &baseline).unwrap();
        for (key, value) in [
            ("suite_id", json!("different")),
            ("suite_version", json!(99)),
            ("environment", json!({})),
            ("contract_fingerprint", json!("changed")),
            ("mode", json!("smoke")),
            ("status", json!("provisional")),
            ("dirty", json!(true)),
            ("summary", json!({})),
            (
                if suite == Suite::Read {
                    "round_count"
                } else {
                    "run_count"
                },
                json!(1),
            ),
        ] {
            let mut invalid = baseline.clone();
            invalid[key] = value;
            assert!(
                suite.ensure_comparable(&current, &invalid).is_err(),
                "{suite:?} {key}"
            );
        }
        for invalid_value in [Value::Null, json!(true), json!(0), json!(-1), json!("10")] {
            let mut invalid = baseline.clone();
            invalid["summary"][suite.entries()[0]]["median_ns"] = invalid_value;
            assert!(suite.ensure_comparable(&current, &invalid).is_err());
        }
        if suite == Suite::Read {
            for (key, value) in [
                ("suite_version", json!(1)),
                ("sampling", read_sampling(true)),
                ("sampling", Value::Null),
            ] {
                let mut invalid = baseline.clone();
                invalid[key] = value;
                assert!(suite.ensure_comparable(&current, &invalid).is_err());
            }
            let mut missing = baseline.clone();
            missing.as_object_mut().unwrap().remove("sampling");
            assert!(suite.ensure_comparable(&current, &missing).is_err());
        }
        baseline.as_object_mut().unwrap().remove("dirty");
        assert!(suite.ensure_comparable(&current, &baseline).is_err());
    }
}
