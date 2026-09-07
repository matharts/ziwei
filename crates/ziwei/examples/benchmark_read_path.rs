//! 独立读路径基准；不改变 construction-120 的合同和记录器。
#[path = "../benches/read_path.rs"]
mod read_path;
read_path::define_workload!(current, ziwei);

use std::{ffi::OsString, io::Write};

#[derive(Default)]
struct Options {
    smoke: bool,
    memory: bool,
    output: Option<OsString>,
}

impl Options {
    fn parse(mut args: impl Iterator<Item = OsString>) -> std::io::Result<Self> {
        let mut options = Self::default();
        while let Some(arg) = args.next() {
            match arg.to_str() {
                Some("--smoke") if !options.smoke => options.smoke = true,
                Some("--memory") if !options.memory => options.memory = true,
                Some("--output") if options.output.is_none() => {
                    let path = args
                        .next()
                        .ok_or_else(|| invalid("--output 需要文件路径"))?;
                    if path.is_empty() || path.to_str().is_some_and(|value| value.starts_with("--"))
                    {
                        return Err(invalid("--output 需要文件路径，不能是其他选项"));
                    }
                    options.output = Some(path);
                }
                _ => {
                    return Err(invalid(format!(
                        "未知或重复的参数：{}",
                        arg.to_string_lossy()
                    )));
                }
            }
        }
        if options.memory && (options.smoke || options.output.is_some()) {
            return Err(invalid("--memory 不能与 --smoke 或 --output 同用"));
        }
        Ok(options)
    }
}

fn invalid(message: impl Into<String>) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidInput, message.into())
}

fn main() -> std::io::Result<()> {
    let options = Options::parse(std::env::args_os().skip(1))?;
    let workload = current::Workload::new();
    workload.validate();
    if options.memory {
        workload.hold_many(32_768);
        return Ok(());
    }
    let output: Box<dyn Write> = if let Some(path) = options.output {
        Box::new(std::fs::File::create_new(path)?)
    } else {
        Box::new(std::io::stdout())
    };
    let mut output = std::io::BufWriter::new(output);
    let smoke = options.smoke;
    let rounds = if smoke { 1 } else { 20 };
    let samples = if smoke { 1 } else { 31 };
    writeln!(
        output,
        "suite,{},{},{},{}",
        current::ID,
        current::VERSION,
        current::CASES,
        current::SEED
    )?;
    for entry in 0..current::ENTRIES.len() {
        for _ in 0..5 {
            workload.execute(entry);
        }
    }
    for round in 0..rounds {
        for offset in 0..current::ENTRIES.len() {
            let entry = (round + offset) % current::ENTRIES.len();
            for sample in 0..samples {
                let start = std::time::Instant::now();
                let count = workload.execute(entry);
                let elapsed = start.elapsed().as_nanos() as f64 / count as f64;
                writeln!(
                    output,
                    "sample,{},{round},{sample},{elapsed:.6}",
                    current::ENTRIES[entry]
                )?;
            }
        }
    }
    output.flush()
}
