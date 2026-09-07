use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Summary {
    pub median_ns: f64,
    pub p95_ns: f64,
    pub min_ns: f64,
    pub max_ns: f64,
}

impl Summary {
    pub fn to_json(self) -> Value {
        json!({"median_ns": self.median_ns, "p95_ns": self.p95_ns,
            "min_ns": self.min_ns, "max_ns": self.max_ns})
    }
}

/// Summarize positive batch averages, not individual-call latencies.
pub fn summary(values: &[f64]) -> Result<Summary> {
    ensure!(
        !values.is_empty() && values.iter().all(|v| v.is_finite() && *v > 0.0),
        "测量值必须为非空、有限且大于零的样本"
    );
    let mut ordered = values.to_vec();
    ordered.sort_by(f64::total_cmp);
    let n = ordered.len();
    let median = if n.is_multiple_of(2) {
        ordered[n / 2 - 1] / 2.0 + ordered[n / 2] / 2.0
    } else {
        ordered[n / 2]
    };
    Ok(Summary {
        median_ns: median,
        p95_ns: ordered[(n * 95).div_ceil(100) - 1],
        min_ns: ordered[0],
        max_ns: ordered[n - 1],
    })
}

pub type Samples = BTreeMap<String, Vec<f64>>;

pub struct ParsedSamples {
    pub rounds: Vec<Samples>,
    /// Exact wall-clock batch durations; construction keeps its original format.
    pub batch_elapsed_ns: Option<Vec<BTreeMap<String, Vec<u64>>>>,
}

fn read_sample_plan(entry: &str, smoke: bool) -> (usize, usize) {
    let operations = match entry {
        "from_birth" | "from_parameters" | "retain_birth" | "retain_parameters" => 8_192,
        "star" | "palace_by_star" => 36_864,
        "birth_transformations" | "self_transformations" => 32_768,
        "names_hot" | "names_mixed" => 147_456,
        "lifecycle_birth" | "lifecycle_parameters" => 2_048,
        _ => 49_152,
    };
    let batches = if !smoke && matches!(entry, "palace_star" | "self_transformations") {
        16
    } else {
        1
    };
    (batches, operations * batches)
}

pub fn read_sampling(smoke: bool) -> Value {
    let mut sampling = json!({});
    for entry in Suite::Read.entries() {
        let (batches, operations) = read_sample_plan(entry, smoke);
        sampling[entry] =
            json!({"batches_per_sample": batches, "operations_per_sample": operations});
    }
    sampling
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Suite {
    Construction,
    Read,
}

impl Suite {
    pub fn entries(self) -> &'static [&'static str] {
        match self {
            Self::Construction => &["from_birth", "from_parameters"],
            Self::Read => &[
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
            ],
        }
    }

    pub fn parse(
        self,
        csv: &str,
        rounds: usize,
        samples: usize,
        smoke: bool,
    ) -> Result<ParsedSamples> {
        ensure!(rounds > 0 && samples > 0, "轮数与样本数必须大于零");
        match self {
            Self::Construction => {
                ensure!(rounds == 1, "建盘运行器每个进程只能输出一轮");
                let headers: Vec<_> = csv
                    .lines()
                    .filter(|row| row.starts_with("suite,"))
                    .collect();
                ensure!(
                    headers == ["suite,ziwei-construction-120,1,120"],
                    "建盘基准的套件、版本或语料数不匹配"
                );
                let mut result: Samples = self
                    .entries()
                    .iter()
                    .map(|entry| ((*entry).into(), vec![]))
                    .collect();
                for row in csv.lines().filter(|row| row.starts_with("sample,")) {
                    let fields: Vec<_> = row.split(',').collect();
                    ensure!(fields.len() == 4, "建盘样本列数错误");
                    let values = result.get_mut(fields[1]).context("未知建盘操作")?;
                    ensure!(
                        fields[2].parse::<usize>()? == values.len(),
                        "重复、缺失或乱序样本"
                    );
                    values.push(fields[3].parse().context("样本不是数字")?);
                }
                for values in result.values() {
                    ensure!(values.len() == samples, "基准样本数量不匹配");
                    summary(values)?;
                }
                Ok(ParsedSamples {
                    rounds: vec![result],
                    batch_elapsed_ns: None,
                })
            }
            Self::Read => {
                let mut rows = csv.lines();
                ensure!(
                    rows.next() == Some("suite,ziwei-read-path-512,2,512,1511464998"),
                    "读取基准的套件、版本、语料数或种子不匹配"
                );
                let mut result = Vec::with_capacity(rounds);
                let mut batch_elapsed_ns = Vec::with_capacity(rounds);
                for round in 0..rounds {
                    let mut current = Samples::new();
                    let mut durations = BTreeMap::new();
                    for offset in 0..self.entries().len() {
                        let entry = self.entries()[(round + offset) % self.entries().len()];
                        let (batches, operations) = read_sample_plan(entry, smoke);
                        let mut values = Vec::with_capacity(samples);
                        let mut elapsed_samples = Vec::with_capacity(samples);
                        for sample in 0..samples {
                            let row = rows.next().context("读取基准缺失样本")?;
                            let prefix = format!("sample,{entry},{round},{sample},");
                            let value = row
                                .strip_prefix(&prefix)
                                .context("未知、重复或乱序的读取样本")?;
                            let fields: Vec<_> = value.split(',').collect();
                            ensure!(fields.len() == 3, "读取样本必须包含批次数、操作数和总时长");
                            ensure!(
                                fields[0].parse::<usize>().context("批次数必须为整数")? == batches
                                    && fields[1].parse::<usize>().context("操作数必须为整数")?
                                        == operations,
                                "读取样本的批次数或操作数不符合当前采样协议：{entry}"
                            );
                            let elapsed_ns: u64 =
                                fields[2].parse().context("批时长必须为整数纳秒")?;
                            ensure!(elapsed_ns > 0, "批时长必须大于零");
                            values.push(elapsed_ns as f64 / operations as f64);
                            elapsed_samples.push(elapsed_ns);
                        }
                        summary(&values)?;
                        current.insert(entry.into(), values);
                        durations.insert(entry.into(), elapsed_samples);
                    }
                    result.push(current);
                    batch_elapsed_ns.push(durations);
                }
                ensure!(rows.next().is_none(), "读取基准包含额外数据");
                Ok(ParsedSamples {
                    rounds: result,
                    batch_elapsed_ns: Some(batch_elapsed_ns),
                })
            }
        }
    }

    pub fn ensure_comparable(self, current: &Value, baseline: &Value) -> Result<()> {
        let keys: &[&str] = match self {
            Self::Construction => &[
                "suite_id",
                "suite_version",
                "contract_fingerprint",
                "environment",
                "mode",
                "run_count",
            ],
            Self::Read => &[
                "suite_id",
                "suite_version",
                "contract_fingerprint",
                "environment",
                "mode",
                "round_count",
                "samples_per_round",
                "case_count_per_entry",
                "seed",
                "sampling",
            ],
        };
        for key in keys {
            ensure!(
                current.get(key).is_some() && current.get(key) == baseline.get(key),
                "拒绝跨契约或跨环境比较：{key} 不一致"
            );
        }
        ensure!(
            baseline["status"] == "baseline" && baseline["dirty"] == false,
            "只接受干净工作树的正式基线"
        );
        let summaries = baseline["summary"].as_object().context("基线缺少汇总")?;
        ensure!(
            summaries.len() == self.entries().len(),
            "基线缺少操作或包含未知操作"
        );
        for entry in self.entries() {
            for key in ["median_ns", "p95_ns"] {
                let value = summaries
                    .get(*entry)
                    .and_then(|s| s[key].as_f64())
                    .context("基线统计不是数字")?;
                summary(&[value])?;
            }
        }
        Ok(())
    }
}
