use crate::support::*;
use anyhow::{Context, Result, ensure};
use flate2::read::GzDecoder;
use serde_json::{Value, json};
use std::{
    collections::BTreeSet,
    ffi::OsString,
    fs::{self, File},
    io::{self, Read},
    path::{Component, Path},
    process::Command,
};

/// Unpack only regular files/directories under the expected crate root.
pub fn unpack_archive(reader: impl Read, destination: &Path, crate_root: &str) -> Result<()> {
    ensure!(
        fs::read_dir(destination)?.next().is_none(),
        "解包目标必须为空目录"
    );
    ensure!(
        Path::new(crate_root).components().count() == 1
            && matches!(
                Path::new(crate_root).components().next(),
                Some(Component::Normal(_))
            )
            && !crate_root.contains('\\'),
        "无效的包根目录"
    );
    let mut archive = tar::Archive::new(reader);
    let mut seen = BTreeSet::new();
    for entry in archive.entries()? {
        let mut entry = entry?;
        let relative = entry.path()?.into_owned();
        let kind = entry.header().entry_type();
        ensure!(
            relative
                .components()
                .all(|part| matches!(part, Component::Normal(_)))
                && relative.starts_with(crate_root)
                && !relative.to_string_lossy().contains('\\'),
            "归档路径越界：{}",
            relative.display()
        );
        ensure!(
            kind.is_file() || kind.is_dir(),
            "归档不接受链接或特殊文件：{}",
            relative.display()
        );
        ensure!(
            seen.insert(relative.clone()),
            "归档含重复路径：{}",
            relative.display()
        );
        let target = destination.join(relative);
        if kind.is_dir() {
            fs::create_dir_all(target)?;
        } else {
            fs::create_dir_all(target.parent().context("归档文件缺少父目录")?)?;
            io::copy(&mut entry, &mut File::create_new(target)?)?;
        }
    }
    Ok(())
}

fn run_cargo(commands: &mut Vec<Value>, cwd: &Path, args: &[OsString]) -> Result<String> {
    let result = Command::new("cargo").args(args).current_dir(cwd).output();
    let argv: Vec<_> = std::iter::once("cargo".to_owned())
        .chain(args.iter().map(|arg| arg.to_string_lossy().into_owned()))
        .collect();
    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            commands.push(json!({"command": argv, "cwd": cwd, "exit_code": output.status.code(), "stdout": stdout, "stderr": stderr}));
            ensure!(
                output.status.success(),
                "{argv:?} 失败：\n{stderr}\n{stdout}"
            );
            Ok(String::from_utf8(output.stdout).context("Cargo 输出不是 UTF-8")?)
        }
        Err(error) => {
            commands.push(
                json!({"command": argv, "cwd": cwd, "exit_code": null, "error": error.to_string()}),
            );
            Err(error).context("不能启动 Cargo")
        }
    }
}

fn args(values: &[&str]) -> Vec<OsString> {
    values.iter().map(OsString::from).collect()
}

fn quote_path(path: &Path) -> Result<String> {
    Ok(serde_json::to_string(
        path.to_str().context("消费端路径不是 UTF-8")?,
    )?)
}

fn verify(
    root: &Path,
    output: &Path,
    allow_dirty: bool,
    evidence: &mut Value,
    commands: &mut Vec<Value>,
) -> Result<()> {
    let metadata: Value = serde_json::from_str(&run_cargo(
        commands,
        root,
        &args(&["metadata", "--no-deps", "--format-version=1", "--locked"]),
    )?)?;
    let packages: Vec<_> = metadata["packages"]
        .as_array()
        .context("Cargo 元数据缺少包列表")?
        .iter()
        .filter(|package| package["name"] == "ziwei")
        .collect();
    ensure!(packages.len() == 1, "无法唯一定位 ziwei 包");
    let package = packages[0];
    let version = package["version"].as_str().context("缺少包版本")?;
    let edition = package["edition"].as_str().context("缺少包 edition")?;
    let target = output.join("build");
    let mut command = args(&["package", "-p", "ziwei", "--locked", "--target-dir"]);
    command.push(target.as_os_str().into());
    if allow_dirty {
        command.push("--allow-dirty".into());
    }
    run_cargo(commands, root, &command)?;
    let crate_root = format!("ziwei-{version}");
    let archive = target.join("package").join(format!("{crate_root}.crate"));
    evidence["archive"] = json!(archive);
    evidence["archive_sha256"] = json!(sha256(&fs::read(&archive)?));
    let isolated = tempfile::Builder::new()
        .prefix("ziwei-package-consumer-")
        .tempdir()?;
    unpack_archive(
        GzDecoder::new(File::open(&archive)?),
        isolated.path(),
        &crate_root,
    )?;
    let packed = isolated.path().join(&crate_root);
    let consumer = isolated.path().join("consumer");
    fs::create_dir(&consumer)?;
    let mut manifest = format!(
        "[package]\nname = \"ziwei-package-consumer\"\nversion = \"0.0.0\"\nedition = {}\npublish = false\n[workspace]\n[dependencies]\nziwei = {{ path = {} }}\n",
        serde_json::to_string(edition)?,
        quote_path(&packed)?
    );
    // The tests and example come from the archive, never from the source checkout.
    for name in ["public_api", "queries", "fixtures"] {
        manifest.push_str(&format!(
            "[[test]]\nname = \"{name}\"\npath = {}\n",
            quote_path(&packed.join("tests").join(format!("{name}.rs")))?
        ));
    }
    manifest.push_str(&format!(
        "[[bin]]\nname = \"inspect\"\npath = {}\n",
        quote_path(&packed.join("examples/inspect.rs"))?
    ));
    write_new(&consumer.join("Cargo.toml"), manifest.as_bytes())?;
    run_cargo(
        commands,
        &consumer,
        &args(&["generate-lockfile", "--offline"]),
    )?;
    evidence["consumer_lockfile"] = json!(fs::read_to_string(consumer.join("Cargo.lock"))?);
    let consumer_target = target.join("consumer");
    for release in [false, true] {
        let mut command = args(&["test", "--locked", "--offline", "--target-dir"]);
        command.push(consumer_target.as_os_str().into());
        if release {
            command.push("--release".into());
        }
        run_cargo(commands, &consumer, &command)?;
    }
    let mut command = args(&[
        "run",
        "--bin",
        "inspect",
        "--locked",
        "--offline",
        "--target-dir",
    ]);
    command.push(consumer_target.as_os_str().into());
    run_cargo(commands, &consumer, &command)?;
    isolated.close().context("不能清理临时消费端")?;
    Ok(())
}

pub fn run(args: Vec<OsString>) -> Result<bool> {
    if args == [OsString::from("--help")] || args == [OsString::from("-h")] {
        println!(
            "check-package [--allow-dirty]：校验实际打包产物，不发布；仅本地未提交验证使用 --allow-dirty"
        );
        return Ok(false);
    }
    ensure!(
        args.is_empty() || args == [OsString::from("--allow-dirty")],
        "check-package 只接受 --allow-dirty"
    );
    let root = root()?;
    let output = evidence_dir(&root.join("target/package-checks"))?;
    let mut evidence = json!({"observed_at": observed_at()?});
    let mut commands = Vec::new();
    let result = verify(
        &root,
        &output,
        !args.is_empty(),
        &mut evidence,
        &mut commands,
    );
    evidence["commands"] = json!(commands);
    evidence["status"] = json!(if result.is_ok() { "passed" } else { "failed" });
    if let Err(error) = &result {
        evidence["error"] = json!(format!("{error:#}"));
    }
    let record = output.join("result.json");
    write_json(&record, &evidence)?;
    result.with_context(|| format!("打包消费端校验失败，记录：{}", record.display()))?;
    println!(
        "实际打包产物：独立消费端 debug/release 公开测试和 inspect 示例通过；未发布。\n验证记录：{}",
        record.display()
    );
    Ok(false)
}
