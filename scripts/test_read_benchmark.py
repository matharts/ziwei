"""Exercise the read benchmark's command-line interface, not its parser internals."""

import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import read_benchmark


ROOT = Path(__file__).resolve().parents[1]


class ReadRecordContractTests(unittest.TestCase):
    def test_parser_requires_each_operation_once_in_the_declared_order(self):
        header = "suite,ziwei-read-path-512,1,512,1511464998"
        rows = [f"sample,{entry},0,0,10" for entry in read_benchmark.ENTRIES]
        valid = "\n".join([header, *rows])
        self.assertEqual(read_benchmark.parse_run(valid, 1, 1)[0]["star"], [10.0])
        for invalid in (valid.replace(",1,512", ",2,512"),
                        "\n".join([header, *rows[:-1]]), valid + "\n" + rows[0],
                        valid.replace("sample,star,0,0,10", "sample,star,0,0,nan"),
                        valid.replace("sample,star,0,0,10", "sample,star,0,1,10"),
                        valid + "\nunknown,row"):
            with self.subTest(invalid=invalid[-80:]):
                with self.assertRaises(ValueError):
                    read_benchmark.parse_run(invalid, 1, 1)

    def test_comparison_rejects_different_workloads_environments_and_invalid_baselines(self):
        baseline = {"suite_id": "ziwei-read-path-512", "suite_version": 1,
                    "contract_fingerprint": "same", "environment": {"runner_id": "fixed"},
                    "mode": "calibrate", "round_count": 20, "samples_per_round": 31,
                    "case_count_per_entry": 512, "seed": 1511464998,
                    "status": "baseline", "dirty": False,
                    "summary": {entry: {"median_ns": 10, "p95_ns": 12}
                                for entry in read_benchmark.ENTRIES}}
        current = dict(baseline, status="provisional", dirty=True)
        read_benchmark.ensure_comparable(current, baseline)
        for patch in ({"suite_id": "ziwei-construction-120"}, {"environment": {}},
                      {"contract_fingerprint": "changed"}, {"round_count": 1},
                      {"status": "provisional"}, {"dirty": True}, {"summary": {}},
                      {"samples_per_round": 1}):
            with self.subTest(patch=patch):
                with self.assertRaises(ValueError):
                    read_benchmark.ensure_comparable(current, dict(baseline, **patch))
        invalid = copy.deepcopy(baseline)
        invalid["summary"]["star"]["median_ns"] = float("nan")
        with self.assertRaises(ValueError):
            read_benchmark.ensure_comparable(current, invalid)

    def test_smoke_recorder_emits_reproducible_metadata_and_all_entries(self):
        result = subprocess.run([sys.executable, "scripts/read_benchmark.py", "smoke"],
                                cwd=ROOT, text=True, capture_output=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        prefix = "完整记录："
        self.assertIn(prefix, result.stdout)
        report_path = Path(result.stdout.strip().split(prefix)[-1])
        record = json.loads(report_path.read_text())
        self.assertEqual(record["status"], "smoke")
        self.assertEqual(record["suite_id"], "ziwei-read-path-512")
        self.assertEqual(record["environment"]["profile"], "release")
        self.assertEqual(record["round_count"], 1)
        self.assertEqual(set(record["summary"]), set(read_benchmark.ENTRIES))
        self.assertEqual(len(record["source_fingerprint"]), 64)
        self.assertEqual(len(record["contract_fingerprint"]), 64)
        self.assertTrue((report_path.parent / "raw.csv").is_file())


class ReadBenchmarkCliTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build = subprocess.run(
            ["cargo", "build", "-p", "ziwei", "--locked", "--example",
             "benchmark_read_path", "--message-format=json"],
            cwd=ROOT, text=True, capture_output=True, check=True,
        )
        artifacts = [json.loads(line) for line in build.stdout.splitlines()
                     if line.startswith("{")]
        cls.executable, = [item["executable"] for item in artifacts
                           if item.get("reason") == "compiler-artifact"
                           and item.get("target", {}).get("name") == "benchmark_read_path"
                           and item.get("executable")]

    def run_cli(self, *args):
        return subprocess.run([self.executable, *args], cwd=ROOT, text=True,
                              capture_output=True, timeout=30)

    def test_output_requires_a_path_before_running_the_workload(self):
        result = self.run_cli("--smoke", "--output")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("--output", result.stderr)

    def test_unknown_duplicate_and_conflicting_modes_are_rejected(self):
        for args in (("--smoke", "--unknown"), ("--smoke", "--smoke"),
                     ("--smoke", "--memory"), ("--smoke", "--output", ""),
                     ("--output", "--memory")):
            with self.subTest(args=args):
                result = self.run_cli(*args)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")

    def test_smoke_can_write_a_unicode_path_but_never_overwrites_it(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "读取样本.csv"
            first = self.run_cli("--smoke", "--output", str(output))
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(first.stdout, "")
            saved = output.read_bytes()
            self.assertEqual(len(saved.decode().splitlines()), 19)
            second = self.run_cli("--smoke", "--output", str(output))
            self.assertNotEqual(second.returncode, 0)
            self.assertEqual(output.read_bytes(), saved)


if __name__ == "__main__":
    unittest.main()
