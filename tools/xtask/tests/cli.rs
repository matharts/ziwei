use serde_json::Value;
use std::{
    fs,
    path::PathBuf,
    process::{Command, Output},
};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}

fn cli(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_ziwei-xtask"))
        .args(args)
        .current_dir(root())
        .output()
        .unwrap()
}

#[test]
fn invalid_flags_fail_before_creating_or_measuring_anything() {
    for args in [
        vec!["benchmark", "smoke", "--baseline", "missing.json"],
        vec!["benchmark", "calibrate", "--runs", "1"],
        vec!["benchmark", "smoke", "--max-regression", "0.1"],
        vec!["benchmark-read", "smoke", "--runs", "2"],
        vec!["benchmark-read", "calibrate", "--baseline", ""],
        vec!["benchmark-read", "smoke", "--unknown"],
        vec!["check-package", "--unknown"],
    ] {
        let output = cli(&args);
        assert!(!output.status.success(), "{args:?}");
        assert!(output.stdout.is_empty());
    }
}

#[test]
fn option_value_syntaxes_reach_the_same_baseline_path() {
    let directory = tempfile::tempdir().unwrap();
    let baseline = directory.path().join("基线 记录=a=b.json");
    let baseline = baseline.to_str().unwrap();
    let inline_baseline = format!("--baseline={baseline}");

    for command in ["benchmark", "benchmark-read"] {
        let mut spaced = vec![command, "calibrate"];
        let mut inline = spaced.clone();
        if command == "benchmark" {
            spaced.extend(["--runs", "2"]);
            inline.push("--runs=2");
        }
        spaced.extend(["--baseline", baseline, "--max-regression", "0.1"]);
        inline.extend([inline_baseline.as_str(), "--max-regression=0.1"]);

        // A missing baseline stops both commands before any measurement.
        let expected = cli(&spaced);
        assert!(!expected.status.success());
        assert!(expected.stdout.is_empty());
        let stderr = String::from_utf8_lossy(&expected.stderr);
        assert!(stderr.contains(&format!("不能读取基线 {baseline}")));

        let actual = cli(&inline);
        assert_eq!(actual.status.code(), expected.status.code());
        assert_eq!(actual.stdout, expected.stdout);
        assert_eq!(
            String::from_utf8_lossy(&actual.stderr),
            stderr,
            "{inline:?}"
        );
    }
}

#[test]
fn duplicate_options_are_rejected_across_value_syntaxes() {
    for command in ["benchmark", "benchmark-read"] {
        for (flag, first, second) in [
            ("--runs", "2", "3"),
            ("--baseline", "first.json", "second.json"),
            ("--max-regression", "0.1", "0.2"),
        ] {
            if command == "benchmark-read" && flag == "--runs" {
                continue;
            }
            let first_inline = format!("{flag}={first}");
            let second_inline = format!("{flag}={second}");
            for repeated in [
                vec![flag, first, flag, second],
                vec![flag, first, second_inline.as_str()],
                vec![first_inline.as_str(), flag, second],
                vec![first_inline.as_str(), second_inline.as_str()],
                vec![first_inline.as_str(), first_inline.as_str()],
            ] {
                let mut args = vec![command, "calibrate"];
                args.extend(repeated);
                // Prevent measurement even if duplicate validation regresses.
                args.push("--unknown");
                let output = cli(&args);
                assert!(!output.status.success(), "{args:?}");
                assert!(output.stdout.is_empty());
                assert_eq!(
                    String::from_utf8_lossy(&output.stderr),
                    format!("xtask: 参数重复：{flag:?}\n"),
                    "{args:?}"
                );
            }
        }
    }
}

#[test]
fn missing_option_values_are_rejected_in_both_syntaxes() {
    for command in ["benchmark", "benchmark-read"] {
        for flag in ["--runs", "--baseline", "--max-regression"] {
            let empty_inline = format!("{flag}=");
            let option_inline = format!("{flag}=--unknown");
            for (values, error) in [
                (vec![flag], "缺少值"),
                (vec![flag, ""], "缺少有效值"),
                (vec![flag, "--unknown"], "缺少有效值"),
                (vec![empty_inline.as_str()], "缺少有效值"),
                (vec![empty_inline.as_str(), "2"], "缺少有效值"),
                (vec![option_inline.as_str()], "缺少有效值"),
            ] {
                let mut args = vec![command, "calibrate"];
                args.extend(values);
                let output = cli(&args);
                assert!(!output.status.success(), "{args:?}");
                assert!(output.stdout.is_empty());
                assert_eq!(
                    String::from_utf8_lossy(&output.stderr),
                    format!("xtask: {flag} {error}\n"),
                    "{args:?}"
                );
            }
        }
    }
}

#[test]
fn inline_values_preserve_option_validation() {
    for (args, error) in [
        (
            vec!["benchmark", "calibrate", "--runs=1"],
            "--runs 必须在 2..=1000",
        ),
        (
            vec!["benchmark-read", "calibrate", "--runs=2"],
            "读取基准固定 20 轮，不接受 --runs",
        ),
        (
            vec!["benchmark", "calibrate", "--max-regression=0.1"],
            "--max-regression 需要 --baseline 和有限非负比例",
        ),
        (
            vec![
                "benchmark-read",
                "calibrate",
                "--baseline=missing.json",
                "--max-regression=NaN",
            ],
            "--max-regression 需要 --baseline 和有限非负比例",
        ),
        (
            vec!["benchmark", "calibrate", "--record-baseline=true"],
            "未知参数：--record-baseline",
        ),
    ] {
        let output = cli(&args);
        assert!(!output.status.success(), "{args:?}");
        assert!(output.stdout.is_empty());
        assert_eq!(
            String::from_utf8_lossy(&output.stderr),
            format!("xtask: {error}\n"),
            "{args:?}"
        );
    }
}

#[test]
fn help_does_not_run_the_workload() {
    for args in [
        vec!["--help"],
        vec!["benchmark", "smoke", "--help"],
        vec!["benchmark-read", "--help"],
        vec!["check-package", "--help"],
    ] {
        let output = cli(&args);
        assert!(output.status.success());
        assert!(!output.stdout.is_empty());
        assert!(output.stderr.is_empty());
    }
}

fn assert_normalized_timing(actual: f64, elapsed: u64, operations: u64) {
    assert!(elapsed > 0 && operations > 0);
    let expected = elapsed as f64 / operations as f64;
    // JSON decoding can round the recorded f64 by a few ULPs. Allow only
    // relative rounding error, not a measurement or normalization tolerance.
    let tolerance = 4.0 * f64::EPSILON * expected.abs();
    assert!(
        actual.is_finite() && (actual - expected).abs() <= tolerance,
        "normalized timing {actual:?} differs from {expected:?} by more than {tolerance:?}"
    );
}

#[test]
fn normalized_timing_accepts_json_rounding() {
    // Fixed sample from the MSRV CI failure; no real timing workload needed.
    let expected = 381_455.0 / 32_768.0;
    let json = serde_json::to_vec(&expected).unwrap();
    let actual: f64 = serde_json::from_slice(&json).unwrap();
    assert_normalized_timing(actual, 381_455, 32_768);
}

#[test]
#[should_panic(expected = "normalized timing")]
fn normalized_timing_rejects_wrong_operation_count() {
    assert_normalized_timing(381_455.0 / 32_768.0, 381_455, 32_767);
}

// One test keeps both real workloads serial, even under the default test harness.
#[test]
#[ignore = "real workloads; run mise run check:tools:e2e"]
fn smoke_recorders_emit_both_independent_contracts() {
    for (command, prefix, suite, entries, artifact) in [
        (
            "benchmark",
            "完整报告：",
            "ziwei-construction-120",
            2,
            "run-001.json",
        ),
        (
            "benchmark-read",
            "完整记录：",
            "ziwei-read-path-512",
            18,
            "raw.csv",
        ),
    ] {
        let mut args = vec![command, "smoke"];
        if command == "benchmark" {
            args.push("--runs=2");
        }
        let output = cli(&args);
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let stdout = String::from_utf8(output.stdout).unwrap();
        let path = PathBuf::from(
            stdout
                .lines()
                .find_map(|line| line.strip_prefix(prefix))
                .unwrap(),
        );
        let record: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(record["status"], "smoke");
        assert_eq!(record["suite_id"], suite);
        assert_eq!(record["summary"].as_object().unwrap().len(), entries);
        assert_eq!(record["source_fingerprint"].as_str().unwrap().len(), 64);
        assert_eq!(record["contract_fingerprint"].as_str().unwrap().len(), 64);
        assert_eq!(record["recorder_fingerprint"].as_str().unwrap().len(), 64);
        let commands = record["commands"].as_array().unwrap();
        assert!(commands.len() > 2);
        assert_eq!(commands[0]["stage"], "build");
        assert_eq!(commands[1]["stage"], "measure");
        assert!(
            commands[2..]
                .iter()
                .all(|command| command["stage"] == "verify")
        );
        for probe in [["rustc", "-Vv"], ["cargo", "-V"]] {
            assert!(
                commands[2..]
                    .iter()
                    .any(|command| command["command"] == serde_json::json!(probe))
            );
        }
        for command in commands {
            assert_eq!(command["exit_code"], 0);
            for stream in ["stdout_file", "stderr_file"] {
                assert!(
                    path.parent()
                        .unwrap()
                        .join(command[stream].as_str().unwrap())
                        .is_file()
                );
            }
        }
        assert!(!path.parent().unwrap().join("failure.json").exists());
        assert!(path.parent().unwrap().join(artifact).is_file());
        if command == "benchmark-read" {
            assert_eq!(record["suite_version"], 2);
            assert_eq!(record["round_count"], 1);
            assert_eq!(record["environment"]["profile"], "release");
            assert_eq!(record["sampling"].as_object().unwrap().len(), 18);
            for (entry, plan) in record["sampling"].as_object().unwrap() {
                assert_eq!(plan["batches_per_sample"], 1);
                let elapsed = record["batch_elapsed_ns"][0][entry][0].as_u64().unwrap();
                assert!(elapsed > 0);
                let operations = plan["operations_per_sample"].as_u64().unwrap();
                let ns_per_unit = record["rounds"][0][entry][0].as_f64().unwrap();
                assert_normalized_timing(ns_per_unit, elapsed, operations);
            }
            assert_eq!(
                record["sampling"]["palace_star"]["operations_per_sample"],
                49_152
            );
            assert_eq!(
                record["sampling"]["self_transformations"]["operations_per_sample"],
                32_768
            );
            let raw = fs::read_to_string(path.parent().unwrap().join(artifact)).unwrap();
            let mut rows = raw.lines();
            assert_eq!(
                rows.next(),
                Some("suite,ziwei-read-path-512,2,512,1511464998")
            );
            for row in rows {
                let fields: Vec<_> = row.split(',').collect();
                assert_eq!(fields.len(), 7);
                assert_eq!(fields[4], "1");
                assert!(fields[6].parse::<u64>().unwrap() > 0);
            }
        } else {
            assert_eq!(record["suite_version"], 1);
            assert!(record.get("sampling").is_none());
            assert!(record.get("batch_elapsed_ns").is_none());
            assert!(path.parent().unwrap().join("medians.svg").is_file());
            assert!(path.parent().unwrap().join("report.md").is_file());
            assert!(
                fs::read_to_string(path.parent().unwrap().join("run-001.csv"))
                    .unwrap()
                    .starts_with("suite,ziwei-construction-120,1,120\n")
            );
        }
    }
    read_example_contract();
}

#[cfg(unix)]
#[test]
#[ignore = "real workloads; run mise run check:tools:e2e"]
fn closed_stdout_preserves_failure_evidence_for_both_suites() {
    use std::process::Stdio;

    for command in ["benchmark", "benchmark-read"] {
        let mut child = Command::new(env!("CARGO_BIN_EXE_ziwei-xtask"))
            .args([command, "smoke"])
            .current_dir(root())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        drop(child.stdout.take());
        let output = child.wait_with_output().unwrap();
        let stderr = String::from_utf8(output.stderr).unwrap();
        assert_eq!(output.status.code(), Some(1), "{stderr}");
        assert!(!stderr.contains("panicked"), "{stderr}");
        let path = failure_path(&stderr);
        let failure: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(failure["status"], "failed");
        assert_eq!(failure["stage"], "write");
        assert!(failure["error"].as_str().unwrap().contains("标准输出"));
        assert!(failure.get("summary").is_none());
        assert!(failure.get("regressions").is_none());
        for name in ["record.json", "report.json"] {
            assert!(!path.parent().unwrap().join(name).exists());
        }
        assert!(path.parent().unwrap().join("build.jsonl").is_file());
    }
}

#[cfg(unix)]
#[test]
#[ignore = "real workload and command failure fixture; run mise run check:tools:e2e"]
fn failed_environment_verification_preserves_command_evidence() {
    use std::os::unix::fs::PermissionsExt;

    let sysroot = Command::new("rustc")
        .args(["--print", "sysroot"])
        .output()
        .unwrap();
    assert!(sysroot.status.success());
    let compiler =
        PathBuf::from(String::from_utf8(sysroot.stdout).unwrap().trim()).join("bin/rustc");
    let directory = tempfile::tempdir().unwrap();
    let wrapper = directory.path().join("rustc");
    // Only the second environment probe fails. Cargo still uses the real compiler.
    fs::write(
        &wrapper,
        r#"#!/bin/sh
if [ "$#" -eq 1 ] && [ "$1" = "-Vv" ]; then
    if [ -e "$0.seen" ]; then
        printf 'verification stdout\n'
        printf 'verification stderr\n' >&2
        exit 73
    fi
    : > "$0.seen"
fi
exec "$ZIWEI_TEST_REAL_RUSTC" "$@"
"#,
    )
    .unwrap();
    fs::set_permissions(&wrapper, fs::Permissions::from_mode(0o755)).unwrap();
    let inherited_path = std::env::var_os("PATH").unwrap();
    let path = std::env::join_paths(
        std::iter::once(directory.path().to_owned()).chain(std::env::split_paths(&inherited_path)),
    )
    .unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_ziwei-xtask"))
        .args(["benchmark-read", "smoke"])
        .current_dir(root())
        .env("PATH", path)
        .env("RUSTC", &compiler)
        .env("ZIWEI_TEST_REAL_RUSTC", &compiler)
        .output()
        .unwrap();
    let stderr = String::from_utf8(output.stderr).unwrap();
    assert_eq!(output.status.code(), Some(1), "{stderr}");
    assert!(output.stdout.is_empty());
    let path = failure_path(&stderr);
    let failure: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(failure["status"], "failed");
    assert_eq!(failure["stage"], "verify");
    let command = failure["commands"].as_array().unwrap().last().unwrap();
    assert_eq!(command["stage"], "verify");
    assert_eq!(command["command"], serde_json::json!(["rustc", "-Vv"]));
    assert_eq!(command["exit_code"], 73);
    for (stream, expected) in [
        ("stdout_file", b"verification stdout\n".as_slice()),
        ("stderr_file", b"verification stderr\n".as_slice()),
    ] {
        assert_eq!(
            fs::read(
                path.parent()
                    .unwrap()
                    .join(command[stream].as_str().unwrap())
            )
            .unwrap(),
            expected
        );
    }
    assert!(failure.get("summary").is_none());
    assert!(!path.parent().unwrap().join("record.json").exists());
    assert!(path.parent().unwrap().join("raw.csv").is_file());
}

#[cfg(unix)]
fn failure_path(stderr: &str) -> PathBuf {
    let diagnostic = stderr
        .strip_prefix("xtask: 基准失败，记录：")
        .unwrap_or_else(|| panic!("缺少失败记录路径：{stderr}"));
    PathBuf::from(diagnostic.split_once(": ").unwrap().0)
}

fn read_example_contract() {
    let build = Command::new("cargo")
        .args([
            "build",
            "-p",
            "ziwei",
            "--locked",
            "--example",
            "benchmark_read_path",
            "--message-format=json",
        ])
        .current_dir(root())
        .output()
        .unwrap();
    assert!(
        build.status.success(),
        "{}",
        String::from_utf8_lossy(&build.stderr)
    );
    let artifacts: Vec<Value> = String::from_utf8(build.stdout)
        .unwrap()
        .lines()
        .filter(|line| line.starts_with('{'))
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    let executables: Vec<_> = artifacts
        .iter()
        .filter(|artifact| {
            artifact["reason"] == "compiler-artifact"
                && artifact["target"]["name"] == "benchmark_read_path"
        })
        .filter_map(|artifact| artifact["executable"].as_str())
        .collect();
    assert_eq!(executables.len(), 1);
    let run = |args: &[&str]| {
        Command::new(executables[0])
            .args(args)
            .current_dir(root())
            .output()
            .unwrap()
    };
    for args in [
        vec!["--smoke", "--output"],
        vec!["--smoke", "--unknown"],
        vec!["--smoke", "--smoke"],
        vec!["--smoke", "--memory"],
        vec!["--smoke", "--output", ""],
        vec!["--output", "--memory"],
    ] {
        let output = run(&args);
        assert!(!output.status.success(), "{args:?}");
        assert!(output.stdout.is_empty());
        assert!(!output.stderr.is_empty());
    }
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("读取样本.csv");
    let args = ["--smoke", "--output", path.to_str().unwrap()];
    let first = run(&args);
    assert!(
        first.status.success(),
        "{}",
        String::from_utf8_lossy(&first.stderr)
    );
    assert!(first.stdout.is_empty());
    let saved = fs::read(&path).unwrap();
    assert_eq!(
        String::from_utf8(saved.clone()).unwrap().lines().count(),
        19
    );
    assert!(!run(&args).status.success());
    assert_eq!(fs::read(path).unwrap(), saved);
}
