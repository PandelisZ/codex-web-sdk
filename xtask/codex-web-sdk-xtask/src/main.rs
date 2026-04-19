use std::fs;
use std::fs::File;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;

use anyhow::Context;
use anyhow::Result;
use anyhow::anyhow;
use clap::Parser;
use clap::Subcommand;
use fs2::FileExt;

#[derive(Debug, Parser)]
#[command(name = "codex-web-sdk-xtask")]
#[command(about = "Native helpers for the codex-web-sdk workspace")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    ExportUpstream {
        #[arg(long)]
        out: PathBuf,
    },
    CopyUpstreamTree {
        #[arg(long)]
        src: PathBuf,
        #[arg(long)]
        out: PathBuf,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::ExportUpstream { out } => export_upstream(out),
        Commands::CopyUpstreamTree { src, out } => copy_upstream_tree(src, out),
    }
}

fn export_upstream(out_dir: PathBuf) -> Result<()> {
    let _lock = acquire_upstream_lock()?;

    fs::create_dir_all(&out_dir)
        .with_context(|| format!("failed to create {}", out_dir.display()))?;

    let manifest_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../vendor/openai-codex/codex-rs/Cargo.toml");

    let status = Command::new("cargo")
        .arg("run")
        .arg("--manifest-path")
        .arg(&manifest_path)
        .arg("-p")
        .arg("codex-app-server-protocol")
        .arg("--bin")
        .arg("export")
        .arg("--")
        .arg("--out")
        .arg(&out_dir)
        .status()
        .with_context(|| {
            format!(
                "failed to invoke upstream export binary via {}",
                manifest_path.display()
            )
        })?;

    if !status.success() {
        return Err(anyhow!(
            "upstream export binary exited with status {status}"
        ));
    }

    Ok(())
}

fn copy_upstream_tree(src_dir: PathBuf, out_dir: PathBuf) -> Result<()> {
    let _lock = acquire_upstream_lock()?;

    if !src_dir.exists() {
        return Err(anyhow!(
            "source directory does not exist: {}",
            src_dir.display()
        ));
    }

    if out_dir.exists() {
        fs::remove_dir_all(&out_dir)
            .with_context(|| format!("failed to remove {}", out_dir.display()))?;
    }

    if let Some(parent) = out_dir.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }

    copy_dir_recursive(&src_dir, &out_dir)?;
    Ok(())
}

fn copy_dir_recursive(src_dir: &Path, out_dir: &Path) -> Result<()> {
    fs::create_dir_all(out_dir)
        .with_context(|| format!("failed to create {}", out_dir.display()))?;

    for entry in
        fs::read_dir(src_dir).with_context(|| format!("failed to read {}", src_dir.display()))?
    {
        let entry =
            entry.with_context(|| format!("failed to read entry in {}", src_dir.display()))?;
        let entry_type = entry
            .file_type()
            .with_context(|| format!("failed to read file type for {}", entry.path().display()))?;
        let destination = out_dir.join(entry.file_name());

        if entry_type.is_dir() {
            copy_dir_recursive(&entry.path(), &destination)?;
        } else if entry_type.is_file() {
            fs::copy(entry.path(), &destination).with_context(|| {
                format!(
                    "failed to copy {} to {}",
                    entry.path().display(),
                    destination.display()
                )
            })?;
        }
    }

    Ok(())
}

fn acquire_upstream_lock() -> Result<UpstreamLock> {
    let lock_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/xtask-locks");
    fs::create_dir_all(&lock_dir)
        .with_context(|| format!("failed to create {}", lock_dir.display()))?;

    let lock_path = upstream_lock_path(&lock_dir);
    let file = File::options()
        .create(true)
        .read(true)
        .write(true)
        .truncate(false)
        .open(&lock_path)
        .with_context(|| format!("failed to open {}", lock_path.display()))?;
    file.lock_exclusive()
        .with_context(|| format!("failed to lock {}", lock_path.display()))?;

    Ok(UpstreamLock { file })
}

fn upstream_lock_path(lock_dir: &Path) -> PathBuf {
    lock_dir.join("upstream-protocol.lock")
}

struct UpstreamLock {
    file: File,
}

impl Drop for UpstreamLock {
    fn drop(&mut self) {
        let _ = self.file.unlock();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("codex-web-sdk-xtask-{name}-{unique}"))
    }

    #[test]
    fn copy_dir_recursive_copies_nested_files() {
        let src_dir = test_dir("copy-src");
        let nested_dir = src_dir.join("nested");
        let out_dir = test_dir("copy-out");
        fs::create_dir_all(&nested_dir).expect("should create nested source dir");
        fs::write(src_dir.join("root.txt"), "root").expect("should write root file");
        fs::write(nested_dir.join("child.txt"), "child").expect("should write nested file");

        copy_dir_recursive(&src_dir, &out_dir).expect("copy should succeed");

        assert_eq!(
            fs::read_to_string(out_dir.join("root.txt")).expect("root copy should exist"),
            "root"
        );
        assert_eq!(
            fs::read_to_string(out_dir.join("nested/child.txt")).expect("nested copy should exist"),
            "child"
        );

        let _ = fs::remove_dir_all(&src_dir);
        let _ = fs::remove_dir_all(&out_dir);
    }

    #[test]
    fn upstream_lock_is_exclusive() {
        let lock_dir = test_dir("lock-dir");
        fs::create_dir_all(&lock_dir).expect("should create lock dir");
        let _lock = acquire_upstream_lock_for_tests(&lock_dir).expect("first lock should succeed");

        let second = File::options()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(upstream_lock_path(&lock_dir))
            .expect("second file handle should open");

        let err = second
            .try_lock_exclusive()
            .expect_err("second lock acquisition should fail while first is held");
        assert!(
            err.kind() == std::io::ErrorKind::WouldBlock || err.kind() == std::io::ErrorKind::Other
        );

        let _ = fs::remove_dir_all(&lock_dir);
    }

    fn acquire_upstream_lock_for_tests(lock_dir: &Path) -> Result<UpstreamLock> {
        fs::create_dir_all(lock_dir)
            .with_context(|| format!("failed to create {}", lock_dir.display()))?;

        let lock_path = upstream_lock_path(lock_dir);
        let file = File::options()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(&lock_path)
            .with_context(|| format!("failed to open {}", lock_path.display()))?;
        file.lock_exclusive()
            .with_context(|| format!("failed to lock {}", lock_path.display()))?;

        Ok(UpstreamLock { file })
    }
}
