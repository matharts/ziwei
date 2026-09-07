#!/usr/bin/env python3
"""Record the independent read-path-512 workload; never compare it to construction-120."""

import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import math
import os
from pathlib import Path
import statistics
import subprocess
import sys
import uuid

import benchmark


ENTRIES = (
    "from_birth", "from_parameters", "retain_birth", "retain_parameters", "star",
    "palace_by_star", "palace_star", "birth_transformations", "self_transformations",
    "palace_transformations", "decade", "decade_years", "yearly", "names_hot",
    "names_mixed", "lifecycle_birth", "lifecycle_parameters", "palace_by_name",
)
SUITE_ID = "ziwei-read-path-512"
SUITE_VERSION = 1
CASE_COUNT = 512
SEED = 1511464998
ROOT = benchmark.ROOT
CONTRACT_FILES = (
    "crates/ziwei/benches/read_path.rs",
    "crates/ziwei/examples/benchmark_read_path.rs",
    "scripts/read_benchmark.py", "scripts/benchmark.py",
    "Cargo.toml", "crates/ziwei/Cargo.toml",
)


def parse_run(output, rounds, samples):
    """Validate the complete CSV contract, including the per-round rotation."""
    rows = iter(csv.reader(io.StringIO(output)))
    expected_header = ["suite", SUITE_ID, str(SUITE_VERSION), str(CASE_COUNT), str(SEED)]
    if next(rows, None) != expected_header:
        raise ValueError("读取基准的套件、版本、语料数或种子不匹配")
    result = []
    for round_index in range(rounds):
        current = {}
        for offset in range(len(ENTRIES)):
            entry = ENTRIES[(round_index + offset) % len(ENTRIES)]
            values = []
            for sample in range(samples):
                row = next(rows, [])
                if len(row) != 5 or row[:4] != ["sample", entry, str(round_index), str(sample)]:
                    raise ValueError("读取基准包含未知、重复、缺失或乱序样本")
                values.append(float(row[4]))
            benchmark.summary(values)
            current[entry] = values
        result.append(current)
    if next(rows, None) is not None:
        raise ValueError("读取基准包含额外数据")
    return result


def environment():
    result = benchmark.identity()
    result["profile"] = "release"
    result["cargo"] = benchmark.command("cargo", "-V")
    result["cargo_build_env"] = {
        key: value for key, value in result["cargo_build_env"].items()
        if not key.startswith("CARGO_PROFILE_BENCH_")
    }
    result["cargo_build_env"].update({
        key: value for key, value in sorted(os.environ.items())
        if key.startswith("CARGO_PROFILE_RELEASE_")
    })
    # Cargo also reads ancestor and user configuration. Store hashes, never contents.
    cargo_home = Path(os.environ.get("CARGO_HOME", Path.home() / ".cargo"))
    locations = [cargo_home, *(parent / ".cargo" for parent in (ROOT, *ROOT.parents))]
    result["cargo_configs"] = {
        str(path): hashlib.sha256(path.read_bytes()).hexdigest()
        for directory in locations for name in ("config", "config.toml")
        if (path := directory / name).is_file()
    }
    return result


def ensure_comparable(current, baseline):
    for key in ("suite_id", "suite_version", "contract_fingerprint", "environment",
                "mode", "round_count", "samples_per_round", "case_count_per_entry", "seed"):
        if key not in current or key not in baseline or current[key] != baseline[key]:
            raise ValueError(f"拒绝跨负载或跨环境比较：{key} 不一致")
    if baseline.get("status") != "baseline" or baseline.get("dirty") is not False:
        raise ValueError("只接受干净工作树的正式读取基线")
    summaries = baseline.get("summary")
    if not isinstance(summaries, dict) or set(summaries) != set(ENTRIES):
        raise ValueError("读取基线缺少操作或包含未知操作")
    for entry in ENTRIES:
        for key in ("median_ns", "p95_ns"):
            value = summaries[entry].get(key) if isinstance(summaries[entry], dict) else None
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
                raise ValueError(f"读取基线的 {entry}.{key} 必须为有限正数")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("smoke", "calibrate"))
    baseline_options = parser.add_mutually_exclusive_group()
    baseline_options.add_argument("--baseline", type=Path)
    baseline_options.add_argument("--record-baseline", action="store_true")
    parser.add_argument("--max-regression", type=float, help="经人工审定的退化比例，不默认启用")
    args = parser.parse_args()
    if args.mode == "smoke" and (args.baseline or args.record_baseline):
        parser.error("smoke 不能记录或比较正式基线")
    if args.max_regression is not None and (
        not args.baseline or not math.isfinite(args.max_regression) or args.max_regression < 0
    ):
        parser.error("--max-regression 需要 --baseline 和有限非负比例")
    dirty = bool(benchmark.command("git", "status", "--porcelain", "--untracked-files=normal"))
    if args.record_baseline and (dirty or not os.environ.get("ZIWEI_BENCH_RUNNER", "").strip()):
        parser.error("正式基线要求干净工作树及显式、稳定的 ZIWEI_BENCH_RUNNER")
    observed = datetime.now(timezone.utc)
    record = {
        "record_id": observed.strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:12],
        "observed_at": observed.isoformat(), "suite_id": SUITE_ID, "suite_version": SUITE_VERSION,
        "case_count_per_entry": CASE_COUNT, "seed": SEED, "mode": args.mode,
        "round_count": 1 if args.mode == "smoke" else 20,
        "samples_per_round": 1 if args.mode == "smoke" else 31,
        "status": "baseline" if args.record_baseline else ("smoke" if args.mode == "smoke" else "provisional"),
        "dirty": dirty, "git_revision": benchmark.command("git", "rev-parse", "HEAD"),
        "source_fingerprint": benchmark.fingerprint(benchmark.source_paths()),
        "contract_fingerprint": benchmark.fingerprint(CONTRACT_FILES), "environment": environment(),
    }
    baseline = json.loads(args.baseline.read_text()) if args.baseline else None
    if baseline is not None:
        ensure_comparable(record, baseline)
    output = ROOT / "target/benchmarks/read-path" / record["record_id"]
    output.mkdir(parents=True, exist_ok=False)
    build = benchmark.command("cargo", "build", "--release", "-p", "ziwei", "--locked",
                              "--example", "benchmark_read_path", "--message-format=json")
    artifacts = [json.loads(line) for line in build.splitlines() if line.startswith("{")]
    executables = [item["executable"] for item in artifacts
                   if item.get("reason") == "compiler-artifact"
                   and item.get("target", {}).get("name") == "benchmark_read_path"
                   and item.get("executable")]
    if len(executables) != 1:
        raise ValueError("无法唯一定位读取基准可执行文件")
    raw = benchmark.command(executables[0], *(["--smoke"] if args.mode == "smoke" else []))
    with (output / "raw.csv").open("x", encoding="utf-8") as handle:
        handle.write(raw + "\n")
    rounds = parse_run(raw, record["round_count"], record["samples_per_round"])
    if (record["source_fingerprint"] != benchmark.fingerprint(benchmark.source_paths())
            or record["contract_fingerprint"] != benchmark.fingerprint(CONTRACT_FILES)
            or record["environment"] != environment()):
        raise ValueError("测量期间源码、合同或环境改变；保留 raw.csv，不生成有效记录")
    if args.record_baseline and (benchmark.command("git", "status", "--porcelain")
                                or benchmark.command("git", "rev-parse", "HEAD") != record["git_revision"]):
        raise ValueError("测量期间 Git 状态改变，不能记录正式基线")
    record["summary"] = {}
    record["rounds"] = rounds
    regressions = []
    for entry in ENTRIES:
        medians = [statistics.median(row[entry]) for row in rounds]
        result = benchmark.summary([value for row in rounds for value in row[entry]])
        result["cross_round_cv"] = statistics.pstdev(medians) / statistics.mean(medians)
        if baseline is not None:
            result["median_change"] = result["median_ns"] / baseline["summary"][entry]["median_ns"] - 1
            if args.max_regression is not None and result["median_change"] > args.max_regression:
                regressions.append(entry)
        record["summary"][entry] = result
    record["regressions"] = regressions
    benchmark.write_json(output / "record.json", record)
    print(f"状态：{record['status']}；{len(ENTRIES)} 项操作；P95 为批平均值分位数，不是单次调用尾延迟。")
    print(f"完整记录：{output / 'record.json'}")
    return 1 if regressions else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, KeyError, TypeError, OSError, subprocess.CalledProcessError) as error:
        sys.exit(f"read benchmark: {error}")
