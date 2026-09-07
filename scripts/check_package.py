#!/usr/bin/env python3
"""Verify a real .crate through an isolated Rust consumer (Python 3.12+). Never publish."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import uuid


ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-dirty", action="store_true", help="仅用于本地未提交工作树的验证")
    args = parser.parse_args()
    record_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    output = ROOT / "target/package-checks" / record_id
    output.mkdir(parents=True, exist_ok=False)
    evidence = {"observed_at": datetime.now(timezone.utc).isoformat(), "commands": []}

    def run(command, cwd):
        result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
        evidence["commands"].append({"command": command, "cwd": str(cwd), "exit_code": result.returncode,
                                     "stdout": result.stdout, "stderr": result.stderr})
        if result.returncode:
            raise RuntimeError(f"{command}:\n{result.stderr}\n{result.stdout}")
        return result.stdout

    try:
        metadata = json.loads(run(["cargo", "metadata", "--no-deps", "--format-version=1", "--locked"], ROOT))
        package, = [item for item in metadata["packages"] if item["name"] == "ziwei"]
        target = output / "build"
        run(["cargo", "package", "-p", "ziwei", "--locked", "--target-dir", str(target),
             *(["--allow-dirty"] if args.allow_dirty else [])], ROOT)
        archive_path = target / "package" / f"ziwei-{package['version']}.crate"
        evidence["archive"] = str(archive_path)
        evidence["archive_sha256"] = hashlib.sha256(archive_path.read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory(prefix="ziwei-package-consumer-") as directory:
            isolated = Path(directory)
            with tarfile.open(archive_path) as archive:
                archive.extractall(isolated, filter="data")
            packed = isolated / f"ziwei-{package['version']}"
            consumer = isolated / "consumer"
            consumer.mkdir()
            quote = lambda value: json.dumps(str(value))
            manifest = ["[package]", 'name = "ziwei-package-consumer"', 'version = "0.0.0"',
                        f"edition = {quote(package['edition'])}", "publish = false", "[workspace]",
                        "[dependencies]", f"ziwei = {{ path = {quote(packed)} }}"]
            # Exercise only public seams, reusing tests and fixtures from the archive itself.
            for name in ("public_api", "queries", "fixtures"):
                manifest += ["[[test]]", f"name = {quote(name)}", f"path = {quote(packed / 'tests' / (name + '.rs'))}"]
            manifest += ["[[bin]]", 'name = "inspect"', f"path = {quote(packed / 'examples/inspect.rs')}"]
            (consumer / "Cargo.toml").write_text("\n".join(manifest) + "\n", encoding="utf-8")
            run(["cargo", "generate-lockfile", "--offline"], consumer)
            for profile in ([], ["--release"]):
                run(["cargo", "test", "--locked", "--offline", "--target-dir", str(target / "consumer"), *profile], consumer)
            run(["cargo", "run", "--bin", "inspect", "--locked", "--offline", "--target-dir", str(target / "consumer")], consumer)
            evidence["consumer_lockfile"] = (consumer / "Cargo.lock").read_text()
        evidence["status"] = "passed"
    except Exception:
        evidence["status"] = "failed"
        raise
    finally:
        (output / "result.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("实际打包产物：独立消费端 debug/release 公开测试和 inspect 示例通过；未发布。")
    print(f"验证记录：{output / 'result.json'}")


if __name__ == "__main__":
    main()
