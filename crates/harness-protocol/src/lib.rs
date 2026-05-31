use regex::Regex;
use serde::de::{self, DeserializeOwned};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_yaml::Value;
use std::collections::BTreeMap;
use std::fmt;
use std::sync::LazyLock;

static ID_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$").unwrap());

static LOCALE_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-z]{2,3}(?:-[A-Z][A-Za-z0-9]*)?$").unwrap());

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ProtocolVersion;

impl Serialize for ProtocolVersion {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u8(1)
    }
}

impl<'de> Deserialize<'de> for ProtocolVersion {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = u8::deserialize(deserializer)?;
        if value == 1 {
            Ok(Self)
        } else {
            Err(de::Error::custom("apiVersion must be 1"))
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum LocalizedText {
    Text(String),
    Localized(BTreeMap<String, String>),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PackageRecord {
    pub id: String,
    pub title: LocalizedText,
    pub path: String,
    pub purpose: LocalizedText,
    pub modules: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PackagesFile {
    #[serde(rename = "apiVersion")]
    pub api_version: ProtocolVersion,
    pub packages: Vec<PackageRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModuleRecord {
    pub id: String,
    pub package: String,
    pub title: LocalizedText,
    pub purpose: LocalizedText,
    pub covers: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModulesFile {
    #[serde(rename = "apiVersion")]
    pub api_version: ProtocolVersion,
    pub modules: Vec<ModuleRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LocalesFile {
    #[serde(rename = "apiVersion")]
    pub api_version: ProtocolVersion,
    #[serde(rename = "sourceLocale")]
    pub source_locale: String,
    #[serde(rename = "requiredLocales")]
    pub required_locales: Vec<String>,
    #[serde(rename = "executionLocale")]
    pub execution_locale: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BehaviorLifecycle {
    Draft,
    Proposed,
    Accepted,
    Deprecated,
    Superseded,
}

impl fmt::Display for BehaviorLifecycle {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Draft => "draft",
            Self::Proposed => "proposed",
            Self::Accepted => "accepted",
            Self::Deprecated => "deprecated",
            Self::Superseded => "superseded",
        })
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewState {
    #[default]
    Pending,
    Approved,
    ChangesRequested,
    Rejected,
}

impl fmt::Display for ReviewState {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Pending => "pending",
            Self::Approved => "approved",
            Self::ChangesRequested => "changes_requested",
            Self::Rejected => "rejected",
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BehaviorReview {
    pub state: ReviewState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<LocalizedText>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BehaviorRuleRecord {
    pub feature: String,
    pub rule: String,
    pub lifecycle: BehaviorLifecycle,
    pub review: BehaviorReview,
    pub owner: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BehaviorFile {
    #[serde(rename = "apiVersion")]
    pub api_version: ProtocolVersion,
    pub rules: Vec<BehaviorRuleRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewLogAction {
    Proposed,
    Approved,
    ChangesRequested,
    Rejected,
    Deprecated,
    Superseded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewLogAcknowledgement {
    pub state: ReviewState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<LocalizedText>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewLogEvent {
    pub id: String,
    pub at: String,
    pub by: String,
    pub action: ReviewLogAction,
    pub summary: LocalizedText,
    #[serde(rename = "affectedRules")]
    pub affected_rules: Vec<String>,
    pub acknowledgement: ReviewLogAcknowledgement,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewLogFile {
    #[serde(rename = "apiVersion")]
    pub api_version: ProtocolVersion,
    pub events: Vec<ReviewLogEvent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HarnessRunnerSelection {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub module: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub example: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
}

impl Default for HarnessRunnerSelection {
    fn default() -> Self {
        Self {
            package: None,
            module: None,
            feature: None,
            rule: None,
            example: None,
            locale: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HarnessRunnerConfig {
    pub command: String,
    pub args: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selection: Option<HarnessRunnerSelection>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HarnessTestConfig {
    pub runner: HarnessRunnerConfig,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HarnessConfig {
    #[serde(rename = "apiVersion")]
    pub api_version: ProtocolVersion,
    pub test: HarnessTestConfig,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExampleStatus {
    Passing,
    Failing,
    Skipped,
}

impl fmt::Display for ExampleStatus {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Passing => "passing",
            Self::Failing => "failing",
            Self::Skipped => "skipped",
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StepResult {
    pub keyword: String,
    pub text: String,
    pub status: ExampleStatus,
    #[serde(rename = "failureMessage", skip_serializing_if = "Option::is_none")]
    pub failure_message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExampleResult {
    pub feature: String,
    pub rule: String,
    pub example: String,
    pub locale: String,
    pub name: String,
    pub file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    pub status: ExampleStatus,
    pub steps: Vec<StepResult>,
    #[serde(rename = "failureMessage", skip_serializing_if = "Option::is_none")]
    pub failure_message: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResultsFile {
    #[serde(rename = "apiVersion")]
    pub api_version: ProtocolVersion,
    #[serde(rename = "generatedAt")]
    pub generated_at: String,
    pub results: Vec<ExampleResult>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BridgeDescriptor {
    pub name: String,
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub framework: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum BridgeEventKind {
    #[serde(rename = "cucumberExampleResult")]
    CucumberExampleResult,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BridgeEvent {
    #[serde(rename = "apiVersion")]
    pub api_version: ProtocolVersion,
    pub kind: BridgeEventKind,
    #[serde(rename = "runId")]
    pub run_id: String,
    pub timestamp: String,
    pub bridge: BridgeDescriptor,
    pub payload: ExampleResult,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationSeverity {
    Error,
    Warning,
}

impl fmt::Display for ValidationSeverity {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Error => "error",
            Self::Warning => "warning",
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationSubjectKind {
    Package,
    Module,
    Feature,
    Rule,
    Example,
    Locale,
    Result,
    Config,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidationSubject {
    pub kind: ValidationSubjectKind,
    pub id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidationIssue {
    pub code: String,
    pub message: String,
    pub severity: ValidationSeverity,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<ValidationSubject>,
}

#[derive(Debug, Clone)]
pub enum ProtocolDecodeError {
    Yaml(String),
    Shape(String),
}

impl fmt::Display for ProtocolDecodeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Yaml(message) => formatter.write_str(message),
            Self::Shape(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for ProtocolDecodeError {}

fn decode_yaml<T>(raw: &str) -> Result<T, ProtocolDecodeError>
where
    T: DeserializeOwned,
{
    decode_value(decode_yaml_value(raw)?)
}

fn decode_json<T>(raw: &str) -> Result<T, ProtocolDecodeError>
where
    T: DeserializeOwned,
{
    serde_json::from_str(raw).map_err(|error| ProtocolDecodeError::Yaml(error.to_string()))
}

fn decode_yaml_value(raw: &str) -> Result<Value, ProtocolDecodeError> {
    serde_yaml::from_str(raw).map_err(|error| ProtocolDecodeError::Yaml(error.to_string()))
}

fn decode_value<T>(input: Value) -> Result<T, ProtocolDecodeError>
where
    T: DeserializeOwned,
{
    serde_yaml::from_value(input).map_err(|error| ProtocolDecodeError::Shape(error.to_string()))
}

fn ensure_shape(condition: bool, message: impl Into<String>) -> Result<(), ProtocolDecodeError> {
    if condition {
        Ok(())
    } else {
        Err(ProtocolDecodeError::Shape(message.into()))
    }
}

fn validate_id(value: &str, field: &str) -> Result<(), ProtocolDecodeError> {
    ensure_shape(
        ID_PATTERN.is_match(value),
        format!("{field} must be stable, lowercase, and dot/underscore/hyphen separated"),
    )
}

fn validate_locale(value: &str, field: &str) -> Result<(), ProtocolDecodeError> {
    ensure_shape(
        LOCALE_PATTERN.is_match(value),
        format!("{field} must be a BCP-47 style locale such as en or zh-CN"),
    )
}

fn validate_tag(value: &str, prefix: &str, field: &str) -> Result<(), ProtocolDecodeError> {
    let Some(id) = value.strip_prefix(prefix) else {
        return Err(ProtocolDecodeError::Shape(format!(
            "{field} must start with {prefix}"
        )));
    };
    validate_id(id, field)
}

fn validate_id_or_tag(value: &str, prefix: &str, field: &str) -> Result<(), ProtocolDecodeError> {
    let value = value.trim();
    validate_non_empty(value, field)?;
    if let Some(id) = value.strip_prefix(prefix) {
        validate_id(id, field)
    } else {
        validate_id(value, field)
    }
}

fn validate_locale_or_tag(value: &str, field: &str) -> Result<(), ProtocolDecodeError> {
    let value = value.trim();
    validate_non_empty(value, field)?;
    if let Some(locale) = value.strip_prefix("@locale:") {
        validate_locale(locale, field)
    } else {
        validate_locale(value, field)
    }
}

fn validate_non_empty(value: &str, field: &str) -> Result<(), ProtocolDecodeError> {
    ensure_shape(
        !value.trim().is_empty(),
        format!("{field} must not be empty"),
    )
}

fn validate_localized_text(value: &LocalizedText, field: &str) -> Result<(), ProtocolDecodeError> {
    match value {
        LocalizedText::Text(text) => validate_non_empty(text, field),
        LocalizedText::Localized(map) => {
            ensure_shape(!map.is_empty(), format!("{field} must not be empty"))?;
            for (locale, text) in map {
                validate_locale(locale, field)?;
                validate_non_empty(text, field)?;
            }
            Ok(())
        }
    }
}

fn validate_string_list(
    values: &[String],
    field: &str,
    item: impl Fn(&str, &str) -> Result<(), ProtocolDecodeError>,
) -> Result<(), ProtocolDecodeError> {
    ensure_shape(!values.is_empty(), format!("{field} must not be empty"))?;
    for value in values {
        item(value, field)?;
    }
    Ok(())
}

pub fn validate_package_record(record: &PackageRecord) -> Result<(), ProtocolDecodeError> {
    validate_id(&record.id, "package id")?;
    validate_localized_text(&record.title, "package title")?;
    validate_non_empty(&record.path, "package path")?;
    validate_localized_text(&record.purpose, "package purpose")?;
    validate_string_list(&record.modules, "package modules", validate_id)
}

pub fn validate_packages_file(file: &PackagesFile) -> Result<(), ProtocolDecodeError> {
    ensure_shape(!file.packages.is_empty(), "packages must not be empty")?;
    for record in &file.packages {
        validate_package_record(record)?;
    }
    Ok(())
}

pub fn validate_module_record(record: &ModuleRecord) -> Result<(), ProtocolDecodeError> {
    validate_id(&record.id, "module id")?;
    validate_id(&record.package, "module package")?;
    validate_localized_text(&record.title, "module title")?;
    validate_localized_text(&record.purpose, "module purpose")?;
    validate_string_list(&record.covers, "module covers", validate_non_empty)
}

pub fn validate_modules_file(file: &ModulesFile) -> Result<(), ProtocolDecodeError> {
    ensure_shape(!file.modules.is_empty(), "modules must not be empty")?;
    for record in &file.modules {
        validate_module_record(record)?;
    }
    Ok(())
}

pub fn validate_locales_file(file: &LocalesFile) -> Result<(), ProtocolDecodeError> {
    validate_locale(&file.source_locale, "sourceLocale")?;
    validate_string_list(&file.required_locales, "requiredLocales", validate_locale)?;
    validate_locale(&file.execution_locale, "executionLocale")?;
    ensure_shape(
        file.required_locales.contains(&file.source_locale),
        "requiredLocales must include sourceLocale",
    )?;
    ensure_shape(
        file.required_locales.contains(&file.execution_locale),
        "requiredLocales must include executionLocale",
    )
}

pub fn validate_behavior_rule_record(
    record: &BehaviorRuleRecord,
) -> Result<(), ProtocolDecodeError> {
    validate_tag(&record.feature, "@feature:", "behavior feature")?;
    validate_tag(&record.rule, "@rule:", "behavior rule")?;
    validate_id(&record.owner, "behavior owner")?;
    if let Some(by) = &record.review.by {
        validate_non_empty(by, "review.by")?;
    }
    if let Some(at) = &record.review.at {
        validate_non_empty(at, "review.at")?;
    }
    if let Some(note) = &record.review.note {
        validate_localized_text(note, "review.note")?;
    }
    Ok(())
}

pub fn validate_behavior_file(file: &BehaviorFile) -> Result<(), ProtocolDecodeError> {
    ensure_shape(!file.rules.is_empty(), "rules must not be empty")?;
    for record in &file.rules {
        validate_behavior_rule_record(record)?;
    }
    Ok(())
}

pub fn validate_review_log_event(event: &ReviewLogEvent) -> Result<(), ProtocolDecodeError> {
    validate_id(&event.id, "review log id")?;
    validate_non_empty(&event.at, "review log at")?;
    validate_non_empty(&event.by, "review log by")?;
    validate_localized_text(&event.summary, "review log summary")?;
    validate_string_list(&event.affected_rules, "affectedRules", |value, field| {
        validate_tag(value, "@rule:", field)
    })?;
    if let Some(by) = &event.acknowledgement.by {
        validate_non_empty(by, "acknowledgement.by")?;
    }
    if let Some(at) = &event.acknowledgement.at {
        validate_non_empty(at, "acknowledgement.at")?;
    }
    if let Some(note) = &event.acknowledgement.note {
        validate_localized_text(note, "acknowledgement.note")?;
    }
    Ok(())
}

pub fn validate_review_log_file(file: &ReviewLogFile) -> Result<(), ProtocolDecodeError> {
    ensure_shape(!file.events.is_empty(), "events must not be empty")?;
    for event in &file.events {
        validate_review_log_event(event)?;
    }
    Ok(())
}

pub fn validate_runner_selection(
    selection: &HarnessRunnerSelection,
) -> Result<(), ProtocolDecodeError> {
    ensure_shape(
        selection.package.is_some()
            || selection.module.is_some()
            || selection.feature.is_some()
            || selection.rule.is_some()
            || selection.example.is_some()
            || selection.locale.is_some(),
        "test.runner.selection must not be empty",
    )?;
    if let Some(value) = &selection.package {
        validate_id_or_tag(value, "@package:", "test.runner.selection.package")?;
    }
    if let Some(value) = &selection.module {
        validate_id_or_tag(value, "@module:", "test.runner.selection.module")?;
    }
    if let Some(value) = &selection.feature {
        validate_id_or_tag(value, "@feature:", "test.runner.selection.feature")?;
    }
    if let Some(value) = &selection.rule {
        validate_id_or_tag(value, "@rule:", "test.runner.selection.rule")?;
    }
    if let Some(value) = &selection.example {
        validate_id_or_tag(value, "@example:", "test.runner.selection.example")?;
    }
    if let Some(value) = &selection.locale {
        validate_locale_or_tag(value, "test.runner.selection.locale")?;
    }
    Ok(())
}

pub fn validate_harness_config(config: &HarnessConfig) -> Result<(), ProtocolDecodeError> {
    validate_non_empty(&config.test.runner.command, "test.runner.command")?;
    for arg in &config.test.runner.args {
        validate_non_empty(arg, "test.runner.args item")?;
    }
    if let Some(selection) = &config.test.runner.selection {
        validate_runner_selection(selection)?;
    }
    Ok(())
}

pub fn validate_step_result(step: &StepResult) -> Result<(), ProtocolDecodeError> {
    match step.keyword.as_str() {
        "Given" | "When" | "Then" | "And" | "But" => {}
        _ => {
            return Err(ProtocolDecodeError::Shape(
                "step keyword must be Given, When, Then, And, or But".to_string(),
            ))
        }
    }
    validate_non_empty(&step.text, "step text")?;
    if let Some(message) = &step.failure_message {
        validate_non_empty(message, "step failureMessage")?;
    }
    Ok(())
}

pub fn validate_example_result(result: &ExampleResult) -> Result<(), ProtocolDecodeError> {
    validate_tag(&result.feature, "@feature:", "result feature")?;
    validate_tag(&result.rule, "@rule:", "result rule")?;
    validate_tag(&result.example, "@example:", "result example")?;
    validate_locale(&result.locale, "result locale")?;
    validate_non_empty(&result.name, "result name")?;
    validate_non_empty(&result.file, "result file")?;
    ensure_shape(!result.steps.is_empty(), "result steps must not be empty")?;
    for step in &result.steps {
        validate_step_result(step)?;
    }
    if let Some(message) = &result.failure_message {
        validate_non_empty(message, "result failureMessage")?;
    }
    for (key, value) in &result.labels {
        validate_non_empty(key, "result labels key")?;
        validate_non_empty(value, "result labels value")?;
    }
    Ok(())
}

pub fn validate_results_file(file: &ResultsFile) -> Result<(), ProtocolDecodeError> {
    ensure_shape(
        !file.generated_at.trim().is_empty(),
        "generatedAt must not be empty",
    )?;
    ensure_shape(!file.results.is_empty(), "results must not be empty")?;
    for result in &file.results {
        validate_example_result(result)?;
    }
    Ok(())
}

pub fn validate_bridge_event(event: &BridgeEvent) -> Result<(), ProtocolDecodeError> {
    validate_non_empty(&event.run_id, "runId")?;
    validate_non_empty(&event.timestamp, "timestamp")?;
    validate_non_empty(&event.bridge.name, "bridge.name")?;
    validate_non_empty(&event.bridge.version, "bridge.version")?;
    if let Some(framework) = &event.bridge.framework {
        validate_non_empty(framework, "bridge.framework")?;
    }
    validate_example_result(&event.payload)
}

pub fn decode_package_record(raw: &str) -> Result<PackageRecord, ProtocolDecodeError> {
    let record = decode_yaml(raw)?;
    validate_package_record(&record)?;
    Ok(record)
}

pub fn decode_packages_file(raw: &str) -> Result<PackagesFile, ProtocolDecodeError> {
    let file = decode_yaml(raw)?;
    validate_packages_file(&file)?;
    Ok(file)
}

pub fn decode_module_record(raw: &str) -> Result<ModuleRecord, ProtocolDecodeError> {
    let record = decode_yaml(raw)?;
    validate_module_record(&record)?;
    Ok(record)
}

pub fn decode_modules_file(raw: &str) -> Result<ModulesFile, ProtocolDecodeError> {
    let file = decode_yaml(raw)?;
    validate_modules_file(&file)?;
    Ok(file)
}

pub fn decode_locales_file(raw: &str) -> Result<LocalesFile, ProtocolDecodeError> {
    let file = decode_yaml(raw)?;
    validate_locales_file(&file)?;
    Ok(file)
}

pub fn decode_behavior_file(raw: &str) -> Result<BehaviorFile, ProtocolDecodeError> {
    let file = decode_yaml(raw)?;
    validate_behavior_file(&file)?;
    Ok(file)
}

pub fn decode_review_log_file(raw: &str) -> Result<ReviewLogFile, ProtocolDecodeError> {
    let file = decode_yaml(raw)?;
    validate_review_log_file(&file)?;
    Ok(file)
}

pub fn decode_harness_config(raw: &str) -> Result<HarnessConfig, ProtocolDecodeError> {
    let config = decode_yaml(raw)?;
    validate_harness_config(&config)?;
    Ok(config)
}

pub fn decode_results_file(raw: &str) -> Result<ResultsFile, ProtocolDecodeError> {
    let file = decode_yaml(raw)?;
    validate_results_file(&file)?;
    Ok(file)
}

pub fn decode_bridge_event(raw: &str) -> Result<BridgeEvent, ProtocolDecodeError> {
    let event = decode_json(raw)?;
    validate_bridge_event(&event)?;
    Ok(event)
}
