use harness_adapter_runtime::{
    clear_adapter_events, clear_adapter_events_dir, current_run_id, default_adapter_events_dir,
    ensure_adapter_events_dir_path, merge_adapter_events, merge_adapter_events_from_dir,
    new_run_id, record_test_result, require_adapter_events, AdapterRuntimeError,
    HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR, HARNESS_RUN_ID_ENV_VAR,
};
use harness_core::{HARNESS_RESULTS_PATH, HARNESS_ROOT_ENV_VAR};
use harness_protocol::{AdapterDescriptor, TestResult, TestResultStatus};
use std::any::Any;
use std::env;
use std::fmt;
use std::panic::{catch_unwind, resume_unwind, AssertUnwindSafe, Location};
use std::path::{Path, PathBuf};
use std::process::Command;

const USAGE: &str = "Usage: harness-adapter-rust <run [cargo test args...]|merge|clear>";

#[derive(Debug, Clone)]
pub enum RustAdapterError {
    CargoSpawnError { cause: String },
    RuntimeError { cause: AdapterRuntimeError },
}

impl fmt::Display for RustAdapterError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::CargoSpawnError { cause } => {
                write!(formatter, "CargoSpawnError\n{cause}")
            }
            Self::RuntimeError { cause } => write!(formatter, "{cause}"),
        }
    }
}

impl std::error::Error for RustAdapterError {}

impl From<AdapterRuntimeError> for RustAdapterError {
    fn from(cause: AdapterRuntimeError) -> Self {
        Self::RuntimeError { cause }
    }
}

#[track_caller]
pub fn scenario_test<F, R>(promise_id: &str, test_name: &str, body: F) -> R
where
    F: FnOnce() -> R,
{
    if promise_id.trim().is_empty() {
        panic!("scenario_test requires a non-blank promise id.");
    }
    if test_name.trim().is_empty() {
        panic!("scenario_test requires a non-blank test name.");
    }

    let file = Location::caller().file().replace('\\', "/");
    let outcome = catch_unwind(AssertUnwindSafe(body));
    match outcome {
        Ok(value) => {
            record_passing_result_or_panic(TestResult {
                failure_message: None,
                file,
                labels: Default::default(),
                promise_id: promise_id.to_string(),
                status: TestResultStatus::Passing,
                test_name: test_name.to_string(),
            });
            value
        }
        Err(payload) => {
            let failure_message = panic_payload_message(payload.as_ref());
            if let Err(error) = write_scenario_result(TestResult {
                failure_message: Some(failure_message),
                file,
                labels: Default::default(),
                promise_id: promise_id.to_string(),
                status: TestResultStatus::Failing,
                test_name: test_name.to_string(),
            }) {
                eprintln!("Rust Harness adapter failed to record failing result: {error}");
            }
            resume_unwind(payload);
        }
    }
}

#[macro_export]
macro_rules! scenario_test {
    ($promise_id:expr, $test_name:expr, $body:block) => {{
        $crate::scenario_test($promise_id, $test_name, || $body)
    }};
    ($promise_id:expr, $test_name:expr, $body:expr) => {{
        $crate::scenario_test($promise_id, $test_name, || $body)
    }};
}

pub fn clear_rust_test_results(root_dir: impl AsRef<Path>) -> Result<(), RustAdapterError> {
    clear_adapter_events(root_dir, &current_run_id()).map_err(Into::into)
}

pub fn merge_rust_test_results(root_dir: impl AsRef<Path>) -> Result<usize, RustAdapterError> {
    merge_adapter_events(root_dir, &current_run_id())
        .map(|summary| summary.result_count)
        .map_err(Into::into)
}

pub fn run_cli(args: impl IntoIterator<Item = String>) -> i32 {
    let args = args.into_iter().collect::<Vec<_>>();
    match args.first().map(String::as_str) {
        Some("clear") => print_result(clear_rust_test_results(harness_root_dir())),
        Some("merge") => match merge_rust_test_results(harness_root_dir()) {
            Ok(count) => {
                println!("Merged {count} Rust Harness results into {HARNESS_RESULTS_PATH}.");
                0
            }
            Err(error) => {
                eprintln!("{error}");
                1
            }
        },
        Some("run") => run_cargo_tests_and_merge(&args[1..]),
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

fn run_cargo_tests_and_merge(cargo_test_args: &[String]) -> i32 {
    let root_dir = harness_root_dir();
    let run_id = new_run_id();
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

    let mut command = Command::new("cargo");
    command.arg("test");
    if cargo_test_args.is_empty() {
        command.arg("--workspace");
    } else {
        command.args(cargo_test_args);
    }
    command
        .current_dir(&root_dir)
        .env(HARNESS_ROOT_ENV_VAR, &root_dir)
        .env(HARNESS_RUN_ID_ENV_VAR, &run_id)
        .env(HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR, &events_dir);

    let test_status = match command.status() {
        Ok(status) => status.code().unwrap_or(1),
        Err(error) => {
            eprintln!(
                "{}",
                RustAdapterError::CargoSpawnError {
                    cause: error.to_string()
                }
            );
            return 1;
        }
    };

    match merge_adapter_events_from_dir(&root_dir, &run_id, &events_dir) {
        Ok(summary) => {
            if test_status == 0 {
                if let Err(error) = require_adapter_events(&summary, &run_id, &events_dir) {
                    eprintln!("{error}");
                    return 1;
                }
            }
            println!(
                "Merged {} Rust Harness adapter events into {} results at {HARNESS_RESULTS_PATH}.",
                summary.event_count, summary.result_count
            );
            test_status
        }
        Err(error) => {
            eprintln!("{error}");
            1
        }
    }
}

fn print_result(result: Result<(), RustAdapterError>) -> i32 {
    match result {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("{error}");
            1
        }
    }
}

fn write_scenario_result(result: TestResult) -> Result<PathBuf, RustAdapterError> {
    record_test_result(
        harness_root_dir(),
        &current_run_id(),
        rust_adapter_descriptor(),
        result,
    )
    .map_err(Into::into)
}

fn record_passing_result_or_panic(result: TestResult) {
    if let Err(error) = write_scenario_result(result.clone()) {
        let mut failing_result = result;
        failing_result.status = TestResultStatus::Failing;
        failing_result.failure_message = Some(format!(
            "Rust Harness adapter failed to record passing result: {error}"
        ));
        let _ = write_scenario_result(failing_result);
        panic!("Rust Harness adapter failed to record passing result: {error}");
    }
}

fn rust_adapter_descriptor() -> AdapterDescriptor {
    AdapterDescriptor {
        framework: Some("cargo".to_string()),
        name: "harness-adapter-rust".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

fn harness_root_dir() -> PathBuf {
    env::var_os(HARNESS_ROOT_ENV_VAR)
        .map(PathBuf::from)
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

fn panic_payload_message(payload: &(dyn Any + Send)) -> String {
    if let Some(message) = payload.downcast_ref::<&'static str>() {
        (*message).to_string()
    } else if let Some(message) = payload.downcast_ref::<String>() {
        message.clone()
    } else {
        "test panicked".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use harness_adapter_runtime::adapter_events_dir;
    use harness_core::{load_test_results, HARNESS_ROOT_ENV_VAR};
    use std::panic::catch_unwind;
    use std::sync::Mutex;
    use tempfile::tempdir;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    struct EnvGuard {
        previous_events_dir: Option<std::ffi::OsString>,
        previous_root: Option<std::ffi::OsString>,
        previous_run_id: Option<std::ffi::OsString>,
    }

    impl EnvGuard {
        fn set(root: &Path, run_id: &str, events_dir: &Path) -> Self {
            let previous_root = env::var_os(HARNESS_ROOT_ENV_VAR);
            let previous_run_id = env::var_os(HARNESS_RUN_ID_ENV_VAR);
            let previous_events_dir = env::var_os(HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR);
            env::set_var(HARNESS_ROOT_ENV_VAR, root);
            env::set_var(HARNESS_RUN_ID_ENV_VAR, run_id);
            env::set_var(HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR, events_dir);
            Self {
                previous_events_dir,
                previous_root,
                previous_run_id,
            }
        }

        fn clear_events_dir() -> Self {
            let previous_root = env::var_os(HARNESS_ROOT_ENV_VAR);
            let previous_run_id = env::var_os(HARNESS_RUN_ID_ENV_VAR);
            let previous_events_dir = env::var_os(HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR);
            env::remove_var(HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR);
            Self {
                previous_events_dir,
                previous_root,
                previous_run_id,
            }
        }
    }

    impl Drop for EnvGuard {
        fn drop(&mut self) {
            restore_env(HARNESS_ROOT_ENV_VAR, self.previous_root.take());
            restore_env(HARNESS_RUN_ID_ENV_VAR, self.previous_run_id.take());
            restore_env(
                HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR,
                self.previous_events_dir.take(),
            );
        }
    }

    fn restore_env(key: &str, value: Option<std::ffi::OsString>) {
        match value {
            Some(value) => env::set_var(key, value),
            None => env::remove_var(key),
        }
    }

    #[test]
    fn scenario_helper_binds_tests_to_canonical_promises() {
        let _lock = lock_env();
        let temp = tempdir().unwrap();
        let events_dir = temp.path().join("events");
        let _env = EnvGuard::set(temp.path(), "scenario-helper", &events_dir);

        scenario_test(
            "harness.adapters.rust.scenario_helper.binds_tests_to_canonical_promises",
            "Rust scenario tests bind to promise ids and reject blank ids",
            || {
                let panic = catch_unwind(|| scenario_test("", "blank id", || ()));
                assert!(panic.is_err());
            },
        );

        let merged_count = merge_rust_test_results(temp.path()).unwrap();
        assert_eq!(merged_count, 1);
        let results = load_test_results(temp.path()).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(
            results[0].promise_id,
            "harness.adapters.rust.scenario_helper.binds_tests_to_canonical_promises"
        );
        assert_eq!(results[0].status, TestResultStatus::Passing);
    }

    #[test]
    fn result_collector_maps_and_persists_rust_results() {
        let _lock = lock_env();
        let temp = tempdir().unwrap();
        let events_dir = temp.path().join("events");
        let _env = EnvGuard::set(temp.path(), "result-collector", &events_dir);

        scenario_test(
            "harness.adapters.rust.result_collector.maps_results_to_promises",
            "Rust adapter merges adapter event shards into Harness result YAML",
            || {
                let result = TestResult {
                    failure_message: None,
                    file: "crates/harness-adapter-rust/tests/sample.rs".to_string(),
                    labels: Default::default(),
                    promise_id: "harness.adapters.rust.result_collector.maps_results_to_promises"
                        .to_string(),
                    status: TestResultStatus::Passing,
                    test_name: "sample Rust scenario".to_string(),
                };
                write_scenario_result(result.clone()).unwrap();
                let merged_count = merge_rust_test_results(temp.path()).unwrap();
                assert_eq!(merged_count, 1);
                let results = load_test_results(temp.path()).unwrap();
                assert_eq!(results, vec![result]);
            },
        );
    }

    #[test]
    fn result_collector_writes_to_explicit_harness_root() {
        let _lock = lock_env();
        let temp = tempdir().unwrap();
        let events_dir = temp.path().join("custom-events");
        let _env = EnvGuard::set(temp.path(), "explicit-root", &events_dir);

        scenario_test(
            "harness.adapters.rust.result_collector.writes_results_to_explicit_harness_root",
            "Rust adapter writes merged results under HARNESS_ROOT_DIR",
            || {
                write_scenario_result(TestResult {
                    failure_message: None,
                    file: "crates/harness-adapter-rust/src/lib.rs".to_string(),
                    labels: Default::default(),
                    promise_id:
                        "harness.adapters.rust.result_collector.writes_results_to_explicit_harness_root"
                            .to_string(),
                    status: TestResultStatus::Passing,
                    test_name: "explicit root".to_string(),
                })
                .unwrap();
                merge_rust_test_results(temp.path()).unwrap();
                assert!(temp.path().join(HARNESS_RESULTS_PATH).exists());
                assert!(events_dir.exists());
            },
        );
    }

    #[test]
    fn adapter_events_default_to_run_scoped_directories() {
        let _lock = lock_env();
        let _env = EnvGuard::clear_events_dir();
        let temp = tempdir().unwrap();
        let events_dir = adapter_events_dir(temp.path(), "runtime-run");
        assert!(events_dir.ends_with(".harness/runs/runtime-run/events"));
    }

    fn lock_env() -> std::sync::MutexGuard<'static, ()> {
        ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}
