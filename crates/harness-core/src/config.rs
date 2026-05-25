use crate::errors::HarnessError;
use harness_protocol::{decode_harness_config, HarnessConfig, ProtocolDecodeError};
use std::fs;
use std::path::Path;

pub const HARNESS_CONFIG_PATH: &str = "harness.yaml";

pub fn load_harness_config(root_dir: impl AsRef<Path>) -> Result<HarnessConfig, HarnessError> {
    let path = root_dir.as_ref().join(HARNESS_CONFIG_PATH);
    let raw =
        fs::read_to_string(&path).map_err(|error| HarnessError::HarnessConfigFileReadError {
            path: path.clone(),
            cause: error.to_string(),
        })?;
    decode_harness_config(&raw).map_err(|error| match error {
        ProtocolDecodeError::Yaml(cause) => HarnessError::HarnessConfigYamlParseError {
            path: path.clone(),
            cause,
        },
        ProtocolDecodeError::Shape(cause) => {
            HarnessError::HarnessConfigSchemaDecodeError { path, cause }
        }
    })
}
