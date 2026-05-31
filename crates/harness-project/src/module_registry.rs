use crate::errors::HarnessError;
use harness_protocol::{
    decode_behavior_file, decode_locales_file, decode_modules_file, decode_packages_file,
    decode_review_log_file, BehaviorFile, LocalesFile, ModuleRecord, PackageRecord,
    ProtocolDecodeError, ReviewLogFile,
};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub const PACKAGES_PATH: &str = "tests/harness.packages.yaml";
pub const MODULES_PATH: &str = "tests/harness.modules.yaml";
pub const LOCALES_PATH: &str = "tests/harness.locales.yaml";
pub const BEHAVIOR_PATH: &str = "tests/harness.behavior.yaml";
pub const REVIEW_LOG_PATH: &str = "tests/harness.review-log.yaml";

pub fn load_package_records(
    root_dir: impl AsRef<Path>,
) -> Result<Vec<PackageRecord>, HarnessError> {
    let path = root_dir.as_ref().join(PACKAGES_PATH);
    let raw = read_manifest(&path)?;
    decode_packages_file(&raw)
        .map(|file| file.packages)
        .map_err(|error| map_manifest_decode_error(path, error))
}

pub fn load_module_records(root_dir: impl AsRef<Path>) -> Result<Vec<ModuleRecord>, HarnessError> {
    let path = root_dir.as_ref().join(MODULES_PATH);
    let raw = read_manifest(&path)?;
    decode_modules_file(&raw)
        .map(|file| file.modules)
        .map_err(|error| map_manifest_decode_error(path, error))
}

pub fn load_locales_file(root_dir: impl AsRef<Path>) -> Result<LocalesFile, HarnessError> {
    let path = root_dir.as_ref().join(LOCALES_PATH);
    let raw = read_manifest(&path)?;
    decode_locales_file(&raw).map_err(|error| map_manifest_decode_error(path, error))
}

pub fn load_behavior_file(root_dir: impl AsRef<Path>) -> Result<BehaviorFile, HarnessError> {
    let path = root_dir.as_ref().join(BEHAVIOR_PATH);
    let raw = read_manifest(&path)?;
    decode_behavior_file(&raw).map_err(|error| map_manifest_decode_error(path, error))
}

pub fn load_review_log_file(root_dir: impl AsRef<Path>) -> Result<ReviewLogFile, HarnessError> {
    let path = root_dir.as_ref().join(REVIEW_LOG_PATH);
    let raw = read_manifest(&path)?;
    decode_review_log_file(&raw).map_err(|error| map_manifest_decode_error(path, error))
}

fn read_manifest(path: &Path) -> Result<String, HarnessError> {
    fs::read_to_string(path).map_err(|error| HarnessError::HarnessManifestFileReadError {
        path: path.to_path_buf(),
        cause: error.to_string(),
    })
}

fn map_manifest_decode_error(path: PathBuf, error: ProtocolDecodeError) -> HarnessError {
    match error {
        ProtocolDecodeError::Yaml(cause) => {
            HarnessError::HarnessManifestYamlParseError { path, cause }
        }
        ProtocolDecodeError::Shape(cause) => {
            HarnessError::HarnessManifestSchemaDecodeError { path, cause }
        }
    }
}

pub fn find_source_files(root_dir: impl AsRef<Path>) -> Result<Vec<String>, HarnessError> {
    let root_dir = root_dir.as_ref();
    let mut files = Vec::new();
    for root in ["packages", "apps", "protocol", "crates", "skills"] {
        let scan_root = root_dir.join(root);
        if !scan_root.exists() {
            continue;
        }
        let walker = WalkDir::new(&scan_root).into_iter().filter_entry(|entry| {
            if !entry.file_type().is_dir() {
                return true;
            }
            let name = entry.file_name().to_string_lossy();
            !matches!(
                name.as_ref(),
                "node_modules" | "dist" | "build" | "tests" | ".harness" | ".vite-hooks"
            )
        });
        for entry in walker {
            let entry = entry.map_err(|error| HarnessError::SourceFileScanError {
                path: scan_root.clone(),
                cause: error.to_string(),
            })?;
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            let relative = path
                .strip_prefix(root_dir)
                .map_err(|error| HarnessError::SourceFileScanError {
                    path: path.to_path_buf(),
                    cause: error.to_string(),
                })?
                .to_string_lossy()
                .replace('\\', "/");
            if has_scan_extension(&relative) && !is_excluded_source_file(&relative) {
                files.push(relative);
            }
        }
    }
    files.sort();
    Ok(files)
}

fn has_scan_extension(path: &str) -> bool {
    [".ts", ".tsx", ".yaml", ".rs", ".toml", ".md"]
        .iter()
        .any(|extension| path.ends_with(extension))
}

fn is_excluded_source_file(path: &str) -> bool {
    path.ends_with(".test.ts")
        || path.ends_with(".config.ts")
        || path.ends_with("vite.config.ts")
        || path.ends_with(".lock")
}
