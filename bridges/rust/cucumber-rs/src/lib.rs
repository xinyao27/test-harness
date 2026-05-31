use cucumber::{event, parser, Event, Writer};
use harness_protocol::{BridgeDescriptor, ExampleResult, ExampleStatus, StepResult};
use harness_runner::{
    current_run_id, harness_root_dir, record_example_result, HarnessRunnerError,
    HARNESS_BRIDGE_EVENTS_DIR_ENV_VAR, HARNESS_CUCUMBER_TAG_EXPRESSION_ENV_VAR,
};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const CUCUMBER_RS_FILTER_TAGS_ENV_VAR: &str = "CUCUMBER_FILTER_TAGS";

#[derive(Debug, Clone)]
enum RecordTarget {
    HarnessEnv,
    Root { root_dir: PathBuf, run_id: String },
}

#[derive(Debug, Clone)]
struct ScenarioState {
    example: String,
    failure_message: Option<String>,
    feature: String,
    file: String,
    line: Option<u32>,
    locale: String,
    name: String,
    rule: String,
    status: ExampleStatus,
    steps: Vec<StepResult>,
}

#[derive(Debug, Default)]
pub struct HarnessCucumberRsWriter {
    current: Option<ScenarioState>,
    errors: Vec<String>,
    event_paths: Vec<PathBuf>,
    record_target: Option<RecordTarget>,
    results: Vec<ExampleResult>,
}

impl HarnessCucumberRsWriter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn recording_to(root_dir: impl Into<PathBuf>, run_id: impl Into<String>) -> Self {
        Self {
            record_target: Some(RecordTarget::Root {
                root_dir: root_dir.into(),
                run_id: run_id.into(),
            }),
            ..Self::default()
        }
    }

    pub fn recording_to_harness_env() -> Self {
        Self {
            record_target: Some(RecordTarget::HarnessEnv),
            ..Self::default()
        }
    }

    pub fn errors(&self) -> &[String] {
        &self.errors
    }

    pub fn event_paths(&self) -> &[PathBuf] {
        &self.event_paths
    }

    pub fn results(&self) -> &[ExampleResult] {
        &self.results
    }

    fn handle_cucumber_event<World>(&mut self, event: event::Cucumber<World>) {
        match event {
            event::Cucumber::Feature(feature, event::Feature::Rule(rule, rule_event)) => {
                if let event::Rule::Scenario(scenario, retryable) = rule_event {
                    self.handle_scenario(
                        feature.as_ref(),
                        Some(rule.as_ref()),
                        scenario.as_ref(),
                        retryable.event,
                    );
                }
            }
            event::Cucumber::Feature(feature, event::Feature::Scenario(scenario, retryable)) => {
                self.handle_scenario(feature.as_ref(), None, scenario.as_ref(), retryable.event);
            }
            _ => {}
        }
    }

    fn handle_scenario<World>(
        &mut self,
        feature: &cucumber::gherkin::Feature,
        rule: Option<&cucumber::gherkin::Rule>,
        scenario: &cucumber::gherkin::Scenario,
        scenario_event: event::Scenario<World>,
    ) {
        match scenario_event {
            event::Scenario::Started => self.start_scenario(feature, rule, scenario),
            event::Scenario::Step(step, step_event)
            | event::Scenario::Background(step, step_event) => {
                self.record_step(step.as_ref(), step_event);
            }
            event::Scenario::Finished => self.finish_scenario(),
            event::Scenario::Hook(_, event::Hook::Failed(_, info)) => {
                if let Some(current) = self.current.as_mut() {
                    current.status = ExampleStatus::Failing;
                    current.failure_message =
                        Some(format!("cucumber-rs hook failed: {:?}", info.type_id()));
                }
            }
            event::Scenario::Hook(_, _) | event::Scenario::Log(_) => {}
        }
    }

    fn start_scenario(
        &mut self,
        feature: &cucumber::gherkin::Feature,
        rule: Option<&cucumber::gherkin::Rule>,
        scenario: &cucumber::gherkin::Scenario,
    ) {
        self.current = scenario_identity(feature, rule, scenario).map(|identity| ScenarioState {
            example: identity.example,
            failure_message: None,
            feature: identity.feature,
            file: feature
                .path
                .as_ref()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_default(),
            line: Some(scenario.position.line as u32),
            locale: identity.locale,
            name: scenario.name.clone(),
            rule: identity.rule,
            status: ExampleStatus::Passing,
            steps: Vec::new(),
        });
    }

    fn record_step<World>(
        &mut self,
        step: &cucumber::gherkin::Step,
        step_event: event::Step<World>,
    ) {
        let Some(current) = self.current.as_mut() else {
            return;
        };
        let Some((status, failure_message)) = step_status(step_event) else {
            return;
        };
        match status {
            ExampleStatus::Failing => {
                current.status = ExampleStatus::Failing;
                if current.failure_message.is_none() {
                    current.failure_message = failure_message.clone();
                }
            }
            ExampleStatus::Skipped if current.status == ExampleStatus::Passing => {
                current.status = ExampleStatus::Skipped;
            }
            ExampleStatus::Passing | ExampleStatus::Skipped => {}
        }
        current.steps.push(StepResult {
            failure_message,
            keyword: step.keyword.trim().to_string(),
            status,
            text: step.value.clone(),
        });
    }

    fn finish_scenario(&mut self) {
        let Some(current) = self.current.take() else {
            return;
        };
        let mut labels = BTreeMap::new();
        labels.insert("runner".to_string(), "cucumber-rs".to_string());
        let result = ExampleResult {
            example: current.example,
            failure_message: current.failure_message,
            feature: current.feature,
            file: current.file,
            labels,
            line: current.line,
            locale: current.locale,
            name: current.name,
            rule: current.rule,
            status: current.status,
            steps: current.steps,
        };
        self.record_result(result.clone());
        self.results.push(result);
    }

    fn record_result(&mut self, result: ExampleResult) {
        let write_result = match &self.record_target {
            Some(RecordTarget::HarnessEnv) if is_harness_bridge_run() => {
                record_cucumber_rs_example_result(result)
            }
            Some(RecordTarget::HarnessEnv) | None => return,
            Some(RecordTarget::Root { root_dir, run_id }) => {
                record_cucumber_rs_example_result_in(root_dir, run_id, result)
            }
        };
        match write_result {
            Ok(path) => self.event_paths.push(path),
            Err(error) => self.errors.push(error.to_string()),
        }
    }
}

impl<World> Writer<World> for HarnessCucumberRsWriter {
    type Cli = cucumber::cli::Empty;

    async fn handle_event(
        &mut self,
        event: parser::Result<Event<event::Cucumber<World>>>,
        _cli: &Self::Cli,
    ) {
        match event {
            Ok(event) => self.handle_cucumber_event(event.into_inner()),
            Err(error) => self.errors.push(error.to_string()),
        }
    }
}

impl cucumber::writer::Normalized for HarnessCucumberRsWriter {}

pub fn cucumber_rs_bridge_descriptor() -> BridgeDescriptor {
    BridgeDescriptor {
        framework: Some("cucumber-rs".to_string()),
        name: "harness-cucumber-rs".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

pub fn record_cucumber_rs_example_result(
    result: ExampleResult,
) -> Result<PathBuf, HarnessRunnerError> {
    record_cucumber_rs_example_result_in(harness_root_dir(), &current_run_id(), result)
}

pub fn record_cucumber_rs_example_result_in(
    root_dir: impl AsRef<Path>,
    run_id: &str,
    result: ExampleResult,
) -> Result<PathBuf, HarnessRunnerError> {
    record_example_result(root_dir, run_id, cucumber_rs_bridge_descriptor(), result)
}

pub fn is_harness_bridge_run() -> bool {
    std::env::var_os(HARNESS_BRIDGE_EVENTS_DIR_ENV_VAR).is_some()
}

pub fn harness_cucumber_tag_expression_from_env() -> Option<String> {
    std::env::var(HARNESS_CUCUMBER_TAG_EXPRESSION_ENV_VAR)
        .ok()
        .and_then(clean_tag_expression)
}

pub fn cucumber_rs_filter_environment_from_harness_env() -> BTreeMap<String, String> {
    cucumber_rs_filter_environment(harness_cucumber_tag_expression_from_env())
}

pub fn cucumber_rs_filter_environment(expression: Option<String>) -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();
    if let Some(expression) = expression.and_then(clean_tag_expression) {
        env.insert(CUCUMBER_RS_FILTER_TAGS_ENV_VAR.to_string(), expression);
    }
    env
}

pub fn cucumber_rs_cli_args_from_harness_env() -> Vec<String> {
    cucumber_rs_cli_args(harness_cucumber_tag_expression_from_env())
}

pub fn cucumber_rs_cli_args(expression: Option<String>) -> Vec<String> {
    match expression.and_then(clean_tag_expression) {
        Some(expression) => vec!["--tags".to_string(), expression],
        None => Vec::new(),
    }
}

pub fn cucumber_rs_tag_operation_from_harness_env(
) -> Result<Option<cucumber::gherkin::tagexpr::TagOperation>, String> {
    match harness_cucumber_tag_expression_from_env() {
        Some(expression) => parse_cucumber_rs_tag_operation(&expression).map(Some),
        None => Ok(None),
    }
}

pub fn parse_cucumber_rs_tag_operation(
    expression: &str,
) -> Result<cucumber::gherkin::tagexpr::TagOperation, String> {
    expression
        .parse()
        .map_err(|error| format!("invalid cucumber-rs tag expression: {error}"))
}

pub fn apply_harness_filter_to_cucumber_rs_env() -> Option<String> {
    let expression = harness_cucumber_tag_expression_from_env()?;
    std::env::set_var(CUCUMBER_RS_FILTER_TAGS_ENV_VAR, &expression);
    Some(expression)
}

fn clean_tag_expression(expression: String) -> Option<String> {
    let expression = expression.trim().to_string();
    if expression.is_empty() {
        None
    } else {
        Some(expression)
    }
}

#[derive(Debug, Clone)]
struct ScenarioIdentity {
    example: String,
    feature: String,
    locale: String,
    rule: String,
}

fn scenario_identity(
    feature: &cucumber::gherkin::Feature,
    rule: Option<&cucumber::gherkin::Rule>,
    scenario: &cucumber::gherkin::Scenario,
) -> Option<ScenarioIdentity> {
    let tags: Vec<String> = feature
        .tags
        .iter()
        .chain(rule.into_iter().flat_map(|rule| rule.tags.iter()))
        .chain(scenario.tags.iter())
        .map(|tag| normalize_tag(tag))
        .collect();
    Some(ScenarioIdentity {
        example: find_tag(&tags, "@example:")?.to_string(),
        feature: find_tag(&tags, "@feature:")?.to_string(),
        locale: find_tag(&tags, "@locale:")?
            .trim_start_matches("@locale:")
            .to_string(),
        rule: find_tag(&tags, "@rule:")?.to_string(),
    })
}

fn normalize_tag(tag: &str) -> String {
    if tag.starts_with('@') {
        tag.to_string()
    } else {
        format!("@{tag}")
    }
}

fn find_tag<'a>(tags: &'a [String], prefix: &str) -> Option<&'a str> {
    tags.iter()
        .find(|tag| tag.starts_with(prefix))
        .map(String::as_str)
}

fn step_status<World>(step: event::Step<World>) -> Option<(ExampleStatus, Option<String>)> {
    match step {
        event::Step::Started => None,
        event::Step::Passed(_, _) => Some((ExampleStatus::Passing, None)),
        event::Step::Skipped => Some((ExampleStatus::Skipped, None)),
        event::Step::Failed(_, _, _, error) => {
            Some((ExampleStatus::Failing, Some(error.to_string())))
        }
    }
}
