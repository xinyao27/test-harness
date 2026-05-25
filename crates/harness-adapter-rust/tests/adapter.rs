use harness_adapter_runtime::{
    adapter_events_dir, merge_adapter_events, record_test_result,
    HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR, HARNESS_RUN_ID_ENV_VAR,
};
use harness_adapter_rust::{merge_rust_test_results, scenario_test};
use harness_core::{load_test_results, HARNESS_RESULTS_PATH, HARNESS_ROOT_ENV_VAR};
use harness_protocol::{AdapterDescriptor, TestResult, TestResultStatus};
use std::env;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tempfile::tempdir;

static TEST_LOCK: Mutex<()> = Mutex::new(());

#[test]
fn rust_scenario_helper_binds_tests_to_canonical_promises() {
    locked_scenario_test(
        "harness.adapters.rust.scenario_helper.binds_tests_to_canonical_promises",
        "Rust scenario tests bind to promise ids and reject blank ids",
        || {
            let panic = catch_unwind(AssertUnwindSafe(|| {
                harness_adapter_rust::scenario_test("", "blank promise id", || ())
            }));
            assert!(panic.is_err());
        },
    );
}

#[test]
fn rust_result_collector_maps_results_to_promises() {
    locked_scenario_test(
        "harness.adapters.rust.result_collector.maps_results_to_promises",
        "Rust scenario test outcomes are written as promise-keyed adapter events",
        || {
            assert_eq!(2 + 2, 4);
        },
    );
}

#[test]
fn rust_result_collector_writes_to_explicit_harness_root() {
    locked_scenario_test(
        "harness.adapters.rust.result_collector.writes_results_to_explicit_harness_root",
        "Rust scenario tests use the explicit Harness root when present",
        || {
            let root = harness_root();
            write_synthetic_event(
                &root,
                &run_id(),
                "harness.adapters.rust.result_collector.writes_results_to_explicit_harness_root",
                "explicit Harness root proof",
                TestResultStatus::Passing,
                None,
            );

            merge_rust_test_results(&root).unwrap();
            let final_results_path = root.join(HARNESS_RESULTS_PATH);
            assert!(final_results_path.exists());
            assert!(
                load_test_results(&root)
                    .unwrap()
                    .iter()
                    .any(|result| result.promise_id
                        == "harness.adapters.rust.result_collector.writes_results_to_explicit_harness_root")
            );
        },
    );
}

#[test]
fn rust_runner_merges_shards_after_cargo_test() {
    locked_scenario_test(
        "harness.adapters.rust.runner_merges_shards_after_cargo_test",
        "Rust adapter runner has a promise-bound Cargo test to merge",
        || {
            let root = harness_root();
            write_synthetic_event(
                &root,
                &run_id(),
                "harness.adapters.rust.runner_merges_shards_after_cargo_test",
                "runner merge proof",
                TestResultStatus::Passing,
                None,
            );

            assert_eq!(harness_adapter_rust::run_cli(vec!["merge".to_string()]), 0);
            assert!(load_test_results(&root)
                .unwrap()
                .iter()
                .any(|result| result.promise_id
                    == "harness.adapters.rust.runner_merges_shards_after_cargo_test"));
        },
    );
}

#[test]
fn adapter_runtime_collects_event_shards_into_results() {
    locked_scenario_test(
        "harness.adapter_runtime.collects_event_shards_into_results",
        "adapter runtime merges event shards into canonical result YAML",
        || {
            let _env = EnvGuard::clear_adapter_events_dir();
            let temp = tempdir().unwrap();
            write_synthetic_event(
                temp.path(),
                "runtime-collect",
                "harness.adapter_runtime.collects_event_shards_into_results",
                "runtime collection proof",
                TestResultStatus::Passing,
                None,
            );

            let summary = merge_adapter_events(temp.path(), "runtime-collect").unwrap();
            assert_eq!(summary.event_count, 1);
            assert_eq!(summary.result_count, 1);
            assert_eq!(
                load_test_results(temp.path()).unwrap()[0].promise_id,
                "harness.adapter_runtime.collects_event_shards_into_results"
            );
        },
    );
}

#[test]
fn adapter_runtime_uses_isolated_run_event_directories() {
    locked_scenario_test(
        "harness.adapter_runtime.uses_isolated_run_event_directories",
        "adapter runtime reads only the selected run directory",
        || {
            let _env = EnvGuard::clear_adapter_events_dir();
            let temp = tempdir().unwrap();
            write_synthetic_event(
                temp.path(),
                "selected-run",
                "harness.adapter_runtime.uses_isolated_run_event_directories",
                "selected run proof",
                TestResultStatus::Passing,
                None,
            );
            write_synthetic_event(
                temp.path(),
                "other-run",
                "harness.adapter_runtime.collects_event_shards_into_results",
                "unrelated run proof",
                TestResultStatus::Failing,
                Some("must stay isolated"),
            );

            merge_adapter_events(temp.path(), "selected-run").unwrap();
            let results = load_test_results(temp.path()).unwrap();
            assert_eq!(results.len(), 1);
            assert_eq!(
                results[0].promise_id,
                "harness.adapter_runtime.uses_isolated_run_event_directories"
            );
            assert!(adapter_events_dir(temp.path(), "other-run").exists());
        },
    );
}

#[test]
fn adapter_runtime_preserves_framework_independent_evidence() {
    locked_scenario_test(
        "harness.adapter_runtime.preserves_framework_independent_evidence",
        "adapter runtime preserves portable result evidence",
        || {
            let _env = EnvGuard::clear_adapter_events_dir();
            let temp = tempdir().unwrap();
            write_synthetic_event(
                temp.path(),
                "evidence-run",
                "harness.adapter_runtime.preserves_framework_independent_evidence",
                "portable evidence proof",
                TestResultStatus::Failing,
                Some("expected left to equal right"),
            );

            merge_adapter_events(temp.path(), "evidence-run").unwrap();
            let result = load_test_results(temp.path()).unwrap().remove(0);
            assert_eq!(result.file, "crates/harness-adapter-rust/tests/adapter.rs");
            assert_eq!(
                result.promise_id,
                "harness.adapter_runtime.preserves_framework_independent_evidence"
            );
            assert_eq!(result.status, TestResultStatus::Failing);
            assert_eq!(
                result.failure_message.as_deref(),
                Some("expected left to equal right")
            );
        },
    );
}

#[test]
fn adapter_runtime_exposes_runner_for_non_cargo_users() {
    locked_scenario_test(
        "harness.adapter_runtime.exposes_runner_for_non_cargo_users",
        "adapter runtime wraps an arbitrary test command and merges afterward",
        || {
            let temp = tempdir().unwrap();
            let _env = EnvGuard::set_root(temp.path());
            let script = r#"cat > "$HARNESS_ADAPTER_EVENTS_DIR/runner.ndjson" <<EOF
{"apiVersion":1,"kind":"testResult","runId":"$HARNESS_RUN_ID","timestamp":"2026-05-25T00:00:00.000Z","adapter":{"name":"fixture-adapter","version":"0.0.0","framework":"fixture"},"payload":{"file":"crates/harness-adapter-rust/tests/adapter.rs","promiseId":"harness.adapter_runtime.exposes_runner_for_non_cargo_users","status":"passing","testName":"runtime runner proof"}}
EOF"#;

            let status = harness_adapter_runtime::run_cli(vec![
                "run".to_string(),
                "--run-id".to_string(),
                "runtime-runner".to_string(),
                "--".to_string(),
                "sh".to_string(),
                "-c".to_string(),
                script.to_string(),
            ]);

            assert_eq!(status, 0);
            assert!(load_test_results(temp.path())
                .unwrap()
                .iter()
                .any(|result| result.promise_id
                    == "harness.adapter_runtime.exposes_runner_for_non_cargo_users"));
        },
    );
}

struct EnvGuard {
    previous_events_dir: Option<std::ffi::OsString>,
    previous_root: Option<std::ffi::OsString>,
    previous_run_id: Option<std::ffi::OsString>,
}

impl EnvGuard {
    fn clear_adapter_events_dir() -> Self {
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

    fn set_root(root: &Path) -> Self {
        let previous_root = env::var_os(HARNESS_ROOT_ENV_VAR);
        let previous_run_id = env::var_os(HARNESS_RUN_ID_ENV_VAR);
        let previous_events_dir = env::var_os(HARNESS_ADAPTER_EVENTS_DIR_ENV_VAR);
        env::set_var(HARNESS_ROOT_ENV_VAR, root);
        env::remove_var(HARNESS_RUN_ID_ENV_VAR);
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

fn locked_scenario_test<F>(promise_id: &str, test_name: &str, body: F)
where
    F: FnOnce(),
{
    let _lock = TEST_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    scenario_test(promise_id, test_name, body);
}

fn harness_root() -> PathBuf {
    env::var_os(HARNESS_ROOT_ENV_VAR)
        .map(PathBuf::from)
        .unwrap_or_else(|| env::current_dir().unwrap())
}

fn run_id() -> String {
    env::var(HARNESS_RUN_ID_ENV_VAR).unwrap_or_else(|_| "default".to_string())
}

fn write_synthetic_event(
    root: &Path,
    run_id: &str,
    promise_id: &str,
    test_name: &str,
    status: TestResultStatus,
    failure_message: Option<&str>,
) {
    record_test_result(
        root,
        run_id,
        AdapterDescriptor {
            framework: Some("fixture".to_string()),
            name: "fixture-adapter".to_string(),
            version: "0.0.0".to_string(),
        },
        TestResult {
            failure_message: failure_message.map(str::to_string),
            file: "crates/harness-adapter-rust/tests/adapter.rs".to_string(),
            promise_id: promise_id.to_string(),
            status,
            test_name: test_name.to_string(),
        },
    )
    .unwrap();
}
