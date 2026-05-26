use harness_core::{
    create_test_results_file, write_test_results_file, HARNESS_RESULTS_PATH, HARNESS_ROOT_ENV_VAR,
};
use harness_protocol::{
    decode_adapter_event, AdapterDescriptor, AdapterEvent, AdapterEventKind,
    AdapterTestResultPayload, ProtocolVersion, TestResult,
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

pub const HARNESS_RUN_ID_ENV_VAR: &str = "HARNESS_RUN_ID";
pub const HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR: &str = "HARNESS_ADAPTER_EVENTS_DIR";

const DEFAULT_RUN_ID: &str = "default";
const USAGE: &str = "\
Usage:
  harness-adapter-runtime merge [run-id]
  harness-adapter-runtime clear [run-id]
  harness-adapter-runtime run [--run-id <run-id>] -- <command> [args...]";

static RUN_COUNTER: AtomicU64 = AtomicU64::new(0);
static SHARD_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeSummary {
    pub event_count: usize,
    pub result_count: usize,
}

#[derive(Debug, Clone)]
pub enum AdapterRuntimeError {
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
    EventShardDecodeError {
        path: PathBuf,
        line: usize,
        cause: String,
    },
    NoAdapterEvents {
        directory: PathBuf,
        run_id: String,
    },
    ResultsFileWriteError {
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

impl fmt::Display for AdapterRuntimeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::CommandMissing => formatter.write_str("AdapterRuntimeCommandMissing"),
            Self::CommandSpawnError { command, cause } => {
                write!(
                    formatter,
                    "AdapterRuntimeCommandSpawnError {command}\n{cause}"
                )
            }
            Self::EventsDirectoryClearError { path, cause } => write!(
                formatter,
                "AdapterRuntimeEventsDirectoryClearError {}\n{cause}",
                path.display()
            ),
            Self::EventsDirectoryCreateError { path, cause } => write!(
                formatter,
                "AdapterRuntimeEventsDirectoryCreateError {}\n{cause}",
                path.display()
            ),
            Self::EventsDirectoryReadError { path, cause } => write!(
                formatter,
                "AdapterRuntimeEventsDirectoryReadError {}\n{cause}",
                path.display()
            ),
            Self::EventShardReadError { path, cause } => write!(
                formatter,
                "AdapterRuntimeEventShardReadError {}\n{cause}",
                path.display()
            ),
            Self::EventShardWriteError { path, cause } => write!(
                formatter,
                "AdapterRuntimeEventShardWriteError {}\n{cause}",
                path.display()
            ),
            Self::EventShardDecodeError { path, line, cause } => write!(
                formatter,
                "AdapterRuntimeEventShardDecodeError {}:{line}\n{cause}",
                path.display()
            ),
            Self::NoAdapterEvents { directory, run_id } => write!(
                formatter,
                "AdapterRuntimeNoAdapterEvents {run_id}\nno adapter events were collected in {}",
                directory.display()
            ),
            Self::ResultsFileWriteError { path, cause } => write!(
                formatter,
                "AdapterRuntimeResultsFileWriteError {}\n{cause}",
                path.display()
            ),
            Self::RunIdMismatch {
                path,
                line,
                expected,
                actual,
            } => write!(
                formatter,
                "AdapterRuntimeRunIdMismatch {}:{line}\nexpected {expected}, got {actual}",
                path.display()
            ),
        }
    }
}

impl std::error::Error for AdapterRuntimeError {}

pub fn adapter_events_dir(root_dir: impl AsRef<Path>, run_id: &str) -> PathBuf {
    match env::var_os(HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR) {
        Some(value) => {
            let path = PathBuf::from(value);
            if path.is_absolute() {
                path
            } else {
                root_dir.as_ref().join(path)
            }
        }
        None => default_adapter_events_dir(root_dir, run_id),
    }
}

pub fn default_adapter_events_dir(root_dir: impl AsRef<Path>, run_id: &str) -> PathBuf {
    root_dir
        .as_ref()
        .join(".harness")
        .join("runs")
        .join(run_id)
        .join("events")
}

pub fn clear_adapter_events(
    root_dir: impl AsRef<Path>,
    run_id: &str,
) -> Result<(), AdapterRuntimeError> {
    let directory = adapter_events_dir(root_dir, run_id);
    clear_adapter_events_dir(directory)
}

pub fn clear_adapter_events_dir(directory: impl AsRef<Path>) -> Result<(), AdapterRuntimeError> {
    let directory = directory.as_ref().to_path_buf();
    match fs::remove_dir_all(&directory) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(AdapterRuntimeError::EventsDirectoryClearError {
            path: directory,
            cause: error.to_string(),
        }),
    }
}

pub fn ensure_adapter_events_dir(
    root_dir: impl AsRef<Path>,
    run_id: &str,
) -> Result<PathBuf, AdapterRuntimeError> {
    let directory = adapter_events_dir(root_dir, run_id);
    ensure_adapter_events_dir_path(directory)
}

pub fn ensure_adapter_events_dir_path(
    directory: impl AsRef<Path>,
) -> Result<PathBuf, AdapterRuntimeError> {
    let directory = directory.as_ref().to_path_buf();
    fs::create_dir_all(&directory).map_err(|error| {
        AdapterRuntimeError::EventsDirectoryCreateError {
            path: directory.clone(),
            cause: error.to_string(),
        }
    })?;
    Ok(directory)
}

pub fn create_test_result_event(
    run_id: impl Into<String>,
    adapter: AdapterDescriptor,
    result: TestResult,
    timestamp: impl Into<String>,
) -> AdapterEvent {
    AdapterEvent {
        adapter,
        api_version: ProtocolVersion,
        kind: AdapterEventKind::TestResult,
        payload: AdapterTestResultPayload {
            failure_message: result.failure_message,
            file: result.file,
            labels: result.labels,
            promise_id: result.promise_id,
            status: result.status,
            test_name: result.test_name,
        },
        run_id: run_id.into(),
        timestamp: timestamp.into(),
    }
}

pub fn write_adapter_event(
    root_dir: impl AsRef<Path>,
    event: &AdapterEvent,
) -> Result<PathBuf, AdapterRuntimeError> {
    let directory = ensure_adapter_events_dir(root_dir, &event.run_id)?;
    let name = next_shard_name();
    let path = directory.join(format!("{name}.ndjson"));
    let temporary_path = directory.join(format!("{name}.tmp"));
    let raw = serde_json::to_string(event).map_err(|error| {
        AdapterRuntimeError::EventShardWriteError {
            path: path.clone(),
            cause: error.to_string(),
        }
    })?;
    fs::write(&temporary_path, format!("{raw}\n")).map_err(|error| {
        AdapterRuntimeError::EventShardWriteError {
            path: temporary_path.clone(),
            cause: error.to_string(),
        }
    })?;
    fs::rename(&temporary_path, &path).map_err(|error| {
        AdapterRuntimeError::EventShardWriteError {
            path: path.clone(),
            cause: error.to_string(),
        }
    })?;
    Ok(path)
}

pub fn record_test_result(
    root_dir: impl AsRef<Path>,
    run_id: &str,
    adapter: AdapterDescriptor,
    result: TestResult,
) -> Result<PathBuf, AdapterRuntimeError> {
    let event = create_test_result_event(run_id.to_string(), adapter, result, generated_at());
    write_adapter_event(root_dir, &event)
}

pub fn require_adapter_events(
    summary: &MergeSummary,
    run_id: &str,
    directory: impl AsRef<Path>,
) -> Result<(), AdapterRuntimeError> {
    if summary.event_count == 0 {
        return Err(AdapterRuntimeError::NoAdapterEvents {
            directory: directory.as_ref().to_path_buf(),
            run_id: run_id.to_string(),
        });
    }
    Ok(())
}

pub fn merge_adapter_events(
    root_dir: impl AsRef<Path>,
    run_id: &str,
) -> Result<MergeSummary, AdapterRuntimeError> {
    let root_dir = root_dir.as_ref();
    let directory = adapter_events_dir(root_dir, run_id);
    merge_adapter_events_from_dir(root_dir, run_id, directory)
}

pub fn merge_adapter_events_from_dir(
    root_dir: impl AsRef<Path>,
    run_id: &str,
    directory: impl AsRef<Path>,
) -> Result<MergeSummary, AdapterRuntimeError> {
    let root_dir = root_dir.as_ref();
    let directory = directory.as_ref().to_path_buf();
    let mut by_identity = BTreeMap::<String, TestResult>::new();
    let mut event_count = 0;

    if directory.exists() {
        let mut paths = fs::read_dir(&directory)
            .map_err(|error| AdapterRuntimeError::EventsDirectoryReadError {
                path: directory.clone(),
                cause: error.to_string(),
            })?
            .map(|entry| entry.map(|entry| entry.path()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| AdapterRuntimeError::EventsDirectoryReadError {
                path: directory.clone(),
                cause: error.to_string(),
            })?;
        paths.sort();

        for path in paths.into_iter().filter(|path| is_event_shard(path)) {
            for event in read_events_from_shard(&path, run_id)? {
                let result = test_result_from_event(event);
                by_identity.insert(result_identity(&result), result);
                event_count += 1;
            }
        }
    }

    let results = by_identity.into_values().collect::<Vec<_>>();
    let result_count = results.len();
    let file = create_test_results_file(results, generated_at());
    write_test_results_file(root_dir, &file).map_err(|error| {
        AdapterRuntimeError::ResultsFileWriteError {
            path: root_dir.join(HARNESS_RESULTS_PATH),
            cause: error.to_string(),
        }
    })?;

    Ok(MergeSummary {
        event_count,
        result_count,
    })
}

pub fn run_cli(args: impl IntoIterator<Item = String>) -> i32 {
    let args = args.into_iter().collect::<Vec<_>>();
    match args.first().map(String::as_str) {
        Some("clear") => print_result(clear_adapter_events(
            harness_root_dir(),
            args.get(1).map(String::as_str).unwrap_or(DEFAULT_RUN_ID),
        )),
        Some("merge") => {
            let run_id = args.get(1).map(String::as_str).unwrap_or(DEFAULT_RUN_ID);
            match merge_adapter_events(harness_root_dir(), run_id) {
                Ok(summary) => {
                    println!(
                        "Merged {} adapter events into {} results at {HARNESS_RESULTS_PATH}.",
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
    let (run_id, command) = match parse_run_args(args) {
        Ok(parsed) => parsed,
        Err(error) => {
            eprintln!("{error}");
            eprintln!("{USAGE}");
            return 1;
        }
    };
    let root_dir = harness_root_dir();
    let events_dir = default_adapter_events_dir(&root_dir, &run_id);
    if let Err(error) = clear_adapter_events_dir(&events_dir) {
        eprintln!("{error}");
        return 1;
    }
    let events_dir = match ensure_adapter_events_dir_path(&events_dir) {
        Ok(directory) => directory,
        Err(error) => {
            eprintln!("{error}");
            return 1;
        }
    };

    let mut process = Command::new(&command[0]);
    process.args(&command[1..]);
    process
        .current_dir(&root_dir)
        .env(HARNESS_ROOT_ENV_VAR, &root_dir)
        .env(HARNESS_RUN_ID_ENV_VAR, &run_id)
        .env(HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR, &events_dir);

    let command_status = match process.status() {
        Ok(status) => status.code().unwrap_or(1),
        Err(error) => {
            eprintln!(
                "{}",
                AdapterRuntimeError::CommandSpawnError {
                    command: command.join(" "),
                    cause: error.to_string(),
                }
            );
            return 1;
        }
    };

    match merge_adapter_events_from_dir(&root_dir, &run_id, &events_dir) {
        Ok(summary) => {
            if command_status == 0 {
                if let Err(error) = require_adapter_events(&summary, &run_id, &events_dir) {
                    eprintln!("{error}");
                    return 1;
                }
            }
            println!(
                "Merged {} adapter events into {} results at {HARNESS_RESULTS_PATH}.",
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

fn parse_run_args(args: &[String]) -> Result<(String, Vec<String>), AdapterRuntimeError> {
    let mut index = 0;
    let mut run_id = new_run_id();
    if args.get(index).map(String::as_str) == Some("--run-id") {
        run_id = args
            .get(index + 1)
            .filter(|value| !value.trim().is_empty())
            .cloned()
            .ok_or(AdapterRuntimeError::CommandMissing)?;
        index += 2;
    }
    if args.get(index).map(String::as_str) == Some("--") {
        index += 1;
    }
    let command = args[index..].to_vec();
    if command.is_empty() {
        return Err(AdapterRuntimeError::CommandMissing);
    }
    Ok((run_id, command))
}

fn print_result(result: Result<(), AdapterRuntimeError>) -> i32 {
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
) -> Result<Vec<AdapterEvent>, AdapterRuntimeError> {
    let raw =
        fs::read_to_string(path).map_err(|error| AdapterRuntimeError::EventShardReadError {
            path: path.to_path_buf(),
            cause: error.to_string(),
        })?;
    let mut events = Vec::new();
    for (index, line) in raw.lines().enumerate() {
        let line_number = index + 1;
        if line.trim().is_empty() {
            continue;
        }
        let event = decode_adapter_event(line).map_err(|error| {
            AdapterRuntimeError::EventShardDecodeError {
                path: path.to_path_buf(),
                line: line_number,
                cause: error.to_string(),
            }
        })?;
        if event.run_id != expected_run_id {
            return Err(AdapterRuntimeError::RunIdMismatch {
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

fn test_result_from_event(event: AdapterEvent) -> TestResult {
    TestResult {
        failure_message: event.payload.failure_message,
        file: event.payload.file,
        labels: event.payload.labels,
        promise_id: event.payload.promise_id,
        status: event.payload.status,
        test_name: event.payload.test_name,
    }
}

fn result_identity(result: &TestResult) -> String {
    [
        result.promise_id.as_str(),
        result.file.as_str(),
        result.test_name.as_str(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use harness_core::{load_test_results, HARNESS_ROOT_ENV_VAR};
    use harness_protocol::TestResultStatus;
    use std::sync::Mutex;
    use tempfile::tempdir;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    struct EventsDirGuard {
        previous: Option<std::ffi::OsString>,
    }

    struct RootDirGuard {
        previous: Option<std::ffi::OsString>,
    }

    impl EventsDirGuard {
        fn set(path: &Path) -> Self {
            let previous = env::var_os(HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR);
            env::set_var(HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR, path);
            Self { previous }
        }

        fn clear() -> Self {
            let previous = env::var_os(HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR);
            env::remove_var(HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR);
            Self { previous }
        }
    }

    impl Drop for EventsDirGuard {
        fn drop(&mut self) {
            match self.previous.take() {
                Some(value) => env::set_var(HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR, value),
                None => env::remove_var(HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR),
            }
        }
    }

    impl RootDirGuard {
        fn set(path: &Path) -> Self {
            let previous = env::var_os(HARNESS_ROOT_ENV_VAR);
            env::set_var(HARNESS_ROOT_ENV_VAR, path);
            Self { previous }
        }
    }

    impl Drop for RootDirGuard {
        fn drop(&mut self) {
            match self.previous.take() {
                Some(value) => env::set_var(HARNESS_ROOT_ENV_VAR, value),
                None => env::remove_var(HARNESS_ROOT_ENV_VAR),
            }
        }
    }

    fn adapter() -> AdapterDescriptor {
        AdapterDescriptor {
            framework: Some("fixture".to_string()),
            name: "fixture-adapter".to_string(),
            version: "0.0.0".to_string(),
        }
    }

    fn result(status: TestResultStatus, failure_message: Option<&str>) -> TestResult {
        TestResult {
            failure_message: failure_message.map(str::to_string),
            file: "crates/harness-adapter-runtime/tests/fixture.rs".to_string(),
            labels: Default::default(),
            promise_id: "harness.adapter_runtime.collects_event_shards_into_results".to_string(),
            status,
            test_name: "runtime fixture".to_string(),
        }
    }

    #[test]
    fn writes_events_under_isolated_run_directory() {
        let _lock = ENV_LOCK.lock().unwrap();
        let _env = EventsDirGuard::clear();
        let temp = tempdir().unwrap();
        let run_id = "isolated-run";

        let path = record_test_result(
            temp.path(),
            run_id,
            adapter(),
            result(TestResultStatus::Passing, None),
        )
        .unwrap();

        assert!(path.starts_with(temp.path().join(".harness/runs/isolated-run/events")));
        clear_adapter_events(temp.path(), run_id).unwrap();
        assert!(!adapter_events_dir(temp.path(), run_id).exists());
    }

    #[test]
    fn default_run_directory_ignores_inherited_events_directory() {
        let _lock = ENV_LOCK.lock().unwrap();
        let temp = tempdir().unwrap();
        let inherited = temp.path().join("outer-events");
        let _env = EventsDirGuard::set(&inherited);

        assert_eq!(adapter_events_dir(temp.path(), "inner-run"), inherited);
        assert_eq!(
            default_adapter_events_dir(temp.path(), "inner-run"),
            temp.path().join(".harness/runs/inner-run/events")
        );
    }

    #[test]
    fn merges_event_shards_into_canonical_results() {
        let _lock = ENV_LOCK.lock().unwrap();
        let _env = EventsDirGuard::clear();
        let temp = tempdir().unwrap();
        let run_id = "merge-run";

        record_test_result(
            temp.path(),
            run_id,
            adapter(),
            result(TestResultStatus::Failing, Some("old failure")),
        )
        .unwrap();
        record_test_result(
            temp.path(),
            run_id,
            adapter(),
            result(TestResultStatus::Passing, None),
        )
        .unwrap();

        let summary = merge_adapter_events(temp.path(), run_id).unwrap();
        assert_eq!(summary.event_count, 2);
        assert_eq!(summary.result_count, 1);
        assert_eq!(
            load_test_results(temp.path()).unwrap(),
            vec![result(TestResultStatus::Passing, None)]
        );
    }

    #[test]
    fn rejects_mismatched_run_ids() {
        let _lock = ENV_LOCK.lock().unwrap();
        let _env = EventsDirGuard::clear();
        let temp = tempdir().unwrap();
        let path = write_adapter_event(
            temp.path(),
            &create_test_result_event(
                "actual-run",
                adapter(),
                result(TestResultStatus::Passing, None),
                "2026-05-25T00:00:00.000Z",
            ),
        )
        .unwrap();
        fs::rename(
            path,
            ensure_adapter_events_dir(temp.path(), "expected-run")
                .unwrap()
                .join("mismatch.ndjson"),
        )
        .unwrap();

        assert!(matches!(
            merge_adapter_events(temp.path(), "expected-run"),
            Err(AdapterRuntimeError::RunIdMismatch { .. })
        ));
    }

    #[test]
    fn runtime_run_fails_when_successful_command_collects_no_events() {
        let _lock = ENV_LOCK.lock().unwrap();
        let _events_env = EventsDirGuard::clear();
        let temp = tempdir().unwrap();
        let _root_env = RootDirGuard::set(temp.path());

        let status = run_cli(vec![
            "run".to_string(),
            "--run-id".to_string(),
            "empty-events".to_string(),
            "--".to_string(),
            "sh".to_string(),
            "-c".to_string(),
            ":".to_string(),
        ]);

        assert_eq!(status, 1);
        assert_eq!(load_test_results(temp.path()).unwrap(), Vec::new());
    }

    #[test]
    fn parses_runtime_run_command_arguments() {
        let args = vec![
            "--run-id".to_string(),
            "custom-run".to_string(),
            "--".to_string(),
            "echo".to_string(),
            "ok".to_string(),
        ];

        let (run_id, command) = parse_run_args(&args).unwrap();
        assert_eq!(run_id, "custom-run");
        assert_eq!(command, vec!["echo".to_string(), "ok".to_string()]);
    }
}
