use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    env,
    ffi::OsStr,
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

pub fn root() -> Result<PathBuf> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .context("无法定位仓库根目录")
}

pub fn command(root: &Path, program: impl AsRef<OsStr>, args: &[&str]) -> Result<String> {
    let output = Command::new(&program)
        .args(args)
        .current_dir(root)
        .output()
        .with_context(|| format!("无法执行 {:?}", program.as_ref()))?;
    ensure!(
        output.status.success(),
        "命令 {:?} {args:?} 失败：{}",
        program.as_ref(),
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(String::from_utf8(output.stdout)
        .context("命令输出不是 UTF-8")?
        .trim()
        .to_owned())
}

/// Record build, measurement and verification outputs before interpreting them.
pub struct CommandLog<'a> {
    root: &'a Path,
    output: &'a Path,
    pub stage: &'static str,
    pub commands: Vec<Value>,
}

impl<'a> CommandLog<'a> {
    pub fn new(root: &'a Path, output: &'a Path) -> Self {
        Self {
            root,
            output,
            stage: "build",
            commands: Vec::new(),
        }
    }

    pub fn run(
        &mut self,
        stage: &'static str,
        program: impl AsRef<OsStr>,
        args: &[&str],
        stdout_file: &str,
    ) -> Result<String> {
        self.stage = stage;
        let program = program.as_ref();
        let stderr_file = format!("{stdout_file}.stderr");
        let argv: Vec<_> = std::iter::once(program.to_string_lossy().into_owned())
            .chain(args.iter().map(|arg| (*arg).to_owned()))
            .collect();
        let result = Command::new(program)
            .args(args)
            .current_dir(self.root)
            .output();
        let output = match result {
            Ok(output) => output,
            Err(error) => {
                self.commands
                    .push(json!({"stage": stage, "command": argv, "cwd": self.root,
                    "exit_code": null, "error": error.to_string()}));
                return Err(error).with_context(|| format!("无法启动 {program:?}"));
            }
        };
        self.commands.push(json!({"stage": stage, "command": argv, "cwd": self.root,
            "exit_code": output.status.code(), "stdout_file": stdout_file, "stderr_file": stderr_file}));
        write_new(&self.output.join(stdout_file), &output.stdout)?;
        write_new(&self.output.join(stderr_file), &output.stderr)?;
        ensure!(
            output.status.success(),
            "命令 {program:?} 失败：{}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout).context("命令输出不是 UTF-8")
    }

    pub fn build(&mut self, args: &[&str], target: &str) -> Result<PathBuf> {
        let output = self.run("build", "cargo", args, "build.jsonl")?;
        let mut executables = Vec::new();
        for line in output.lines().filter(|line| line.starts_with('{')) {
            let value: Value = serde_json::from_str(line).context("Cargo JSON 无效")?;
            if value["reason"] == "compiler-artifact"
                && value["target"]["name"] == target
                && let Some(path) = value["executable"].as_str()
            {
                executables.push(PathBuf::from(path));
            }
        }
        ensure!(executables.len() == 1, "无法唯一定位 {target} 可执行文件");
        Ok(executables.remove(0))
    }

    pub fn verify(&mut self, program: &str, args: &[&str]) -> Result<String> {
        let stdout_file = format!("verify-{:03}.stdout", self.commands.len() + 1);
        self.run("verify", program, args, &stdout_file)
            .map(|output| output.trim().to_owned())
    }

    pub fn verify_environment(&mut self, profile: &str) -> Result<Value> {
        collect_environment(self.root, profile, |program, args| {
            self.verify(program, args)
        })
    }
}

pub fn write_new(path: &Path, bytes: &[u8]) -> Result<()> {
    File::create_new(path)
        .with_context(|| format!("不能独占创建 {}", path.display()))?
        .write_all(bytes)
        .with_context(|| format!("不能写入 {}", path.display()))
}

pub fn write_json(path: &Path, value: &Value) -> Result<()> {
    let mut bytes = serde_json::to_vec_pretty(value)?;
    bytes.push(b'\n');
    write_new(path, &bytes)
}

pub fn observed_at() -> Result<String> {
    Ok(OffsetDateTime::now_utc().format(&Rfc3339)?)
}

/// Keep evidence, including partial failure data; only scratch consumers use RAII deletion.
pub fn evidence_dir(parent: &Path) -> Result<PathBuf> {
    fs::create_dir_all(parent)?;
    let prefix = format!("{}-", OffsetDateTime::now_utc().unix_timestamp());
    Ok(tempfile::Builder::new()
        .prefix(&prefix)
        .tempdir_in(parent)?
        .keep())
}

pub fn sha256(bytes: &[u8]) -> String {
    hex_digest(&Sha256::digest(bytes))
}

fn hex_digest(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        output.push(char::from(HEX[usize::from(byte >> 4)]));
        output.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    output
}

pub fn rust_files(root: &Path, directory: &Path) -> Result<Vec<String>> {
    let mut paths = Vec::new();
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            paths.extend(rust_files(root, &path)?);
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            paths.push(
                path.strip_prefix(root)?
                    .to_str()
                    .context("源码路径不是 UTF-8")?
                    .replace('\\', "/"),
            );
        }
    }
    Ok(paths)
}

pub fn fingerprint(root: &Path, mut paths: Vec<String>) -> Result<String> {
    paths.sort();
    paths.dedup();
    let mut digest = Sha256::new();
    for relative in paths {
        digest.update(relative.as_bytes());
        digest.update([0]);
        digest.update(
            fs::read(root.join(&relative))
                .with_context(|| format!("无法读取指纹文件 {relative}"))?,
        );
        digest.update([0]);
    }
    Ok(hex_digest(&digest.finalize()))
}

pub fn source_fingerprint(root: &Path) -> Result<String> {
    let mut paths = rust_files(root, &root.join("crates/ziwei/src"))?;
    paths.push("Cargo.lock".into());
    fingerprint(root, paths)
}

pub fn environment(root: &Path, profile: &str) -> Result<Value> {
    collect_environment(root, profile, |program, args| command(root, program, args))
}

fn collect_environment(
    root: &Path,
    profile: &str,
    mut probe: impl FnMut(&str, &[&str]) -> Result<String>,
) -> Result<Value> {
    let hostname = probe("hostname", &[])?;
    let system = if cfg!(windows) {
        probe("cmd", &["/C", "ver"])?
    } else {
        probe("uname", &["-sr"])?
    };
    let cpu = if cfg!(target_os = "macos") {
        probe("sysctl", &["-n", "machdep.cpu.brand_string"])?
    } else if cfg!(target_os = "linux") {
        fs::read_to_string("/proc/cpuinfo")?
            .lines()
            .find_map(|line| {
                line.strip_prefix("model name")
                    .and_then(|rest| rest.split_once(':'))
                    .map(|(_, value)| value.trim().to_owned())
            })
            .unwrap_or_else(|| env::consts::ARCH.into())
    } else {
        env::var("PROCESSOR_IDENTIFIER").unwrap_or_else(|_| env::consts::ARCH.into())
    };
    let build_env = build_environment(profile, env::vars_os())?;
    let mut locations: Vec<_> = root.ancestors().map(|path| path.join(".cargo")).collect();
    if let Some(home) = env::var_os("CARGO_HOME").map(PathBuf::from).or_else(|| {
        env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
            .map(|home| PathBuf::from(home).join(".cargo"))
    }) {
        locations.push(if home.is_absolute() {
            home
        } else {
            root.join(home)
        });
    }
    let mut configs = BTreeMap::new();
    for directory in locations {
        for name in ["config", "config.toml"] {
            let path = directory.join(name);
            if path.is_file() {
                configs.insert(
                    path.to_string_lossy().into_owned(),
                    sha256(&fs::read(path)?),
                );
            }
        }
    }
    let mut repository_configs = BTreeMap::new();
    for name in [".cargo/config", ".cargo/config.toml"] {
        if root.join(name).is_file() {
            repository_configs.insert(name, sha256(&fs::read(root.join(name))?));
        }
    }
    Ok(
        json!({"runner_id": env::var("ZIWEI_BENCH_RUNNER").unwrap_or(hostname), "system": system,
        "machine": env::consts::ARCH, "cpu": cpu, "rustc": probe("rustc", &["-Vv"])?,
        "cargo": probe("cargo", &["-V"])?, "profile": profile,
        "rustflags": env::var("RUSTFLAGS").unwrap_or_default(),
        "encoded_rustflags": env::var("CARGO_ENCODED_RUSTFLAGS").unwrap_or_default(),
        "cargo_build_env": build_env, "repository_cargo_config": repository_configs, "cargo_configs": configs}),
    )
}

fn build_environment(
    profile: &str,
    variables: impl IntoIterator<Item = (std::ffi::OsString, std::ffi::OsString)>,
) -> Result<BTreeMap<String, String>> {
    let profile_prefix = format!("CARGO_PROFILE_{}_", profile.to_uppercase());
    variables
        .into_iter()
        .filter_map(|(key, value)| {
            let key = key.into_string().ok()?;
            let relevant = key.starts_with(&profile_prefix)
                // Cargo's bench profile inherits release settings.
                || (profile == "bench" && key.starts_with("CARGO_PROFILE_RELEASE_"))
                || [
                    "CARGO_BUILD_TARGET",
                    "CARGO_BUILD_RUSTFLAGS",
                    "CARGO_INCREMENTAL",
                    "CARGO_BUILD_INCREMENTAL",
                    "RUSTFLAGS",
                    "CARGO_ENCODED_RUSTFLAGS",
                    "RUSTC",
                    "RUSTC_WRAPPER",
                    "RUSTC_WORKSPACE_WRAPPER",
                ]
                .contains(&key.as_str())
                || (key.starts_with("CARGO_TARGET_")
                    && ["_RUSTFLAGS", "_LINKER", "_RUNNER"]
                        .iter()
                        .any(|suffix| key.ends_with(suffix)));
            relevant.then(|| {
                value
                    .into_string()
                    .map(|value| (key.clone(), value))
                    .map_err(|_| anyhow::anyhow!("编译环境变量 {key} 不是 UTF-8"))
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;

    #[test]
    fn sha256_preserves_lowercase_zero_padded_known_vectors() {
        assert_eq!(
            sha256(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn fingerprint_preserves_sorted_deduplicated_path_and_content_hash() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("a.rs"), b"alpha").unwrap();
        fs::write(directory.path().join("b.rs"), b"beta").unwrap();
        assert_eq!(
            fingerprint(
                directory.path(),
                vec!["b.rs".into(), "a.rs".into(), "a.rs".into()]
            )
            .unwrap(),
            "c7006cc48a80319f6b78e001642d94eec0905c2812bf3edf336b016c3106460e"
        );
    }

    #[test]
    fn bench_identity_includes_inherited_release_settings() {
        let variables = || {
            [
                ("CARGO_PROFILE_RELEASE_OPT_LEVEL", "2"),
                ("CARGO_PROFILE_RELEASE_LTO", "thin"),
                ("CARGO_PROFILE_BENCH_DEBUG", "true"),
                ("CARGO_PROFILE_DEV_OPT_LEVEL", "1"),
            ]
            .map(|(key, value)| (OsString::from(key), OsString::from(value)))
        };
        let bench = build_environment("bench", variables()).unwrap();
        assert_eq!(
            bench
                .get("CARGO_PROFILE_RELEASE_OPT_LEVEL")
                .map(String::as_str),
            Some("2")
        );
        assert_eq!(
            bench.get("CARGO_PROFILE_RELEASE_LTO").map(String::as_str),
            Some("thin")
        );
        assert_eq!(
            bench.get("CARGO_PROFILE_BENCH_DEBUG").map(String::as_str),
            Some("true")
        );
        assert!(!bench.contains_key("CARGO_PROFILE_DEV_OPT_LEVEL"));
        let release = build_environment("release", variables()).unwrap();
        assert!(!release.contains_key("CARGO_PROFILE_BENCH_DEBUG"));
        assert!(release.contains_key("CARGO_PROFILE_RELEASE_OPT_LEVEL"));
    }

    #[test]
    fn build_identity_tracks_codegen_and_target_overrides() {
        for key in [
            "CARGO_INCREMENTAL",
            "CARGO_BUILD_INCREMENTAL",
            "CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER",
            "CARGO_TARGET_AARCH64_APPLE_DARWIN_RUNNER",
            "CARGO_TARGET_AARCH64_APPLE_DARWIN_RUSTFLAGS",
        ] {
            let identity =
                |value: &str| build_environment("bench", [(key.into(), value.into())]).unwrap();
            assert_ne!(identity("first"), identity("second"), "{key}");
        }
        assert!(
            build_environment("bench", [("UNRELATED".into(), "value".into())])
                .unwrap()
                .is_empty()
        );
    }

    #[cfg(unix)]
    #[test]
    fn non_unicode_environment_is_ignored_only_when_unrelated() {
        use std::os::unix::ffi::OsStringExt;
        let invalid = OsString::from_vec(vec![0xff]);
        assert!(
            build_environment("bench", [("UNRELATED".into(), invalid.clone())])
                .unwrap()
                .is_empty()
        );
        for key in ["RUSTC_WRAPPER", "RUSTFLAGS", "CARGO_ENCODED_RUSTFLAGS"] {
            assert!(
                build_environment("bench", [(key.into(), invalid.clone())])
                    .unwrap_err()
                    .to_string()
                    .contains(key)
            );
        }
    }
}
