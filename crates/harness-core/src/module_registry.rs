use crate::errors::{HarnessError, ModuleLoadError};
use crate::fs_utils::collect_files;
use harness_protocol::{decode_module_record, ModuleRecord, ProtocolDecodeError};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub fn find_module_files(root_dir: impl AsRef<Path>) -> Result<Vec<PathBuf>, HarnessError> {
    let directory = root_dir.as_ref().join("modules");
    collect_files(&directory, ".module.yaml").map_err(|cause| HarnessError::ModuleFileReadError {
        path: directory,
        cause,
    })
}

fn load_module_record(path: &Path) -> Result<ModuleRecord, ModuleLoadError> {
    let raw = fs::read_to_string(path).map_err(|error| ModuleLoadError::ModuleFileReadError {
        path: path.to_path_buf(),
        cause: error.to_string(),
    })?;
    decode_module_record(&raw).map_err(|error| match error {
        ProtocolDecodeError::Yaml(cause) => ModuleLoadError::ModuleYamlParseError {
            path: path.to_path_buf(),
            cause,
        },
        ProtocolDecodeError::Shape(cause) => ModuleLoadError::ModuleSchemaDecodeError {
            path: path.to_path_buf(),
            cause,
        },
    })
}

pub fn load_module_records(root_dir: impl AsRef<Path>) -> Result<Vec<ModuleRecord>, HarnessError> {
    let files = find_module_files(root_dir)?;
    let mut records = Vec::new();
    let mut errors = Vec::new();
    for path in files {
        match load_module_record(&path) {
            Ok(record) => records.push(record),
            Err(error) => errors.push(error),
        }
    }
    if errors.is_empty() {
        Ok(records)
    } else {
        Err(HarnessError::ModuleRecordLoadErrors { errors })
    }
}

pub fn find_source_files(root_dir: impl AsRef<Path>) -> Result<Vec<String>, HarnessError> {
    let root_dir = root_dir.as_ref();
    let mut files = Vec::new();
    for root in ["packages", "apps", "protocol", "crates"] {
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
    [".ts", ".yaml", ".rs", ".toml"]
        .iter()
        .any(|extension| path.ends_with(extension))
}

fn is_excluded_source_file(path: &str) -> bool {
    path.ends_with(".test.ts") || path.ends_with(".config.ts") || path.ends_with("vite.config.ts")
}
