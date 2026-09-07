use anyhow::{Result, bail};
use std::env;
use ziwei_xtask::{benchmark::Suite, package, record};

fn run() -> Result<bool> {
    let mut args = env::args_os().skip(1);
    match args.next().as_deref().and_then(|value| value.to_str()) {
        Some("benchmark") => record::run(Suite::Construction, args.collect()),
        Some("benchmark-read") => record::run(Suite::Read, args.collect()),
        Some("check-package") => package::run(args.collect()),
        Some("--help" | "-h") => {
            println!(
                "通过 mise 运行：benchmark:smoke / benchmark:calibrate [--runs 20] / benchmark:read:smoke / benchmark:read:calibrate / check:package [--allow-dirty]\n校准选项：--record-baseline 或 --baseline <记录路径> [--max-regression <比例>]"
            );
            Ok(false)
        }
        _ => bail!("未知工具命令；使用 --help 查看用法"),
    }
}

fn main() -> std::process::ExitCode {
    match run() {
        Ok(false) => std::process::ExitCode::SUCCESS,
        Ok(true) => std::process::ExitCode::FAILURE,
        Err(error) => {
            eprintln!("xtask: {error:#}");
            std::process::ExitCode::FAILURE
        }
    }
}
