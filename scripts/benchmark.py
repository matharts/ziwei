#!/usr/bin/env python3
"""Construction-only benchmark recorder. Python stdlib; invoke through mise tasks."""

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import statistics
import subprocess
import sys
import uuid
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
CASES = ("from_birth", "from_parameters")
CONTRACT_FILES = (
    "crates/ziwei/benches/suite.rs",
    "crates/ziwei/benches/construction.rs",
    "scripts/benchmark.py",
    "Cargo.toml",
    "crates/ziwei/Cargo.toml",
)


def command(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def fingerprint(paths):
    digest = hashlib.sha256()
    for relative in sorted(paths):
        digest.update(relative.encode() + b"\0" + (ROOT / relative).read_bytes() + b"\0")
    return digest.hexdigest()


def source_paths():
    paths = [str(path.relative_to(ROOT)) for path in (ROOT / "crates/ziwei/src").rglob("*.rs")]
    return paths + ["Cargo.lock"]


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)]


def summary(values):
    if not values or any(not math.isfinite(v) or v <= 0 for v in values):
        raise ValueError("测量值必须为非空、有限且大于零的样本")
    return {"median_ns": statistics.median(values), "p95_ns": percentile(values, .95),
            "min_ns": min(values), "max_ns": max(values)}


def parse_run(output, samples):
    rows = output.splitlines()
    headers = [row for row in rows if row.startswith("suite,")]
    if headers != ["suite,ziwei-construction-120,1,120"]:
        raise ValueError("基准 suite_id / suite_version / case_count 不匹配")
    result = {case: [] for case in CASES}
    for row in rows:
        if not row.startswith("sample,"):
            continue
        _, case, index, value = row.split(",")
        if case not in result or int(index) != len(result[case]):
            raise ValueError("未知基准或重复、缺失、乱序样本")
        result[case].append(float(value))
    if any(len(values) != samples for values in result.values()):
        raise ValueError("基准样本数量不匹配")
    for values in result.values():
        summary(values)
    return result


def identity():
    cpu = platform.processor()
    if sys.platform == "darwin":
        cpu = command("sysctl", "-n", "machdep.cpu.brand_string")
    elif Path("/proc/cpuinfo").exists():
        cpu = next((line.split(":", 1)[1].strip() for line in
                    Path("/proc/cpuinfo").read_text().splitlines()
                    if line.startswith("model name")), cpu)
    return {"runner_id": os.environ.get("ZIWEI_BENCH_RUNNER", platform.node()),
            "system": platform.platform(), "machine": platform.machine(), "cpu": cpu,
            "rustc": command("rustc", "-Vv"),
            "rustflags": os.environ.get("RUSTFLAGS", ""),
            "encoded_rustflags": os.environ.get("CARGO_ENCODED_RUSTFLAGS", ""),
            "cargo_build_env": {key: value for key, value in sorted(os.environ.items())
                                if key.startswith("CARGO_PROFILE_BENCH_") or key in
                                ("CARGO_BUILD_TARGET", "CARGO_BUILD_RUSTFLAGS", "RUSTC", "RUSTC_WRAPPER", "RUSTC_WORKSPACE_WRAPPER")
                                or (key.startswith("CARGO_TARGET_") and key.endswith("_RUSTFLAGS"))},
            "repository_cargo_config": {
                name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                for name in (".cargo/config", ".cargo/config.toml") if (ROOT / name).exists()},
            "profile": "bench"}


def ensure_comparable(current, baseline):
    for key in ("suite_id", "suite_version", "contract_fingerprint", "environment", "mode", "run_count"):
        if current[key] != baseline[key]:
            raise ValueError(f"拒绝跨契约或跨环境比较：{key} 不一致")
    if baseline.get("status") != "baseline" or baseline.get("dirty"):
        raise ValueError("只接受干净工作树的正式基线")
    for case in CASES:
        summary([baseline["summary"][case]["median_ns"]])


def write_json(path, value):
    # Exclusive create prevents silently replacing earlier measurement evidence.
    with path.open("x", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("smoke", "calibrate"))
    parser.add_argument("--runs", type=int, default=20)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--record-baseline", action="store_true")
    parser.add_argument("--max-regression", type=float, help="人工审定的退化比例，例如 0.15；不自动采用建议值")
    args = parser.parse_args()
    if not 2 <= args.runs <= 1000:
        parser.error("--runs 必须在 2..=1000；校准至少需要两轮")
    if args.max_regression is not None and (not args.baseline or not math.isfinite(args.max_regression) or args.max_regression < 0):
        parser.error("--max-regression 需要 --baseline 和有限非负比例")
    if args.mode == "smoke" and (args.baseline or args.record_baseline):
        parser.error("smoke 不能记录或比较正式基线")
    if args.record_baseline and args.baseline:
        parser.error("记录与比较基线应当分开执行")
    dirty = bool(command("git", "status", "--porcelain", "--untracked-files=normal"))
    if args.record_baseline and (dirty or not os.environ.get("ZIWEI_BENCH_RUNNER")):
        parser.error("正式基线要求干净工作树及显式、稳定的 ZIWEI_BENCH_RUNNER")
    started = datetime.now(timezone.utc)
    report = {"record_id": started.strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:12],
              "observed_at": started.isoformat(), "suite_id": "ziwei-construction-120",
              "suite_version": 1, "contract_fingerprint": fingerprint(CONTRACT_FILES),
              "environment": identity(), "git_revision": command("git", "rev-parse", "HEAD"),
              "dirty": dirty, "mode": args.mode,
              "status": "baseline" if args.record_baseline else ("smoke" if args.mode == "smoke" else "provisional"),
              "source_fingerprint": fingerprint(source_paths()),
              "case_count_per_entry": 120, "run_count": 1 if args.mode == "smoke" else args.runs, "runs": []}
    baseline = json.loads(args.baseline.read_text()) if args.baseline else None
    if baseline:
        ensure_comparable(report, baseline)
    output_dir = ROOT / "target/benchmarks" / report["record_id"]
    output_dir.mkdir(parents=True, exist_ok=False)
    compile_output = command("cargo", "bench", "-p", "ziwei", "--bench", "construction", "--locked", "--no-run", "--message-format=json")
    executables = [item["executable"] for line in compile_output.splitlines() if line.startswith("{")
                   for item in [json.loads(line)] if item.get("reason") == "compiler-artifact"
                   and item.get("target", {}).get("name") == "construction" and item.get("executable")]
    if len(executables) != 1:
        raise ValueError("无法唯一定位建盘基准可执行文件")
    for i in range(1 if args.mode == "smoke" else args.runs):
        raw = command(executables[0], *( ["--smoke"] if args.mode == "smoke" else [] ))
        samples = parse_run(raw, 1 if args.mode == "smoke" else 31)
        run = {"run": i + 1, "samples_ns_per_chart": samples,
               "summary": {case: summary(values) for case, values in samples.items()}}
        write_json(output_dir / f"run-{i + 1:03}.json", run)
        report["runs"].append(run)
    # Refuse evidence if measured source or contract changed during the run.
    if report["contract_fingerprint"] != fingerprint(CONTRACT_FILES) or report["source_fingerprint"] != fingerprint(source_paths()) or report["environment"] != identity():
        raise ValueError("测量期间代码发生变化；逐轮原始记录已保留，但不生成有效报告")
    if args.record_baseline and (command("git", "rev-parse", "HEAD") != report["git_revision"] or command("git", "status", "--porcelain")):
        raise ValueError("测量期间 Git 状态改变，不能记录正式基线")
    report["summary"] = {}
    lines = ["# 建盘基准测量", "", f"记录：{report['record_id']}", f"状态：{report['status']}；dirty={dirty}",
             "", "单位为每批建盘平均 ns/chart；P95 是批平均值的分位数，不是单次调用尾延迟。",
             "计时包含命盘构建和释放，不包含输入校验、日期换算、输出格式化及查询。", ""]
    regressions = []
    for case in CASES:
        values = [value for run in report["runs"] for value in run["samples_ns_per_chart"][case]]
        medians = [run["summary"][case]["median_ns"] for run in report["runs"]]
        result = summary(values)
        result["cross_run_cv"] = statistics.pstdev(medians) / statistics.mean(medians)
        result["suggested_regression_limit"] = None if args.mode == "smoke" else max(.05, 3 * result["cross_run_cv"])
        report["summary"][case] = result
        lines.append(f"- {case}: median {result['median_ns']:.1f} ns，P95 {result['p95_ns']:.1f} ns。")
        if args.mode != "smoke":
            lines.append(f"  跨轮 CV {result['cross_run_cv']:.2%}；待审阈值 {result['suggested_regression_limit']:.2%}。")
        if baseline:
            ratio = result["median_ns"] / baseline["summary"][case]["median_ns"] - 1
            result["median_change"] = ratio
            lines.append(f"  相对基线 median 变化：{ratio:+.2%}。")
            if args.max_regression is not None and ratio > args.max_regression:
                regressions.append(case)
    lines += ["", "建议阈值仅供人工审定，不能自动成为性能承诺。共享 CI 只跑 smoke。",
              "正式基线须在固定机器、稳定 runner ID、干净工作树下另行记录。"]
    write_json(output_dir / "report.json", report)
    (output_dir / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    # Local data visualization: common scale, per-run medians, no external resources.
    maximum = max(run["summary"][case]["median_ns"] for run in report["runs"] for case in CASES)
    height = 70 + 22 * len(report["runs"]) * len(CASES)
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="{height}" viewBox="0 0 900 {height}">',
           '<rect width="100%" height="100%" fill="white"/>', '<text x="15" y="25">Construction: per-run median ns/chart (common scale)</text>']
    for i, (run, case) in enumerate((run, case) for run in report["runs"] for case in CASES):
        value = run["summary"][case]["median_ns"]
        y = 45 + i * 22
        svg += [f'<text x="15" y="{y + 12}" font-size="12">{case} #{run["run"]}</text>',
                f'<rect x="180" y="{y}" width="{550 * value / maximum:.1f}" height="15" fill="{"#3659a2" if case == CASES[0] else "#19745c"}"/>',
                f'<text x="750" y="{y + 12}" font-size="12">{value:.1f} ns</text>']
    svg.append("</svg>")
    (output_dir / "medians.svg").write_text("\n".join(svg), encoding="utf-8")
    print("\n".join(lines))
    print(f"\n完整报告：{output_dir / 'report.json'}")
    return 1 if regressions else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        sys.exit(f"benchmark: {error}")
