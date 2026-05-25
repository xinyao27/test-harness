use std::fmt;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub enum HarnessError {
    HarnessConfigFileReadError { path: PathBuf, cause: String },
    HarnessConfigYamlParseError { path: PathBuf, cause: String },
    HarnessConfigSchemaDecodeError { path: PathBuf, cause: String },
    PromiseFileReadError { path: PathBuf, cause: String },
    PromiseRecordLoadErrors { errors: Vec<PromiseLoadError> },
    ModuleFileReadError { path: PathBuf, cause: String },
    ModuleRecordLoadErrors { errors: Vec<ModuleLoadError> },
    TestResultsFileReadError { path: PathBuf, cause: String },
    TestResultsDirectoryCreateError { path: PathBuf, cause: String },
    TestResultsFileWriteError { path: PathBuf, cause: String },
    TestResultsYamlParseError { path: PathBuf, cause: String },
    TestResultsSchemaDecodeError { path: PathBuf, cause: String },
    SourceFileScanError { path: PathBuf, cause: String },
}

#[derive(Debug, Clone)]
pub enum PromiseLoadError {
    PromiseFileReadError {
        path: PathBuf,
        cause: String,
    },
    PromiseYamlParseError {
        path: PathBuf,
        cause: String,
    },
    PromisesFileSchemaDecodeError {
        path: PathBuf,
        cause: String,
    },
    PromiseSchemaDecodeError {
        path: PathBuf,
        index: usize,
        cause: String,
    },
}

#[derive(Debug, Clone)]
pub enum ModuleLoadError {
    ModuleFileReadError { path: PathBuf, cause: String },
    ModuleYamlParseError { path: PathBuf, cause: String },
    ModuleSchemaDecodeError { path: PathBuf, cause: String },
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
            Self::PromiseFileReadError { path, cause } => {
                write!(
                    formatter,
                    "PromiseFileReadError {}\n{cause}",
                    path.display()
                )
            }
            Self::PromiseRecordLoadErrors { errors } => {
                writeln!(formatter, "PromiseRecordLoadErrors")?;
                for error in errors {
                    writeln!(formatter, "{error}")?;
                }
                Ok(())
            }
            Self::ModuleFileReadError { path, cause } => {
                write!(formatter, "ModuleFileReadError {}\n{cause}", path.display())
            }
            Self::ModuleRecordLoadErrors { errors } => {
                writeln!(formatter, "ModuleRecordLoadErrors")?;
                for error in errors {
                    writeln!(formatter, "{error}")?;
                }
                Ok(())
            }
            Self::TestResultsFileReadError { path, cause } => {
                write!(
                    formatter,
                    "TestResultsFileReadError {}\n{cause}",
                    path.display()
                )
            }
            Self::TestResultsDirectoryCreateError { path, cause } => write!(
                formatter,
                "TestResultsDirectoryCreateError {}\n{cause}",
                path.display()
            ),
            Self::TestResultsFileWriteError { path, cause } => write!(
                formatter,
                "TestResultsFileWriteError {}\n{cause}",
                path.display()
            ),
            Self::TestResultsYamlParseError { path, cause } => write!(
                formatter,
                "TestResultsYamlParseError {}\n{cause}",
                path.display()
            ),
            Self::TestResultsSchemaDecodeError { path, cause } => write!(
                formatter,
                "TestResultsSchemaDecodeError {}\n{cause}",
                path.display()
            ),
            Self::SourceFileScanError { path, cause } => {
                write!(formatter, "SourceFileScanError {}\n{cause}", path.display())
            }
        }
    }
}

impl fmt::Display for PromiseLoadError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::PromiseFileReadError { path, cause } => {
                write!(
                    formatter,
                    "PromiseFileReadError {}\n{cause}",
                    path.display()
                )
            }
            Self::PromiseYamlParseError { path, cause } => {
                write!(
                    formatter,
                    "PromiseYamlParseError {}\n{cause}",
                    path.display()
                )
            }
            Self::PromisesFileSchemaDecodeError { path, cause } => write!(
                formatter,
                "PromisesFileSchemaDecodeError {}\n{cause}",
                path.display()
            ),
            Self::PromiseSchemaDecodeError { path, index, cause } => write!(
                formatter,
                "PromiseSchemaDecodeError {}[{index}]\n{cause}",
                path.display()
            ),
        }
    }
}

impl fmt::Display for ModuleLoadError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ModuleFileReadError { path, cause } => {
                write!(formatter, "ModuleFileReadError {}\n{cause}", path.display())
            }
            Self::ModuleYamlParseError { path, cause } => {
                write!(
                    formatter,
                    "ModuleYamlParseError {}\n{cause}",
                    path.display()
                )
            }
            Self::ModuleSchemaDecodeError { path, cause } => {
                write!(
                    formatter,
                    "ModuleSchemaDecodeError {}\n{cause}",
                    path.display()
                )
            }
        }
    }
}

impl std::error::Error for HarnessError {}
impl std::error::Error for PromiseLoadError {}
impl std::error::Error for ModuleLoadError {}
