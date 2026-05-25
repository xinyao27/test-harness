use crate::errors::HarnessError;
use harness_protocol::{
    decode_test_results_file, PromiseRunStatus, ProtocolDecodeError, ProtocolVersion, TestResult,
    TestResultStatus, TestResultsFile,
};
use std::fs;
use std::path::Path;

pub const HARNESS_RESULTS_PATH: &str = ".harness/results.yaml";
pub const HARNESS_ROOT_ENV_VAR: &str = "HARNESS_ROOT_DIR";

pub fn load_test_results_file(
    root_dir: impl AsRef<Path>,
) -> Result<Option<TestResultsFile>, HarnessError> {
    let path = root_dir.as_ref().join(HARNESS_RESULTS_PATH);
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(HarnessError::TestResultsFileReadError {
                path,
                cause: error.to_string(),
            })
        }
    };
    decode_test_results_file(&raw)
        .map_err(|error| match error {
            ProtocolDecodeError::Yaml(cause) => HarnessError::TestResultsYamlParseError {
                path: path.clone(),
                cause,
            },
            ProtocolDecodeError::Shape(cause) => HarnessError::TestResultsSchemaDecodeError {
                path: path.clone(),
                cause,
            },
        })
        .map(Some)
}

pub fn load_test_results(root_dir: impl AsRef<Path>) -> Result<Vec<TestResult>, HarnessError> {
    Ok(load_test_results_file(root_dir)?.map_or_else(Vec::new, |file| file.results))
}

pub fn create_test_results_file(
    mut results: Vec<TestResult>,
    generated_at: impl Into<String>,
) -> TestResultsFile {
    results.sort_by(|left, right| {
        left.promise_id
            .cmp(&right.promise_id)
            .then_with(|| left.file.cmp(&right.file))
            .then_with(|| left.test_name.cmp(&right.test_name))
    });
    TestResultsFile {
        api_version: ProtocolVersion,
        generated_at: generated_at.into(),
        results,
    }
}

pub fn write_test_results_file(
    root_dir: impl AsRef<Path>,
    file: &TestResultsFile,
) -> Result<(), HarnessError> {
    let path = root_dir.as_ref().join(HARNESS_RESULTS_PATH);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            HarnessError::TestResultsDirectoryCreateError {
                path: parent.to_path_buf(),
                cause: error.to_string(),
            }
        })?;
    }
    let raw = serde_yaml::to_string(file).map_err(|error| {
        HarnessError::TestResultsSchemaDecodeError {
            path: path.clone(),
            cause: error.to_string(),
        }
    })?;
    fs::write(&path, raw).map_err(|error| HarnessError::TestResultsFileWriteError {
        path,
        cause: error.to_string(),
    })
}

pub fn get_promise_run_status(promise_id: &str, results: &[TestResult]) -> PromiseRunStatus {
    let matched = results
        .iter()
        .filter(|result| result.promise_id == promise_id)
        .collect::<Vec<_>>();
    if matched.is_empty() {
        return PromiseRunStatus::Unknown;
    }
    if matched
        .iter()
        .any(|result| result.status == TestResultStatus::Failing)
    {
        return PromiseRunStatus::Failing;
    }
    if matched
        .iter()
        .any(|result| result.status == TestResultStatus::Skipped)
    {
        return PromiseRunStatus::Skipped;
    }
    PromiseRunStatus::Passing
}
