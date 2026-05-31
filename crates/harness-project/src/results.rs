use crate::errors::HarnessError;
use harness_protocol::{
    decode_results_file, ExampleResult, ExampleStatus, ProtocolDecodeError, ProtocolVersion,
    ResultsFile,
};
use std::fs;
use std::io;
use std::path::Path;

pub const HARNESS_RESULTS_PATH: &str = "tests/harness.results.yaml";
pub const HARNESS_ROOT_ENV_VAR: &str = "HARNESS_ROOT_DIR";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExampleRunStatus {
    Unknown,
    Passing,
    Failing,
    Skipped,
}

pub fn load_results_file(root_dir: impl AsRef<Path>) -> Result<Option<ResultsFile>, HarnessError> {
    let path = root_dir.as_ref().join(HARNESS_RESULTS_PATH);
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(HarnessError::ResultsFileReadError {
                path,
                cause: error.to_string(),
            })
        }
    };
    decode_results_file(&raw)
        .map_err(|error| match error {
            ProtocolDecodeError::Yaml(cause) => HarnessError::ResultsYamlParseError {
                path: path.clone(),
                cause,
            },
            ProtocolDecodeError::Shape(cause) => HarnessError::ResultsSchemaDecodeError {
                path: path.clone(),
                cause,
            },
        })
        .map(Some)
}

pub fn load_example_results(
    root_dir: impl AsRef<Path>,
) -> Result<Vec<ExampleResult>, HarnessError> {
    Ok(load_results_file(root_dir)?.map_or_else(Vec::new, |file| file.results))
}

pub fn create_results_file(
    mut results: Vec<ExampleResult>,
    generated_at: impl Into<String>,
) -> ResultsFile {
    results.sort_by(|left, right| {
        example_identity(left)
            .cmp(&example_identity(right))
            .then_with(|| left.locale.cmp(&right.locale))
    });
    ResultsFile {
        api_version: ProtocolVersion,
        generated_at: generated_at.into(),
        results,
    }
}

pub fn write_results_file(
    root_dir: impl AsRef<Path>,
    file: &ResultsFile,
) -> Result<(), HarnessError> {
    let path = root_dir.as_ref().join(HARNESS_RESULTS_PATH);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| HarnessError::ResultsDirectoryCreateError {
            path: parent.to_path_buf(),
            cause: error.to_string(),
        })?;
    }
    let raw =
        serde_yaml::to_string(file).map_err(|error| HarnessError::ResultsSchemaDecodeError {
            path: path.clone(),
            cause: error.to_string(),
        })?;
    fs::write(&path, raw).map_err(|error| HarnessError::ResultsFileWriteError {
        path,
        cause: error.to_string(),
    })
}

pub fn get_example_run_status(
    feature: &str,
    rule: &str,
    example: &str,
    results: &[ExampleResult],
) -> ExampleRunStatus {
    let matched = results
        .iter()
        .filter(|result| {
            result.feature == feature && result.rule == rule && result.example == example
        })
        .collect::<Vec<_>>();

    if matched.is_empty() {
        return ExampleRunStatus::Unknown;
    }
    if matched
        .iter()
        .any(|result| result.status == ExampleStatus::Failing)
    {
        return ExampleRunStatus::Failing;
    }
    if matched
        .iter()
        .any(|result| result.status == ExampleStatus::Skipped)
    {
        return ExampleRunStatus::Skipped;
    }
    ExampleRunStatus::Passing
}

fn example_identity(result: &ExampleResult) -> String {
    [
        result.feature.as_str(),
        result.rule.as_str(),
        result.example.as_str(),
    ]
    .join("\u{0}")
}
