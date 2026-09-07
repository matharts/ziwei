import copy
import unittest

import benchmark


class BenchmarkContractTests(unittest.TestCase):
    def test_percentiles_and_validation(self):
        self.assertEqual(benchmark.summary([3, 1, 2])["median_ns"], 2)
        self.assertEqual(benchmark.percentile(list(range(1, 21)), .95), 19)
        for values in ([], [0], [-1], [float("nan")], [float("inf")]):
            with self.assertRaises(ValueError):
                benchmark.summary(values)

    def test_parser_rejects_wrong_suite_count_order_and_value(self):
        valid = "suite,ziwei-construction-120,1,120\nsample,from_birth,0,10\nsample,from_parameters,0,12"
        self.assertEqual(benchmark.parse_run(valid, 1)["from_birth"], [10])
        for invalid in (valid.replace(",1,120", ",2,120"), valid.replace("birth,0", "birth,1"),
                        valid.replace(",12", ",nan"), valid + "\nsample,from_birth,0,10",
                        valid.replace("from_parameters", "other"), valid.splitlines()[0]):
            with self.assertRaises(ValueError):
                benchmark.parse_run(invalid, 1)

    def test_comparison_rejects_dirty_smoke_mismatched_contract_and_runner(self):
        baseline = {"suite_id": "test", "suite_version": 1, "contract_fingerprint": "abc",
                    "environment": {"runner_id": "fixed"}, "mode": "calibrate",
                    "run_count": 20, "status": "baseline", "dirty": False,
                    "summary": {case: {"median_ns": 10.0} for case in benchmark.CASES}}
        current = copy.deepcopy(baseline)
        current.update(status="provisional", dirty=True)
        benchmark.ensure_comparable(current, baseline)
        for key, value in (("suite_id", "other"), ("suite_version", 2),
                           ("contract_fingerprint", "different"), ("environment", {}),
                           ("mode", "smoke"), ("run_count", 2)):
            altered = dict(current, **{key: value})
            with self.assertRaises(ValueError):
                benchmark.ensure_comparable(altered, baseline)
        for patch in ({"dirty": True}, {"status": "provisional"}):
            with self.assertRaises(ValueError):
                benchmark.ensure_comparable(current, dict(baseline, **patch))
        for value in (0, -1, float("nan"), float("inf")):
            broken = copy.deepcopy(baseline)
            broken["summary"]["from_birth"]["median_ns"] = value
            with self.assertRaises(ValueError):
                benchmark.ensure_comparable(current, broken)


if __name__ == "__main__":
    unittest.main()
