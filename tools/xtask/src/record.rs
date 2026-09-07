//! Benchmark orchestration. The existing Rust executables own all timing boundaries.
use crate::{
    benchmark::{Samples, Suite, Summary, read_sampling, summary},
    support::*,
};
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

struct Options {
    smoke: bool,
    runs: usize,
    baseline: Option<PathBuf>,
    record_baseline: bool,
    max_regression: Option<f64>,
}

impl Options {
    fn parse(suite: Suite, args: Vec<OsString>) -> Result<Self> {
        let mut args = args.into_iter();
        let smoke = match args.next().as_deref().and_then(|value| value.to_str()) {
            Some("smoke") => true,
            Some("calibrate") => false,
            _ => bail!("模式必须为 smoke 或 calibrate"),
        };
        let mut result = Self {
            smoke,
            runs: 20,
            baseline: None,
            record_baseline: false,
            max_regression: None,
        };
        let mut seen = BTreeSet::new();
        while let Some(flag) = args.next() {
            let flag = flag.to_str().context("选项名不是 UTF-8")?;
            let (flag, inline_value) = flag
                .split_once('=')
                .map_or((flag, None), |(flag, value)| (flag, Some(value)));
            ensure!(seen.insert(flag.to_owned()), "参数重复：{flag:?}");
            if flag == "--record-baseline" && inline_value.is_none() {
                result.record_baseline = true;
                continue;
            }
            ensure!(
                ["--runs", "--baseline", "--max-regression"].contains(&flag),
                "未知参数：{flag}"
            );
            let value = match inline_value {
                Some(value) => OsString::from(value),
                None => args.next().with_context(|| format!("{flag} 缺少值"))?,
            };
            ensure!(
                !value.is_empty() && !value.to_string_lossy().starts_with("--"),
                "{flag} 缺少有效值"
            );
            match flag {
                "--runs" => {
                    ensure!(
                        suite == Suite::Construction,
                        "读取基准固定 20 轮，不接受 --runs"
                    );
                    result.runs = value
                        .to_str()
                        .context("轮数不是 UTF-8")?
                        .parse()
                        .context("轮数必须为整数")?;
                }
                "--baseline" => result.baseline = Some(PathBuf::from(value)),
                "--max-regression" => {
                    result.max_regression = Some(
                        value
                            .to_str()
                            .context("比例不是 UTF-8")?
                            .parse()
                            .context("退化比例必须为数字")?,
                    )
                }
                _ => unreachable!("已验证的选项"),
            }
        }
        ensure!((2..=1000).contains(&result.runs), "--runs 必须在 2..=1000");
        ensure!(
            !(smoke && (result.baseline.is_some() || result.record_baseline)),
            "smoke 不能记录或比较正式基线"
        );
        ensure!(
            !(result.record_baseline && result.baseline.is_some()),
            "记录与比较基线应分开执行"
        );
        if let Some(limit) = result.max_regression {
            ensure!(
                result.baseline.is_some() && limit.is_finite() && limit >= 0.0,
                "--max-regression 需要 --baseline 和有限非负比例"
            );
        }
        Ok(result)
    }
}

fn contract_fingerprint(root: &Path, suite: Suite) -> Result<String> {
    // Keep comparison identity scoped to code that measures, validates or summarizes.
    // Full tool provenance is recorded separately, including package verification.
    let mut paths: Vec<_> = [
        "tools/xtask/src/lib.rs",
        "tools/xtask/src/main.rs",
        "tools/xtask/src/benchmark.rs",
        "tools/xtask/src/record.rs",
        "tools/xtask/src/support.rs",
        "Cargo.toml",
        "crates/ziwei/Cargo.toml",
        "tools/xtask/Cargo.toml",
        "tools/xtask/Cargo.lock",
    ]
    .map(String::from)
    .into();
    paths.extend(
        match suite {
            Suite::Construction => [
                "crates/ziwei/benches/suite.rs",
                "crates/ziwei/benches/construction.rs",
            ],
            Suite::Read => [
                "crates/ziwei/benches/read_path.rs",
                "crates/ziwei/examples/benchmark_read_path.rs",
            ],
        }
        .map(String::from),
    );
    fingerprint(root, paths)
}

fn recorder_fingerprint(root: &Path) -> Result<String> {
    let mut paths = rust_files(root, &root.join("tools/xtask/src"))?;
    paths.extend(["tools/xtask/Cargo.toml", "tools/xtask/Cargo.lock"].map(String::from));
    fingerprint(root, paths)
}

fn dirty(root: &Path) -> Result<bool> {
    Ok(!command(
        root,
        "git",
        &["status", "--porcelain", "--untracked-files=normal"],
    )?
    .is_empty())
}

struct EntrySummary {
    statistics: Summary,
    cross_round_cv: f64,
    suggested_regression_limit: Option<f64>,
    median_change: Option<f64>,
}

impl EntrySummary {
    fn to_json(&self, suite: Suite) -> Value {
        let mut value = self.statistics.to_json();
        value[if suite == Suite::Read {
            "cross_round_cv"
        } else {
            "cross_run_cv"
        }] = json!(self.cross_round_cv);
        if suite == Suite::Construction {
            value["suggested_regression_limit"] = json!(self.suggested_regression_limit);
        }
        if let Some(change) = self.median_change {
            value["median_change"] = json!(change);
        }
        value
    }
}

fn summarize(
    suite: Suite,
    rounds: &[Samples],
    smoke: bool,
    baseline: Option<&Value>,
    limit: Option<f64>,
) -> Result<(BTreeMap<String, EntrySummary>, Vec<String>)> {
    let mut summaries = BTreeMap::new();
    let mut regressions = Vec::new();
    for entry in suite.entries() {
        let values: Vec<_> = rounds
            .iter()
            .flat_map(|round| round[*entry].iter().copied())
            .collect();
        let medians: Vec<_> = rounds
            .iter()
            .map(|round| summary(&round[*entry]).map(|s| s.median_ns))
            .collect::<Result<_>>()?;
        // Scaling first avoids overflow while computing population CV.
        let scale = medians.iter().copied().fold(0.0, f64::max);
        let mean = medians.iter().map(|value| value / scale).sum::<f64>() / medians.len() as f64;
        let variance = medians
            .iter()
            .map(|value| (value / scale - mean).powi(2))
            .sum::<f64>()
            / medians.len() as f64;
        let cv = variance.sqrt() / mean;
        let mut result = EntrySummary {
            statistics: summary(&values)?,
            cross_round_cv: cv,
            suggested_regression_limit: (!smoke && suite == Suite::Construction)
                .then_some((3.0 * cv).max(0.05)),
            median_change: None,
        };
        if let Some(baseline) = baseline {
            let ratio = result.statistics.median_ns
                / baseline["summary"][entry]["median_ns"]
                    .as_f64()
                    .context("基线中位数缺失")?
                - 1.0;
            ensure!(ratio.is_finite(), "退化比例溢出");
            result.median_change = Some(ratio);
            if limit.is_some_and(|limit| ratio > limit) {
                regressions.push((*entry).into());
            }
        }
        summaries.insert((*entry).to_owned(), result);
    }
    Ok((summaries, regressions))
}

/// Returns true only when an explicitly supplied regression limit is exceeded.
pub fn run(suite: Suite, args: Vec<OsString>) -> Result<bool> {
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        write_stdout(&format!(
            "用法：smoke | calibrate [--baseline <路径> | --record-baseline] [--max-regression <比例>]{}\n",
            if suite == Suite::Construction {
                " [--runs 20]"
            } else {
                "；读取校准固定 20 轮"
            }
        ))?;
        return Ok(false);
    }
    let options = Options::parse(suite, args)?;
    let root = root()?;
    let is_dirty = dirty(&root)?;
    if options.record_baseline {
        ensure!(
            !is_dirty && env::var("ZIWEI_BENCH_RUNNER").is_ok_and(|id| !id.trim().is_empty()),
            "正式基线要求干净工作树及显式、稳定的 ZIWEI_BENCH_RUNNER"
        );
    }
    let read = suite == Suite::Read;
    let profile = if read { "release" } else { "bench" };
    let count = if options.smoke { 1 } else { options.runs };
    let samples = if options.smoke { 1 } else { 31 };
    let mode = if options.smoke { "smoke" } else { "calibrate" };
    let status = if options.record_baseline {
        "baseline"
    } else if options.smoke {
        "smoke"
    } else {
        "provisional"
    };
    let mut report = json!({"observed_at": observed_at()?, "recorder": "ziwei-xtask-v1",
        "suite_id": if read { "ziwei-read-path-512" } else { "ziwei-construction-120" }, "suite_version": if read { 2 } else { 1 },
        "contract_fingerprint": contract_fingerprint(&root, suite)?, "source_fingerprint": source_fingerprint(&root)?,
        "recorder_fingerprint": recorder_fingerprint(&root)?,
        "environment": environment(&root, profile)?, "git_revision": command(&root, "git", &["rev-parse", "HEAD"])?,
        "dirty": is_dirty, "mode": mode, "status": status, "case_count_per_entry": if read { 512 } else { 120 }});
    if read {
        report["round_count"] = json!(count);
        report["samples_per_round"] = json!(samples);
        report["seed"] = json!(1511464998_u32);
        report["sampling"] = read_sampling(options.smoke);
    } else {
        report["run_count"] = json!(count);
    }
    let baseline: Option<Value> = options
        .baseline
        .as_ref()
        .map(|path| -> Result<_> {
            Ok(serde_json::from_slice(&fs::read(path).with_context(
                || format!("不能读取基线 {}", path.display()),
            )?)?)
        })
        .transpose()?;
    if let Some(baseline) = &baseline {
        suite.ensure_comparable(&report, baseline)?;
    }
    let parent = root.join(if read {
        "target/benchmarks/read-path"
    } else {
        "target/benchmarks"
    });
    let output = evidence_dir(&parent)?;
    report["record_id"] = json!(
        output
            .file_name()
            .context("记录 ID 缺失")?
            .to_string_lossy()
    );
    record_session(&root, &output, &mut report, |report, log| {
        let executable = if read {
            log.build(
                &[
                    "build",
                    "--release",
                    "-p",
                    "ziwei",
                    "--locked",
                    "--example",
                    "benchmark_read_path",
                    "--message-format=json",
                ],
                "benchmark_read_path",
            )?
        } else {
            log.build(
                &[
                    "bench",
                    "-p",
                    "ziwei",
                    "--bench",
                    "construction",
                    "--locked",
                    "--no-run",
                    "--message-format=json",
                ],
                "construction",
            )?
        };
        let args: &[&str] = if options.smoke { &["--smoke"] } else { &[] };
        let rounds = if read {
            let raw = log.run("measure", &executable, args, "raw.csv")?;
            log.stage = "parse";
            let parsed = suite.parse(&raw, count, samples, options.smoke)?;
            report["batch_elapsed_ns"] =
                json!(parsed.batch_elapsed_ns.context("读取基准缺少原始批时长")?);
            report["rounds"] = json!(parsed.rounds);
            parsed.rounds
        } else {
            let mut rounds = Vec::with_capacity(count);
            let mut runs = Vec::with_capacity(count);
            for index in 0..count {
                let raw = log.run(
                    "measure",
                    &executable,
                    args,
                    &format!("run-{:03}.csv", index + 1),
                )?;
                log.stage = "parse";
                let mut parsed = suite.parse(&raw, 1, samples, options.smoke)?;
                let round = parsed.rounds.remove(0);
                // Per-run summaries retain the original four-value statistics schema.
                let summary: serde_json::Map<_, _> = round
                    .iter()
                    .map(|(entry, values)| Ok((entry.clone(), summary(values)?.to_json())))
                    .collect::<Result<_>>()?;
                let run =
                    json!({"run": index + 1, "samples_ns_per_chart": round, "summary": summary});
                write_json(&output.join(format!("run-{:03}.json", index + 1)), &run)?;
                rounds.push(round);
                runs.push(run);
            }
            report["runs"] = json!(runs);
            rounds
        };
        log.stage = "verify";
        ensure!(
            report["contract_fingerprint"] == contract_fingerprint(&root, suite)?
                && report["source_fingerprint"] == source_fingerprint(&root)?
                && report["environment"] == log.verify_environment(profile)?,
            "测量期间源码、合同或环境改变；原始数据保留在 {}，不生成有效汇总",
            output.display()
        );
        if options.record_baseline {
            ensure!(
                log.verify(
                    "git",
                    &["status", "--porcelain", "--untracked-files=normal"]
                )?
                .is_empty()
                    && report["git_revision"] == log.verify("git", &["rev-parse", "HEAD"])?,
                "测量期间 Git 状态改变，不能记录正式基线"
            );
        }
        log.stage = "summarize";
        let (summaries, regressions) = summarize(
            suite,
            &rounds,
            options.smoke,
            baseline.as_ref(),
            options.max_regression,
        )?;
        report["summary"] = json!(
            summaries
                .iter()
                .map(|(entry, statistics)| (entry, statistics.to_json(suite)))
                .collect::<BTreeMap<_, _>>()
        );
        report["regressions"] = json!(regressions);
        report["commands"] = json!(&log.commands);
        log.stage = "write";
        let path = output.join(if read { "record.json" } else { "report.json" });
        let message = if read {
            format!(
                "状态：{status}；18 项操作；P95 为批平均值分位数，不是单次调用尾延迟。\n完整记录：{}",
                path.display()
            )
        } else {
            let markdown = construction_artifacts(&output, report, &summaries, &rounds)?;
            format!("{markdown}完整报告：{}", path.display())
        };
        // Publish the valid record last, after all output (including flush) succeeds.
        write_stdout(&format!("{message}\n"))?;
        write_json(&path, report)?;
        Ok(!regressions.is_empty())
    })
}

fn record_session(
    root: &Path,
    output: &Path,
    report: &mut Value,
    action: impl FnOnce(&mut Value, &mut CommandLog<'_>) -> Result<bool>,
) -> Result<bool> {
    let mut log = CommandLog::new(root, output);
    match action(report, &mut log) {
        Ok(outcome) => Ok(outcome),
        Err(error) => {
            let mut failure = report.clone();
            let fields = failure.as_object_mut().context("记录必须为 JSON 对象")?;
            fields.remove("summary");
            fields.remove("regressions");
            failure["status"] = json!("failed");
            failure["stage"] = json!(log.stage);
            failure["commands"] = json!(log.commands);
            failure["error"] = json!(format!("{error:#}"));
            let path = output.join("failure.json");
            write_json(&path, &failure)
                .with_context(|| format!("基准失败（{error:#}），且无法写入失败记录"))?;
            Err(error).with_context(|| format!("基准失败，记录：{}", path.display()))
        }
    }
}

fn write_stdout(message: &str) -> Result<()> {
    let mut stdout = io::stdout().lock();
    stdout
        .write_all(message.as_bytes())
        .context("不能写入标准输出")?;
    stdout.flush().context("不能刷新标准输出")
}

fn construction_artifacts(
    output: &Path,
    report: &Value,
    summaries: &BTreeMap<String, EntrySummary>,
    rounds: &[Samples],
) -> Result<String> {
    let mut lines = vec![
        "# 建盘基准测量".into(),
        String::new(),
        format!("记录：{}", report["record_id"].as_str().unwrap()),
        format!(
            "状态：{}；dirty={}",
            report["status"].as_str().unwrap(),
            report["dirty"]
        ),
        String::new(),
        "单位为每批建盘平均 ns/chart；P95 是批平均值的分位数，不是单次调用尾延迟。".into(),
        "计时包含命盘构建和释放，不包含输入校验、日期换算、输出格式化及查询。".into(),
        String::new(),
    ];
    for entry in Suite::Construction.entries() {
        let summary = &summaries[*entry];
        lines.push(format!(
            "- {entry}: median {:.1} ns，P95 {:.1} ns。",
            summary.statistics.median_ns, summary.statistics.p95_ns
        ));
        if let Some(limit) = summary.suggested_regression_limit {
            lines.push(format!(
                "  跨轮 CV {:.2}%；待审阈值 {:.2}%。",
                summary.cross_round_cv * 100.0,
                limit * 100.0
            ));
        }
        if let Some(change) = summary.median_change {
            lines.push(format!("  相对基线 median 变化：{:+.2}%。", change * 100.0));
        }
    }
    lines.extend([
        String::new(),
        "建议阈值仅供人工审定，不能自动成为性能承诺。共享 CI 只跑 smoke。".into(),
        "正式基线须在固定机器、稳定 runner ID、干净工作树下另行记录。".into(),
    ]);
    let markdown = format!("{}\n", lines.join("\n"));
    write_new(&output.join("report.md"), markdown.as_bytes())?;
    let mut medians = Vec::new();
    for (index, round) in rounds.iter().enumerate() {
        for entry in Suite::Construction.entries() {
            medians.push((index + 1, *entry, summary(&round[*entry])?.median_ns));
        }
    }
    let maximum = medians
        .iter()
        .map(|(_, _, value)| *value)
        .fold(0.0, f64::max);
    let height = 70 + 22 * medians.len();
    let mut svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="900" height="{height}" viewBox="0 0 900 {height}"><rect width="100%" height="100%" fill="white"/><text x="15" y="25">Construction: per-run median ns/chart (common scale)</text>"#
    );
    for (index, (run, entry, value)) in medians.iter().enumerate() {
        let y = 45 + index * 22;
        let text_y = y + 12;
        let width = 550.0 * (value / maximum);
        let color = if *entry == "from_birth" {
            "#3659a2"
        } else {
            "#19745c"
        };
        svg.push_str(&format!(r#"<text x="15" y="{text_y}" font-size="12">{entry} #{run}</text><rect x="180" y="{y}" width="{width:.1}" height="15" fill="{color}"/><text x="750" y="{text_y}" font-size="12">{value:.1} ns</text>"#));
    }
    svg.push_str("</svg>\n");
    write_new(&output.join("medians.svg"), svg.as_bytes())?;
    Ok(markdown)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aggregate_statistics_preserve_cv_and_explicit_regression_thresholds() {
        for suite in [Suite::Construction, Suite::Read] {
            let rounds: Vec<Samples> = [10.0, 20.0]
                .into_iter()
                .map(|value| {
                    suite
                        .entries()
                        .iter()
                        .map(|entry| ((*entry).into(), vec![value; 2]))
                        .collect()
                })
                .collect();
            let mut baseline = json!({"summary": {}});
            for entry in suite.entries() {
                baseline["summary"][entry] = json!({"median_ns": 10.0, "p95_ns": 12.0});
            }
            let (summaries, regressions) =
                summarize(suite, &rounds, false, Some(&baseline), Some(0.4)).unwrap();
            let summary = &summaries["from_birth"];
            assert_eq!(summary.statistics.median_ns, 15.0);
            assert_eq!(summary.statistics.p95_ns, 20.0);
            assert!((summary.cross_round_cv - 1.0 / 3.0).abs() < 1e-12);
            assert_eq!(summary.median_change, Some(0.5));
            assert!(regressions.contains(&"from_birth".to_owned()));
            let json = summary.to_json(suite);
            if suite == Suite::Construction {
                assert_eq!(json["suggested_regression_limit"], 1.0);
                assert!(json.get("cross_run_cv").is_some());
                assert!(json.get("cross_round_cv").is_none());
            } else {
                assert!(json.get("suggested_regression_limit").is_none());
                assert!(json.get("cross_run_cv").is_none());
                assert!(json.get("cross_round_cv").is_some());
            }
            assert!(
                summarize(suite, &rounds, false, Some(&baseline), Some(0.5))
                    .unwrap()
                    .1
                    .is_empty()
            );
            assert!(
                summarize(suite, &rounds, false, Some(&baseline), None)
                    .unwrap()
                    .1
                    .is_empty()
            );
        }
    }

    #[test]
    fn failed_process_launch_is_distinguished_from_a_nonzero_exit() {
        let directory = tempfile::tempdir().unwrap();
        let missing = directory.path().join("nonexistent-command");
        let mut report = json!({"status": "smoke"});
        let result = record_session(directory.path(), directory.path(), &mut report, |_, log| {
            log.run("build", &missing, &[], "build.jsonl")?;
            Ok(false)
        });
        assert!(result.is_err());
        let failure: Value =
            serde_json::from_slice(&fs::read(directory.path().join("failure.json")).unwrap())
                .unwrap();
        assert_eq!(failure["status"], "failed");
        assert_eq!(failure["commands"][0]["exit_code"], Value::Null);
        assert!(
            failure["commands"][0]["error"]
                .as_str()
                .is_some_and(|s| !s.is_empty())
        );
        assert!(!directory.path().join("build.jsonl").exists());
        assert!(!directory.path().join("report.json").exists());
    }

    #[test]
    fn contracts_track_shared_and_suite_specific_dependencies() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path();
        for path in [
            "Cargo.toml",
            "crates/ziwei/Cargo.toml",
            "tools/xtask/Cargo.toml",
            "tools/xtask/Cargo.lock",
            "tools/xtask/src/lib.rs",
            "tools/xtask/src/main.rs",
            "tools/xtask/src/package.rs",
            "tools/xtask/src/benchmark.rs",
            "tools/xtask/src/record.rs",
            "tools/xtask/src/support.rs",
            "crates/ziwei/benches/suite.rs",
            "crates/ziwei/benches/construction.rs",
            "crates/ziwei/benches/read_path.rs",
            "crates/ziwei/examples/benchmark_read_path.rs",
        ] {
            let path = root.join(path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, "original").unwrap();
        }
        let identities = || {
            [Suite::Construction, Suite::Read]
                .map(|suite| contract_fingerprint(root, suite).unwrap())
        };
        let original = identities();
        let audit = recorder_fingerprint(root).unwrap();
        fs::write(
            root.join("tools/xtask/src/package.rs"),
            "package-only change",
        )
        .unwrap();
        assert_eq!(identities(), original);
        assert_ne!(recorder_fingerprint(root).unwrap(), audit);
        fs::write(
            root.join("crates/ziwei/benches/read_path.rs"),
            "new read workload",
        )
        .unwrap();
        let read_changed = identities();
        assert_eq!(read_changed[0], original[0]);
        assert_ne!(read_changed[1], original[1]);
        fs::write(
            root.join("tools/xtask/src/support.rs"),
            "new environment policy",
        )
        .unwrap();
        let shared_changed = identities();
        assert_ne!(shared_changed[0], read_changed[0]);
        assert_ne!(shared_changed[1], read_changed[1]);
    }

    #[test]
    fn failed_command_preserves_diagnostics_without_a_valid_report() {
        let directory = tempfile::tempdir().unwrap();
        let mut report = json!({"status": "smoke", "suite_id": "ziwei-construction-120"});
        let result = record_session(directory.path(), directory.path(), &mut report, |_, log| {
            log.run("build", "rustc", &["--xtask-invalid-option"], "build.jsonl")?;
            Ok(false)
        });
        assert!(result.is_err());
        let failure: Value =
            serde_json::from_slice(&fs::read(directory.path().join("failure.json")).unwrap())
                .unwrap();
        assert_eq!(failure["status"], "failed");
        assert_eq!(failure["stage"], "build");
        assert_ne!(failure["commands"][0]["exit_code"], 0);
        assert!(
            !fs::read(directory.path().join("build.jsonl.stderr"))
                .unwrap()
                .is_empty()
        );
        assert!(!directory.path().join("report.json").exists());
        assert!(failure.get("summary").is_none());
    }

    #[test]
    fn malformed_csv_is_saved_before_parsing_fails() {
        let directory = tempfile::tempdir().unwrap();
        let mut report = json!({"status": "smoke"});
        let result = record_session(directory.path(), directory.path(), &mut report, |_, log| {
            let raw = log.run("measure", "rustc", &["--version"], "run-001.csv")?;
            log.stage = "parse";
            Suite::Construction.parse(&raw, 1, 1, true)?;
            Ok(false)
        });
        assert!(result.is_err());
        let raw = fs::read_to_string(directory.path().join("run-001.csv")).unwrap();
        assert!(raw.starts_with("rustc "));
        assert!(raw.ends_with('\n'));
        let failure: Value =
            serde_json::from_slice(&fs::read(directory.path().join("failure.json")).unwrap())
                .unwrap();
        assert_eq!(failure["stage"], "parse");
        assert_eq!(failure["commands"][0]["exit_code"], 0);
        assert!(!directory.path().join("report.json").exists());
    }
}
