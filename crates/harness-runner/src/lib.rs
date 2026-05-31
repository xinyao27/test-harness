use harness_protocol::{
    decode_bridge_event, validate_example_result, BridgeDescriptor, BridgeEvent, BridgeEventKind,
    ExampleResult, HarnessRunnerSelection, ProtocolVersion, ResultsFile,
};
use std::collections::BTreeMap;
use std::env;
use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub const HARNESS_RESULTS_PATH: &str = "tests/harness.results.yaml";
pub const HARNESS_ROOT_ENV_VAR: &str = "HARNESS_ROOT_DIR";
pub const HARNESS_RUN_ID_ENV_VAR: &str = "HARNESS_RUN_ID";
pub const HARNESS_BRIDGE_EVENTS_DIR_ENV_VAR: &str = "HARNESS_BRIDGE_EVENTS_DIR";
pub const HARNESS_CUCUMBER_TAG_EXPRESSION_ENV_VAR: &str = "HARNESS_CUCUMBER_TAG_EXPRESSION";
pub const HARNESS_RUNNER_PACKAGE_ENV_VAR: &str = "HARNESS_RUNNER_PACKAGE";
pub const HARNESS_RUNNER_MODULE_ENV_VAR: &str = "HARNESS_RUNNER_MODULE";
pub const HARNESS_RUNNER_FEATURE_ENV_VAR: &str = "HARNESS_RUNNER_FEATURE";
pub const HARNESS_RUNNER_RULE_ENV_VAR: &str = "HARNESS_RUNNER_RULE";
pub const HARNESS_RUNNER_EXAMPLE_ENV_VAR: &str = "HARNESS_RUNNER_EXAMPLE";
pub const HARNESS_RUNNER_LOCALE_ENV_VAR: &str = "HARNESS_RUNNER_LOCALE";

const DEFAULT_RUN_ID: &str = "default";
const USAGE: &str = "\
Usage:
  harness-runner merge [run-id]
  harness-runner clear [run-id]
  harness-runner run [--run-id <run-id>] [--package <id>] [--module <id>] [--feature <id>] [--rule <id>] [--example <id>] [--locale <code>] -- <command> [args...]";

static RUN_COUNTER: AtomicU64 = AtomicU64::new(0);
static SHARD_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeSummary {
    pub event_count: usize,
    pub result_count: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct ParsedRunCommand {
    command: Vec<String>,
    run_id: String,
    selection: HarnessRunnerSelection,
}

#[derive(Debug, Clone)]
pub enum HarnessRunnerError {
    CommandMissing,
    CommandSpawnError {
        command: String,
        cause: String,
    },
    EventsDirectoryClearError {
        path: PathBuf,
        cause: String,
    },
    EventsDirectoryCreateError {
        path: PathBuf,
        cause: String,
    },
    EventsDirectoryReadError {
        path: PathBuf,
        cause: String,
    },
    EventShardReadError {
        path: PathBuf,
        cause: String,
    },
    EventShardWriteError {
        path: PathBuf,
        cause: String,
    },
    InvalidExampleResult {
        cause: String,
    },
    EventShardDecodeError {
        path: PathBuf,
        line: usize,
        cause: String,
    },
    NoBridgeEvents {
        directory: PathBuf,
        run_id: String,
    },
    ResultsDirectoryCreateError {
        path: PathBuf,
        cause: String,
    },
    ResultsFileReadError {
        path: PathBuf,
        cause: String,
    },
    ResultsFileWriteError {
        path: PathBuf,
        cause: String,
    },
    ResultsFileDecodeError {
        path: PathBuf,
        cause: String,
    },
    RunIdMismatch {
        path: PathBuf,
        line: usize,
        expected: String,
        actual: String,
    },
}

impl fmt::Display for HarnessRunnerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::CommandMissing => formatter.write_str("HarnessRunnerCommandMissing"),
            Self::CommandSpawnError { command, cause } => {
                write!(
                    formatter,
                    "HarnessRunnerCommandSpawnError {command}\n{cause}"
                )
            }
            Self::EventsDirectoryClearError { path, cause } => write!(
                formatter,
                "HarnessRunnerEventsDirectoryClearError {}\n{cause}",
                path.display()
            ),
            Self::EventsDirectoryCreateError { path, cause } => write!(
                formatter,
                "HarnessRunnerEventsDirectoryCreateError {}\n{cause}",
                path.display()
            ),
            Self::EventsDirectoryReadError { path, cause } => write!(
                formatter,
                "HarnessRunnerEventsDirectoryReadError {}\n{cause}",
                path.display()
            ),
            Self::EventShardReadError { path, cause } => write!(
                formatter,
                "HarnessRunnerEventShardReadError {}\n{cause}",
                path.display()
            ),
            Self::EventShardWriteError { path, cause } => write!(
                formatter,
                "HarnessRunnerEventShardWriteError {}\n{cause}",
                path.display()
            ),
            Self::InvalidExampleResult { cause } => {
                write!(formatter, "HarnessRunnerInvalidExampleResult\n{cause}")
            }
            Self::EventShardDecodeError { path, line, cause } => write!(
                formatter,
                "HarnessRunnerEventShardDecodeError {}:{line}\n{cause}",
                path.display()
            ),
            Self::NoBridgeEvents { directory, run_id } => write!(
                formatter,
                "HarnessRunnerNoBridgeEvents {run_id}\nno bridge events were collected in {}",
                directory.display()
            ),
            Self::ResultsDirectoryCreateError { path, cause } => write!(
                formatter,
                "HarnessRunnerResultsDirectoryCreateError {}\n{cause}",
                path.display()
            ),
            Self::ResultsFileReadError { path, cause } => write!(
                formatter,
                "HarnessRunnerResultsFileReadError {}\n{cause}",
                path.display()
            ),
            Self::ResultsFileWriteError { path, cause } => write!(
                formatter,
                "HarnessRunnerResultsFileWriteError {}\n{cause}",
                path.display()
            ),
            Self::ResultsFileDecodeError { path, cause } => write!(
                formatter,
                "HarnessRunnerResultsFileDecodeError {}\n{cause}",
                path.display()
            ),
            Self::RunIdMismatch {
                path,
                line,
                expected,
                actual,
            } => write!(
                formatter,
                "HarnessRunnerRunIdMismatch {}:{line}\nexpected {expected}, got {actual}",
                path.display()
            ),
        }
    }
}

impl std::error::Error for HarnessRunnerError {}

pub fn bridge_events_dir(root_dir: impl AsRef<Path>, run_id: &str) -> PathBuf {
    match env::var_os(HARNESS_BRIDGE_EVENTS_DIR_ENV_VAR) {
        Some(value) => {
            let path = PathBuf::from(value);
            if path.is_absolute() {
                path
            } else {
                root_dir.as_ref().join(path)
            }
        }
        None => default_bridge_events_dir(root_dir, run_id),
    }
}

pub fn default_bridge_events_dir(root_dir: impl AsRef<Path>, run_id: &str) -> PathBuf {
    root_dir
        .as_ref()
        .join(".harness")
        .join("runs")
        .join(run_id)
        .join("events")
}

pub fn clear_bridge_events(
    root_dir: impl AsRef<Path>,
    run_id: &str,
) -> Result<(), HarnessRunnerError> {
    let directory = bridge_events_dir(root_dir, run_id);
    clear_bridge_events_dir(directory)
}

pub fn clear_bridge_events_dir(directory: impl AsRef<Path>) -> Result<(), HarnessRunnerError> {
    let directory = directory.as_ref().to_path_buf();
    match fs::remove_dir_all(&directory) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(HarnessRunnerError::EventsDirectoryClearError {
            path: directory,
            cause: error.to_string(),
        }),
    }
}

pub fn ensure_bridge_events_dir(
    root_dir: impl AsRef<Path>,
    run_id: &str,
) -> Result<PathBuf, HarnessRunnerError> {
    let directory = bridge_events_dir(root_dir, run_id);
    ensure_bridge_events_dir_path(directory)
}

pub fn ensure_bridge_events_dir_path(
    directory: impl AsRef<Path>,
) -> Result<PathBuf, HarnessRunnerError> {
    let directory = directory.as_ref().to_path_buf();
    fs::create_dir_all(&directory).map_err(|error| {
        HarnessRunnerError::EventsDirectoryCreateError {
            path: directory.clone(),
            cause: error.to_string(),
        }
    })?;
    Ok(directory)
}

pub fn create_example_result_event(
    run_id: impl Into<String>,
    bridge: BridgeDescriptor,
    result: ExampleResult,
    timestamp: impl Into<String>,
) -> BridgeEvent {
    BridgeEvent {
        bridge,
        api_version: ProtocolVersion,
        kind: BridgeEventKind::CucumberExampleResult,
        payload: result,
        run_id: run_id.into(),
        timestamp: timestamp.into(),
    }
}

pub fn write_bridge_event(
    root_dir: impl AsRef<Path>,
    event: &BridgeEvent,
) -> Result<PathBuf, HarnessRunnerError> {
    let directory = ensure_bridge_events_dir(root_dir, &event.run_id)?;
    let name = next_shard_name();
    let path = directory.join(format!("{name}.ndjson"));
    let temporary_path = directory.join(format!("{name}.tmp"));
    let raw =
        serde_json::to_string(event).map_err(|error| HarnessRunnerError::EventShardWriteError {
            path: path.clone(),
            cause: error.to_string(),
        })?;
    fs::write(&temporary_path, format!("{raw}\n")).map_err(|error| {
        HarnessRunnerError::EventShardWriteError {
            path: temporary_path.clone(),
            cause: error.to_string(),
        }
    })?;
    fs::rename(&temporary_path, &path).map_err(|error| {
        HarnessRunnerError::EventShardWriteError {
            path: path.clone(),
            cause: error.to_string(),
        }
    })?;
    Ok(path)
}

pub fn record_example_result(
    root_dir: impl AsRef<Path>,
    run_id: &str,
    bridge: BridgeDescriptor,
    result: ExampleResult,
) -> Result<PathBuf, HarnessRunnerError> {
    validate_example_result(&result).map_err(|error| HarnessRunnerError::InvalidExampleResult {
        cause: error.to_string(),
    })?;
    let event = create_example_result_event(run_id.to_string(), bridge, result, generated_at());
    write_bridge_event(root_dir, &event)
}

pub fn require_bridge_events(
    summary: &MergeSummary,
    run_id: &str,
    directory: impl AsRef<Path>,
) -> Result<(), HarnessRunnerError> {
    if summary.event_count == 0 {
        return Err(HarnessRunnerError::NoBridgeEvents {
            directory: directory.as_ref().to_path_buf(),
            run_id: run_id.to_string(),
        });
    }
    Ok(())
}

pub fn cucumber_tag_expression(selection: &HarnessRunnerSelection) -> Option<String> {
    let tags = selected_cucumber_tags(selection);
    if tags.is_empty() {
        None
    } else {
        Some(tags.join(" and "))
    }
}

pub fn selection_environment(selection: &HarnessRunnerSelection) -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();
    if let Some(expression) = cucumber_tag_expression(selection) {
        env.insert(
            HARNESS_CUCUMBER_TAG_EXPRESSION_ENV_VAR.to_string(),
            expression,
        );
    }
    insert_selection_env(
        &mut env,
        HARNESS_RUNNER_PACKAGE_ENV_VAR,
        selection.package.as_deref(),
        "@package:",
    );
    insert_selection_env(
        &mut env,
        HARNESS_RUNNER_MODULE_ENV_VAR,
        selection.module.as_deref(),
        "@module:",
    );
    insert_selection_env(
        &mut env,
        HARNESS_RUNNER_FEATURE_ENV_VAR,
        selection.feature.as_deref(),
        "@feature:",
    );
    insert_selection_env(
        &mut env,
        HARNESS_RUNNER_RULE_ENV_VAR,
        selection.rule.as_deref(),
        "@rule:",
    );
    insert_selection_env(
        &mut env,
        HARNESS_RUNNER_EXAMPLE_ENV_VAR,
        selection.example.as_deref(),
        "@example:",
    );
    insert_selection_env(
        &mut env,
        HARNESS_RUNNER_LOCALE_ENV_VAR,
        selection.locale.as_deref(),
        "@locale:",
    );
    env
}

pub fn merge_bridge_events(
    root_dir: impl AsRef<Path>,
    run_id: &str,
) -> Result<MergeSummary, HarnessRunnerError> {
    let root_dir = root_dir.as_ref();
    let directory = bridge_events_dir(root_dir, run_id);
    merge_bridge_events_from_dir(root_dir, run_id, directory)
}

pub fn merge_bridge_events_from_dir(
    root_dir: impl AsRef<Path>,
    run_id: &str,
    directory: impl AsRef<Path>,
) -> Result<MergeSummary, HarnessRunnerError> {
    let root_dir = root_dir.as_ref();
    let directory = directory.as_ref().to_path_buf();
    let mut by_identity = BTreeMap::<String, ExampleResult>::new();
    let mut event_count = 0;

    if directory.exists() {
        let mut paths = fs::read_dir(&directory)
            .map_err(|error| HarnessRunnerError::EventsDirectoryReadError {
                path: directory.clone(),
                cause: error.to_string(),
            })?
            .map(|entry| entry.map(|entry| entry.path()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| HarnessRunnerError::EventsDirectoryReadError {
                path: directory.clone(),
                cause: error.to_string(),
            })?;
        paths.sort();

        for path in paths.into_iter().filter(|path| is_event_shard(path)) {
            for event in read_events_from_shard(&path, run_id)? {
                let result = event.payload;
                by_identity.insert(result_identity(&result), result);
                event_count += 1;
            }
        }
    }

    let results = by_identity.into_values().collect::<Vec<_>>();
    let result_count = results.len();
    if results.is_empty() {
        remove_results_file(root_dir)?;
    } else {
        let file = create_results_file(results, generated_at());
        write_results_file(root_dir, &file)?;
    }

    Ok(MergeSummary {
        event_count,
        result_count,
    })
}

pub fn create_results_file(
    mut results: Vec<ExampleResult>,
    generated_at: impl Into<String>,
) -> ResultsFile {
    results.sort_by(|left, right| result_identity(left).cmp(&result_identity(right)));
    ResultsFile {
        api_version: ProtocolVersion,
        generated_at: generated_at.into(),
        results,
    }
}

pub fn write_results_file(
    root_dir: impl AsRef<Path>,
    file: &ResultsFile,
) -> Result<(), HarnessRunnerError> {
    let path = root_dir.as_ref().join(HARNESS_RESULTS_PATH);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            HarnessRunnerError::ResultsDirectoryCreateError {
                path: parent.to_path_buf(),
                cause: error.to_string(),
            }
        })?;
    }
    let raw = serde_yaml::to_string(file).map_err(|error| {
        HarnessRunnerError::ResultsFileDecodeError {
            path: path.clone(),
            cause: error.to_string(),
        }
    })?;
    fs::write(&path, raw).map_err(|error| HarnessRunnerError::ResultsFileWriteError {
        path,
        cause: error.to_string(),
    })
}

pub fn remove_results_file(root_dir: impl AsRef<Path>) -> Result<(), HarnessRunnerError> {
    let path = root_dir.as_ref().join(HARNESS_RESULTS_PATH);
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(HarnessRunnerError::ResultsFileWriteError {
            path,
            cause: error.to_string(),
        }),
    }
}

pub fn load_results_file(
    root_dir: impl AsRef<Path>,
) -> Result<Option<ResultsFile>, HarnessRunnerError> {
    let path = root_dir.as_ref().join(HARNESS_RESULTS_PATH);
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(HarnessRunnerError::ResultsFileReadError {
                path,
                cause: error.to_string(),
            })
        }
    };
    harness_protocol::decode_results_file(&raw)
        .map_err(|error| HarnessRunnerError::ResultsFileDecodeError {
            path,
            cause: error.to_string(),
        })
        .map(Some)
}

pub fn run_cli(args: impl IntoIterator<Item = String>) -> i32 {
    let args = args.into_iter().collect::<Vec<_>>();
    match args.first().map(String::as_str) {
        Some("clear") => print_result(clear_bridge_events(
            harness_root_dir(),
            args.get(1).map(String::as_str).unwrap_or(DEFAULT_RUN_ID),
        )),
        Some("merge") => {
            let run_id = args.get(1).map(String::as_str).unwrap_or(DEFAULT_RUN_ID);
            match merge_bridge_events(harness_root_dir(), run_id) {
                Ok(summary) => {
                    println!(
                        "Merged {} bridge events into {} results at {HARNESS_RESULTS_PATH}.",
                        summary.event_count, summary.result_count
                    );
                    0
                }
                Err(error) => {
                    eprintln!("{error}");
                    1
                }
            }
        }
        Some("run") => run_command_and_merge(&args[1..]),
        Some(_) => {
            eprintln!("{USAGE}");
            1
        }
        None => {
            println!("{USAGE}");
            0
        }
    }
}

pub fn current_run_id() -> String {
    env::var(HARNESS_RUN_ID_ENV_VAR).unwrap_or_else(|_| DEFAULT_RUN_ID.to_string())
}

pub fn new_run_id() -> String {
    let count = RUN_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("run-{}-{}-{count}", timestamp_millis(), std::process::id())
}

pub fn harness_root_dir() -> PathBuf {
    env::var_os(HARNESS_ROOT_ENV_VAR)
        .map(PathBuf::from)
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

pub fn generated_at() -> String {
    format!("unix-ms:{}", timestamp_millis())
}

fn run_command_and_merge(args: &[String]) -> i32 {
    let parsed = match parse_run_args(args) {
        Ok(parsed) => parsed,
        Err(error) => {
            eprintln!("{error}");
            eprintln!("{USAGE}");
            return 1;
        }
    };
    let root_dir = harness_root_dir();
    let events_dir = default_bridge_events_dir(&root_dir, &parsed.run_id);
    if let Err(error) = clear_bridge_events_dir(&events_dir) {
        eprintln!("{error}");
        return 1;
    }
    let events_dir = match ensure_bridge_events_dir_path(&events_dir) {
        Ok(directory) => directory,
        Err(error) => {
            eprintln!("{error}");
            return 1;
        }
    };

    let mut process = Command::new(&parsed.command[0]);
    process.args(&parsed.command[1..]);
    process
        .current_dir(&root_dir)
        .env(HARNESS_ROOT_ENV_VAR, &root_dir)
        .env(HARNESS_RUN_ID_ENV_VAR, &parsed.run_id)
        .env(HARNESS_BRIDGE_EVENTS_DIR_ENV_VAR, &events_dir);
    for (key, value) in selection_environment(&parsed.selection) {
        process.env(key, value);
    }

    let command_status = match process.status() {
        Ok(status) => status.code().unwrap_or(1),
        Err(error) => {
            eprintln!(
                "{}",
                HarnessRunnerError::CommandSpawnError {
                    command: parsed.command.join(" "),
                    cause: error.to_string(),
                }
            );
            return 1;
        }
    };

    match merge_bridge_events_from_dir(&root_dir, &parsed.run_id, &events_dir) {
        Ok(summary) => {
            if command_status == 0 {
                if let Err(error) = require_bridge_events(&summary, &parsed.run_id, &events_dir) {
                    eprintln!("{error}");
                    return 1;
                }
            }
            println!(
                "Merged {} bridge events into {} results at {HARNESS_RESULTS_PATH}.",
                summary.event_count, summary.result_count
            );
            command_status
        }
        Err(error) => {
            eprintln!("{error}");
            1
        }
    }
}

fn parse_run_args(args: &[String]) -> Result<ParsedRunCommand, HarnessRunnerError> {
    let mut index = 0;
    let mut run_id = new_run_id();
    let mut selection = HarnessRunnerSelection::default();

    while index < args.len() {
        match args.get(index).map(String::as_str) {
            Some("--run-id") => {
                run_id = take_arg_value(args, index, "--run-id")?;
                index += 2;
            }
            Some("--package") => {
                selection.package = Some(take_arg_value(args, index, "--package")?);
                index += 2;
            }
            Some("--module") => {
                selection.module = Some(take_arg_value(args, index, "--module")?);
                index += 2;
            }
            Some("--feature") => {
                selection.feature = Some(take_arg_value(args, index, "--feature")?);
                index += 2;
            }
            Some("--rule") => {
                selection.rule = Some(take_arg_value(args, index, "--rule")?);
                index += 2;
            }
            Some("--example") => {
                selection.example = Some(take_arg_value(args, index, "--example")?);
                index += 2;
            }
            Some("--locale") => {
                selection.locale = Some(take_arg_value(args, index, "--locale")?);
                index += 2;
            }
            Some("--") => {
                index += 1;
                break;
            }
            Some(_) | None => break,
        }
    }

    let command = args[index..].to_vec();
    if command.is_empty() {
        return Err(HarnessRunnerError::CommandMissing);
    }
    Ok(ParsedRunCommand {
        command,
        run_id,
        selection,
    })
}

fn take_arg_value(
    args: &[String],
    index: usize,
    _flag: &str,
) -> Result<String, HarnessRunnerError> {
    args.get(index + 1)
        .filter(|value| !value.trim().is_empty() && !value.starts_with("--"))
        .cloned()
        .ok_or(HarnessRunnerError::CommandMissing)
}

fn selected_cucumber_tags(selection: &HarnessRunnerSelection) -> Vec<String> {
    let mut tags = Vec::new();
    push_selection_tag(&mut tags, selection.package.as_deref(), "@package:");
    push_selection_tag(&mut tags, selection.module.as_deref(), "@module:");
    push_selection_tag(&mut tags, selection.feature.as_deref(), "@feature:");
    push_selection_tag(&mut tags, selection.rule.as_deref(), "@rule:");
    push_selection_tag(&mut tags, selection.example.as_deref(), "@example:");
    push_selection_tag(&mut tags, selection.locale.as_deref(), "@locale:");
    tags
}

fn push_selection_tag(tags: &mut Vec<String>, value: Option<&str>, prefix: &str) {
    if let Some(value) = value {
        let value = value.trim();
        if !value.is_empty() {
            tags.push(normalize_tag(value, prefix));
        }
    }
}

fn insert_selection_env(
    env: &mut BTreeMap<String, String>,
    key: &str,
    value: Option<&str>,
    prefix: &str,
) {
    if let Some(value) = value {
        let value = value.trim();
        if !value.is_empty() {
            env.insert(key.to_string(), normalize_tag(value, prefix));
        }
    }
}

fn normalize_tag(value: &str, prefix: &str) -> String {
    if value.starts_with('@') {
        value.to_string()
    } else {
        format!("{prefix}{value}")
    }
}

fn print_result(result: Result<(), HarnessRunnerError>) -> i32 {
    match result {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("{error}");
            1
        }
    }
}

fn read_events_from_shard(
    path: &Path,
    expected_run_id: &str,
) -> Result<Vec<BridgeEvent>, HarnessRunnerError> {
    let raw =
        fs::read_to_string(path).map_err(|error| HarnessRunnerError::EventShardReadError {
            path: path.to_path_buf(),
            cause: error.to_string(),
        })?;
    let mut events = Vec::new();
    for (index, line) in raw.lines().enumerate() {
        let line_number = index + 1;
        if line.trim().is_empty() {
            continue;
        }
        let event = decode_bridge_event(line).map_err(|error| {
            HarnessRunnerError::EventShardDecodeError {
                path: path.to_path_buf(),
                line: line_number,
                cause: error.to_string(),
            }
        })?;
        if event.run_id != expected_run_id {
            return Err(HarnessRunnerError::RunIdMismatch {
                path: path.to_path_buf(),
                line: line_number,
                expected: expected_run_id.to_string(),
                actual: event.run_id,
            });
        }
        events.push(event);
    }
    Ok(events)
}

fn result_identity(result: &ExampleResult) -> String {
    [
        result.feature.as_str(),
        result.rule.as_str(),
        result.example.as_str(),
        &labels_identity(&result.labels),
    ]
    .join("\u{0}")
}

fn labels_identity(labels: &BTreeMap<String, String>) -> String {
    labels
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("\u{1}")
}

fn is_event_shard(path: &Path) -> bool {
    path.is_file()
        && path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(".ndjson"))
}

fn next_shard_name() -> String {
    let count = SHARD_COUNTER.fetch_add(1, Ordering::Relaxed);
    let process_id = std::process::id();
    format!("{}-{process_id}-{count}", timestamp_millis())
}

fn timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}
