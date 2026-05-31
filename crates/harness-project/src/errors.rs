use std::fmt;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub enum HarnessError {
    HarnessConfigFileReadError { path: PathBuf, cause: String },
    HarnessConfigYamlParseError { path: PathBuf, cause: String },
    HarnessConfigSchemaDecodeError { path: PathBuf, cause: String },
    HarnessManifestFileReadError { path: PathBuf, cause: String },
    HarnessManifestYamlParseError { path: PathBuf, cause: String },
    HarnessManifestSchemaDecodeError { path: PathBuf, cause: String },
    FeatureRecordLoadErrors { errors: Vec<FeatureLoadError> },
    ResultsFileReadError { path: PathBuf, cause: String },
    ResultsDirectoryCreateError { path: PathBuf, cause: String },
    ResultsFileWriteError { path: PathBuf, cause: String },
    ResultsYamlParseError { path: PathBuf, cause: String },
    ResultsSchemaDecodeError { path: PathBuf, cause: String },
    SourceFileScanError { path: PathBuf, cause: String },
}

#[derive(Debug, Clone)]
pub enum FeatureLoadError {
    FeatureFileReadError { path: PathBuf, cause: String },
    FeatureFileParseError { path: PathBuf, cause: String },
}

impl fmt::Display for HarnessError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::HarnessConfigFileReadError { path, cause } => {
                write!(
                    formatter,
                    "HarnessConfigFileReadError {}\n{cause}",
                    path.display()
                )
            }
            Self::HarnessConfigYamlParseError { path, cause } => {
                write!(
                    formatter,
                    "HarnessConfigYamlParseError {}\n{cause}",
                    path.display()
                )
            }
            Self::HarnessConfigSchemaDecodeError { path, cause } => write!(
                formatter,
                "HarnessConfigSchemaDecodeError {}\n{cause}",
                path.display()
            ),
            Self::HarnessManifestFileReadError { path, cause } => write!(
                formatter,
                "HarnessManifestFileReadError {}\n{cause}",
                path.display()
            ),
            Self::HarnessManifestYamlParseError { path, cause } => write!(
                formatter,
                "HarnessManifestYamlParseError {}\n{cause}",
                path.display()
            ),
            Self::HarnessManifestSchemaDecodeError { path, cause } => write!(
                formatter,
                "HarnessManifestSchemaDecodeError {}\n{cause}",
                path.display()
            ),
            Self::FeatureRecordLoadErrors { errors } => {
                writeln!(formatter, "FeatureRecordLoadErrors")?;
                for error in errors {
                    writeln!(formatter, "{error}")?;
                }
                Ok(())
            }
            Self::ResultsFileReadError { path, cause } => {
                write!(
                    formatter,
                    "ResultsFileReadError {}\n{cause}",
                    path.display()
                )
            }
            Self::ResultsDirectoryCreateError { path, cause } => write!(
                formatter,
                "ResultsDirectoryCreateError {}\n{cause}",
                path.display()
            ),
            Self::ResultsFileWriteError { path, cause } => write!(
                formatter,
                "ResultsFileWriteError {}\n{cause}",
                path.display()
            ),
            Self::ResultsYamlParseError { path, cause } => write!(
                formatter,
                "ResultsYamlParseError {}\n{cause}",
                path.display()
            ),
            Self::ResultsSchemaDecodeError { path, cause } => write!(
                formatter,
                "ResultsSchemaDecodeError {}\n{cause}",
                path.display()
            ),
            Self::SourceFileScanError { path, cause } => {
                write!(formatter, "SourceFileScanError {}\n{cause}", path.display())
            }
        }
    }
}

impl fmt::Display for FeatureLoadError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::FeatureFileReadError { path, cause } => {
                write!(
                    formatter,
                    "FeatureFileReadError {}\n{cause}",
                    path.display()
                )
            }
            Self::FeatureFileParseError { path, cause } => {
                write!(
                    formatter,
                    "FeatureFileParseError {}\n{cause}",
                    path.display()
                )
            }
        }
    }
}

impl std::error::Error for HarnessError {}
impl std::error::Error for FeatureLoadError {}
