use crate::errors::{HarnessError, PromiseLoadError};
use crate::fs_utils::collect_files;
use harness_protocol::{decode_promises_file_items, PromiseRecord, ProtocolDecodeError};
use std::fs;
use std::path::{Path, PathBuf};

pub fn find_promise_files(root_dir: impl AsRef<Path>) -> Result<Vec<PathBuf>, HarnessError> {
    let directory = root_dir.as_ref().join("promises");
    collect_files(&directory, ".promises.yaml").map_err(|cause| {
        HarnessError::PromiseFileReadError {
            path: directory,
            cause,
        }
    })
}

fn load_promises_file(path: &Path) -> (Vec<PromiseRecord>, Vec<PromiseLoadError>) {
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(error) => {
            return (
                Vec::new(),
                vec![PromiseLoadError::PromiseFileReadError {
                    path: path.to_path_buf(),
                    cause: error.to_string(),
                }],
            )
        }
    };
    let items = match decode_promises_file_items(&raw) {
        Ok(items) => items,
        Err(ProtocolDecodeError::Yaml(cause)) => {
            return (
                Vec::new(),
                vec![PromiseLoadError::PromiseYamlParseError {
                    path: path.to_path_buf(),
                    cause,
                }],
            )
        }
        Err(ProtocolDecodeError::Shape(cause)) => {
            return (
                Vec::new(),
                vec![PromiseLoadError::PromisesFileSchemaDecodeError {
                    path: path.to_path_buf(),
                    cause,
                }],
            )
        }
    };
    let mut records = Vec::new();
    let mut errors = Vec::new();
    for (index, item) in items.into_iter().enumerate() {
        match item {
            Ok(record) => records.push(record),
            Err(error) => errors.push(PromiseLoadError::PromiseSchemaDecodeError {
                path: path.to_path_buf(),
                index,
                cause: error.to_string(),
            }),
        }
    }
    (records, errors)
}

pub fn load_promise_records(
    root_dir: impl AsRef<Path>,
) -> Result<Vec<PromiseRecord>, HarnessError> {
    let files = find_promise_files(root_dir)?;
    let mut records = Vec::new();
    let mut errors = Vec::new();
    for path in files {
        let (file_records, file_errors) = load_promises_file(&path);
        records.extend(file_records);
        errors.extend(file_errors);
    }
    if errors.is_empty() {
        Ok(records)
    } else {
        Err(HarnessError::PromiseRecordLoadErrors { errors })
    }
}
