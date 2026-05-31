use cucumber::tag::Ext as _;
use cucumber::{given, then, when, World as _};
use harness_cucumber_rs::{
    apply_harness_filter_to_cucumber_rs_env, cucumber_rs_bridge_descriptor, cucumber_rs_cli_args,
    cucumber_rs_filter_environment, is_harness_bridge_run, parse_cucumber_rs_tag_operation,
    record_cucumber_rs_example_result, record_cucumber_rs_example_result_in,
    HarnessCucumberRsWriter, CUCUMBER_RS_FILTER_TAGS_ENV_VAR,
};
use harness_protocol::{ExampleResult, ExampleStatus, StepResult};
use harness_runner::{
    load_results_file, merge_bridge_events, HARNESS_BRIDGE_EVENTS_DIR_ENV_VAR,
    HARNESS_CUCUMBER_TAG_EXPRESSION_ENV_VAR,
};
use std::collections::BTreeMap;
use std::env;
use std::ffi::OsString;
use std::path::PathBuf;
use tempfile::{tempdir, TempDir};

const FEATURE_TAG: &str = "@feature:harness.results.rust-cucumber-bridge";
const RECORD_RULE_TAG: &str = "@rule:harness.results.cucumber-rs-records-example-events";
const RUNNER_RULE_TAG: &str = "@rule:harness.results.runner-run-merges-cucumber-rs-evidence";
const FILTER_RULE_TAG: &str = "@rule:harness.results.cucumber-rs-uses-harness-filter";
const FEATURE_FILE: &str =
    "features/harness/bridges/rust/cucumber-rs/rust-cucumber-bridge/rust-cucumber-bridge.feature";

#[derive(Debug, Default, cucumber::World)]
struct BridgeWorld {
    cli_args: Vec<String>,
    env_filter: BTreeMap<String, String>,
    event_path: Option<PathBuf>,
    expression: String,
    filter_entrypoint_ran: bool,
    native_filter: Option<cucumber::gherkin::tagexpr::TagOperation>,
    raw_event: String,
    result: Option<ExampleResult>,
    run_id: String,
    summary: Option<harness_runner::MergeSummary>,
    temp: Option<TempDir>,
}

struct EnvVarGuard {
    key: &'static str,
    previous: Option<OsString>,
}

impl EnvVarGuard {
    fn set(key: &'static str, value: &str) -> Self {
        let previous = env::var_os(key);
        env::set_var(key, value);
        Self { key, previous }
    }

    fn clear(key: &'static str) -> Self {
        let previous = env::var_os(key);
        env::remove_var(key);
        Self { key, previous }
    }
}

impl Drop for EnvVarGuard {
    fn drop(&mut self) {
        match self.previous.take() {
            Some(value) => env::set_var(self.key, value),
            None => env::remove_var(self.key),
        }
    }
}

#[given("cucumber-rs has executed an Example with feature, rule, example, and locale tags")]
fn cucumber_rs_has_executed_tagged_example(world: &mut BridgeWorld) {
    world.temp = Some(tempdir().expect("create temp harness root"));
    world.run_id = "cucumber-rs-recording-run".to_string();
    let temp = world.temp.as_ref().expect("temp harness root");
    std::fs::write(
        temp.path().join("writer.feature"),
        format!(
            r#"{FEATURE_TAG}
@locale:en
Feature: Writer-backed cucumber-rs evidence

  {RECORD_RULE_TAG}
  Rule: Rust bridge records cucumber-rs Example events

    @example:recorded-cucumber-rs-example-emits-bridge-event
    Example: A cucumber-rs Example is emitted as Harness evidence
      Given the selected cucumber-rs Example runs
"#
        ),
    )
    .expect("write writer feature");
}

#[when("the Rust bridge records the Example result")]
async fn rust_bridge_records_example_result(world: &mut BridgeWorld) {
    let temp = world.temp.as_ref().expect("temp harness root");
    let _events_dir = EnvVarGuard::clear(HARNESS_BRIDGE_EVENTS_DIR_ENV_VAR);
    let writer = BridgeWorld::cucumber()
        .with_writer(HarnessCucumberRsWriter::recording_to(
            temp.path(),
            &world.run_id,
        ))
        .max_concurrent_scenarios(1)
        .run(temp.path().join("writer.feature"))
        .await;
    assert!(writer.errors().is_empty(), "{:?}", writer.errors());
    assert_eq!(writer.results().len(), 1);
    world.result = writer.results().first().cloned();
    let path = writer
        .event_paths()
        .first()
        .expect("writer bridge event path")
        .clone();
    world.raw_event = std::fs::read_to_string(&path).expect("read bridge event");
    world.event_path = Some(path);
}

#[then("it writes a Cucumber Example bridge event with step statuses and no promise id")]
fn writes_bridge_event_with_steps_and_no_promise_id(world: &mut BridgeWorld) {
    assert!(world.raw_event.contains(r#""framework":"cucumber-rs""#));
    assert!(world.raw_event.contains(r#""name":"harness-cucumber-rs""#));
    assert!(world.raw_event.contains(r#""bridge":"#));
    assert!(!world.raw_event.contains("promiseId"));

    let temp = world.temp.as_ref().expect("temp harness root");
    let _events_dir = EnvVarGuard::clear(HARNESS_BRIDGE_EVENTS_DIR_ENV_VAR);
    let summary = merge_bridge_events(temp.path(), &world.run_id).expect("merge bridge events");
    assert_eq!(summary.event_count, 1);
    assert_eq!(summary.result_count, 1);
    let result = load_results_file(temp.path())
        .expect("load results")
        .expect("results file")
        .results
        .remove(0);
    assert_eq!(result.feature, FEATURE_TAG);
    assert_eq!(result.rule, RECORD_RULE_TAG);
    assert_eq!(
        cucumber_rs_bridge_descriptor().framework.as_deref(),
        Some("cucumber-rs")
    );
}

#[given("harness-runner starts the Rust bridge with a fresh run id and events directory")]
fn harness_runner_starts_bridge(world: &mut BridgeWorld) {
    world.temp = Some(tempdir().expect("create temp harness root"));
    world.run_id = "cucumber-rs-runner-run".to_string();
}

#[when("the bridge emits Cucumber Example events")]
fn bridge_emits_example_events(world: &mut BridgeWorld) {
    let result = cucumber_rs_result(
        "@example:runner-run-merges-run-scoped-cucumber-events",
        RUNNER_RULE_TAG,
        "A cucumber-rs bridge run produces normalized Harness results",
        ExampleStatus::Passing,
        None,
    );
    let temp = world.temp.as_ref().expect("temp harness root");
    {
        let _events_dir = EnvVarGuard::clear(HARNESS_BRIDGE_EVENTS_DIR_ENV_VAR);
        record_cucumber_rs_example_result_in(temp.path(), &world.run_id, result.clone())
            .expect("record temp runner evidence");
    }

    if is_harness_bridge_run() {
        record_cucumber_rs_example_result(result).expect("record outer harness-runner evidence");
    }
}

#[then("harness-runner merges the selected run into tests/harness.results.yaml")]
fn harness_runner_merges_selected_run(world: &mut BridgeWorld) {
    let temp = world.temp.as_ref().expect("temp harness root");
    let _events_dir = EnvVarGuard::clear(HARNESS_BRIDGE_EVENTS_DIR_ENV_VAR);
    let summary = merge_bridge_events(temp.path(), &world.run_id).expect("merge bridge events");
    assert_eq!(summary.event_count, 1);
    assert_eq!(summary.result_count, 1);
    let result = load_results_file(temp.path())
        .expect("load results")
        .expect("results file")
        .results
        .remove(0);
    assert_eq!(result.rule, RUNNER_RULE_TAG);
    world.summary = Some(summary);
}

#[given("HARNESS_CUCUMBER_TAG_EXPRESSION contains a Cucumber tag expression")]
fn harness_filter_env_contains_tag_expression(world: &mut BridgeWorld) {
    world.expression = format!("{FILTER_RULE_TAG} and @locale:zh-CN");
}

#[when("the Rust bridge prepares cucumber-rs execution")]
fn rust_bridge_prepares_cucumber_rs_execution(world: &mut BridgeWorld) {
    world.env_filter = cucumber_rs_filter_environment(Some(world.expression.clone()));
    world.cli_args = cucumber_rs_cli_args(Some(world.expression.clone()));
    world.native_filter =
        Some(parse_cucumber_rs_tag_operation(&world.expression).expect("parse tag expression"));
}

#[then("it exposes that expression as cucumber-rs tags filter configuration")]
fn exposes_expression_as_cucumber_rs_filter(world: &mut BridgeWorld) {
    assert_eq!(
        world
            .env_filter
            .get(CUCUMBER_RS_FILTER_TAGS_ENV_VAR)
            .map(String::as_str),
        Some(world.expression.as_str())
    );
    assert_eq!(
        world.cli_args,
        vec!["--tags".to_string(), world.expression.clone()]
    );
    let native_filter = world.native_filter.as_ref().expect("native filter");
    assert!(native_filter.eval([
        "rule:harness.results.cucumber-rs-uses-harness-filter",
        "locale:zh-CN"
    ]));
    assert!(!native_filter.eval([
        "rule:harness.results.cucumber-rs-uses-harness-filter",
        "locale:en"
    ]));
}

#[given("a cucumber-rs executable entrypoint has selected and unselected Examples")]
fn cucumber_rs_entrypoint_has_selected_and_unselected_examples(world: &mut BridgeWorld) {
    let temp = tempdir().expect("create filter feature dir");
    std::fs::write(
        temp.path().join("filter.feature"),
        r#"Feature: Native cucumber-rs filtering

  @selected
  Example: Selected Example
    Given the selected cucumber-rs Example runs

  @other
  Example: Unselected Example
    Given the unselected cucumber-rs Example would fail
"#,
    )
    .expect("write filter feature");
    world.temp = Some(temp);
}

#[when("the Rust bridge applies HARNESS_CUCUMBER_TAG_EXPRESSION before the entrypoint runs")]
async fn rust_bridge_applies_filter_before_entrypoint(world: &mut BridgeWorld) {
    let _harness_filter = EnvVarGuard::set(HARNESS_CUCUMBER_TAG_EXPRESSION_ENV_VAR, "@selected");
    let _native_filter = EnvVarGuard::clear(CUCUMBER_RS_FILTER_TAGS_ENV_VAR);
    let expression = apply_harness_filter_to_cucumber_rs_env().expect("apply harness filter");
    let mut cli = cucumber::cli::Opts::default();
    cli.tags_filter = Some(parse_cucumber_rs_tag_operation(&expression).expect("parse filter"));
    let feature_dir = world.temp.as_ref().expect("filter feature dir").path();

    BridgeWorld::cucumber()
        .with_cli::<cucumber::cli::Empty>(cli)
        .max_concurrent_scenarios(1)
        .run_and_exit(feature_dir)
        .await;
    world.filter_entrypoint_ran = true;
}

#[then("cucumber-rs runs only the Examples matching the native tag filter")]
fn cucumber_rs_runs_only_matching_examples(world: &mut BridgeWorld) {
    assert!(world.filter_entrypoint_ran);
}

#[given("the selected cucumber-rs Example runs")]
fn selected_cucumber_rs_example_runs(_world: &mut BridgeWorld) {}

#[given("the unselected cucumber-rs Example would fail")]
fn unselected_cucumber_rs_example_would_fail(_world: &mut BridgeWorld) {
    panic!("the Harness tag expression did not reach cucumber-rs");
}

fn cucumber_rs_result(
    example: &str,
    rule: &str,
    name: &str,
    status: ExampleStatus,
    failure_message: Option<&str>,
) -> ExampleResult {
    let mut labels = BTreeMap::new();
    labels.insert("runner".to_string(), "cucumber-rs".to_string());
    let step_status = status.clone();
    ExampleResult {
        example: example.to_string(),
        failure_message: failure_message.map(str::to_string),
        feature: FEATURE_TAG.to_string(),
        file: FEATURE_FILE.to_string(),
        labels,
        line: Some(11),
        locale: "en".to_string(),
        name: name.to_string(),
        rule: rule.to_string(),
        status,
        steps: vec![StepResult {
            failure_message: failure_message.map(str::to_string),
            keyword: "Then".to_string(),
            status: step_status,
            text: "it writes a Cucumber Example bridge event with step statuses and no promise id"
                .to_string(),
        }],
    }
}

#[tokio::main]
async fn main() {
    apply_harness_filter_to_cucumber_rs_env();
    let features =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("../../../{FEATURE_FILE}"));
    let writer = BridgeWorld::cucumber()
        .with_writer(HarnessCucumberRsWriter::recording_to_harness_env())
        .max_concurrent_scenarios(1)
        .run(features)
        .await;
    if !writer.errors().is_empty()
        || writer
            .results()
            .iter()
            .any(|result| result.status == ExampleStatus::Failing)
    {
        for error in writer.errors() {
            eprintln!("{error}");
        }
        std::process::exit(1);
    }
}
