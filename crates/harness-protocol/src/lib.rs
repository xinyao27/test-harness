use regex::Regex;
use serde::de::{self, DeserializeOwned};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_yaml::Value;
use std::collections::BTreeMap;
use std::fmt;
use std::sync::LazyLock;

static ID_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$").unwrap());

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
#[serde(rename_all = "snake_case")]
pub enum PromiseLifecycle {
    Proposed,
    Accepted,
    Implemented,
    ChangedRequiresReview,
    Deprecated,
}

impl fmt::Display for PromiseLifecycle {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Proposed => "proposed",
            Self::Accepted => "accepted",
            Self::Implemented => "implemented",
            Self::ChangedRequiresReview => "changed_requires_review",
            Self::Deprecated => "deprecated",
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PromiseRunStatus {
    Unknown,
    Passing,
    Failing,
    Skipped,
    MissingEvidence,
    EvidenceDrifted,
}

impl fmt::Display for PromiseRunStatus {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Unknown => "unknown",
            Self::Passing => "passing",
            Self::Failing => "failing",
            Self::Skipped => "skipped",
            Self::MissingEvidence => "missing_evidence",
            Self::EvidenceDrifted => "evidence_drifted",
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PromisePriority {
    #[serde(rename = "P0")]
    P0,
    #[serde(rename = "P1")]
    P1,
    #[serde(rename = "P2")]
    P2,
}

impl fmt::Display for PromisePriority {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::P0 => "P0",
            Self::P1 => "P1",
            Self::P2 => "P2",
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PromiseBoundary {
    Unit,
    Integration,
    Browser,
    E2e,
    Adapter,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PromiseReviewState {
    #[default]
    Pending,
    Approved,
    ChangesRequested,
    Rejected,
}

impl fmt::Display for PromiseReviewState {
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
#[serde(rename_all = "snake_case")]
pub enum PromiseReviewAction {
    Approved,
    ChangesRequested,
    Rejected,
}

impl fmt::Display for PromiseReviewAction {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Approved => "approved",
            Self::ChangesRequested => "changes_requested",
            Self::Rejected => "rejected",
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct PromiseReviewEvent {
    pub action: PromiseReviewAction,
    pub by: String,
    pub at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct PromiseReview {
    pub state: PromiseReviewState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decided_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decided_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// Deterministic hash of the reviewable content (`title`, `purpose`,
    /// `priority`, `boundary`, `given`, `when`, `then`, `observes`,
    /// `failureMeaning`, `examples`) at the moment the review was approved.
    /// Compared by `harness check` against the current content so an
    /// `accepted` promise whose text drifted is flagged. Missing on promises
    /// approved before this field existed; absent means "drift undetectable
    /// for this promise" (no false positives).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
    pub events: Vec<PromiseReviewEvent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PromiseExampleRow {
    pub name: String,
    #[serde(flatten)]
    pub values: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PromiseRecord {
    pub id: String,
    pub feature: String,
    pub title: LocalizedText,
    pub purpose: LocalizedText,
    pub priority: PromisePriority,
    pub boundary: PromiseBoundary,
    pub lifecycle: PromiseLifecycle,
    pub given: Vec<LocalizedText>,
    pub when: Vec<LocalizedText>,
    #[serde(rename = "then")]
    pub then_steps: Vec<LocalizedText>,
    pub observes: Vec<String>,
    #[serde(rename = "failureMeaning")]
    pub failure_meaning: LocalizedText,
    pub review: PromiseReview,
    #[serde(rename = "supersedes", skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
    #[serde(rename = "deprecatedBy", skip_serializing_if = "Option::is_none")]
    pub deprecated_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub examples: Option<Vec<PromiseExampleRow>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PromisesFile {
    #[serde(rename = "apiVersion")]
    pub api_version: ProtocolVersion,
    pub promises: Vec<PromiseRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModuleRecord {
    #[serde(rename = "apiVersion")]
    pub api_version: ProtocolVersion,
    pub id: String,
    pub title: LocalizedText,
    pub summary: LocalizedText,
    pub purpose: LocalizedText,
    pub promises: Vec<String>,
    pub covers: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HarnessRunnerConfig {
    pub command: String,
    pub args: Vec<String>,
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
pub enum TestResultStatus {
    Passing,
    Failing,
    Skipped,
}

impl fmt::Display for TestResultStatus {
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
pub struct TestResult {
    pub file: String,
    #[serde(rename = "promiseId")]
    pub promise_id: String,
    pub status: TestResultStatus,
    #[serde(rename = "testName")]
    pub test_name: String,
    #[serde(rename = "failureMessage", skip_serializing_if = "Option::is_none")]
    pub failure_message: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TestResultsFile {
    #[serde(rename = "apiVersion")]
    pub api_version: ProtocolVersion,
    #[serde(rename = "generatedAt")]
    pub generated_at: String,
    pub results: Vec<TestResult>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AdapterDescriptor {
    pub name: String,
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub framework: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AdapterEventKind {
    #[serde(rename = "testResult")]
    TestResult,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AdapterTestResultPayload {
    pub file: String,
    #[serde(rename = "promiseId")]
    pub promise_id: String,
    pub status: TestResultStatus,
    #[serde(rename = "testName")]
    pub test_name: String,
    #[serde(rename = "failureMessage", skip_serializing_if = "Option::is_none")]
    pub failure_message: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AdapterEvent {
    #[serde(rename = "apiVersion")]
    pub api_version: ProtocolVersion,
    pub kind: AdapterEventKind,
    #[serde(rename = "runId")]
    pub run_id: String,
    pub timestamp: String,
    pub adapter: AdapterDescriptor,
    pub payload: AdapterTestResultPayload,
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
#[serde(deny_unknown_fields)]
pub struct ValidationIssue {
    pub code: String,
    pub message: String,
    pub severity: ValidationSeverity,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(rename = "promiseId", skip_serializing_if = "Option::is_none")]
    pub promise_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PromiseReportItem {
    #[serde(rename = "promiseId")]
    pub promise_id: String,
    pub title: String,
    pub purpose: String,
    pub priority: PromisePriority,
    pub lifecycle: PromiseLifecycle,
    #[serde(rename = "runStatus")]
    pub run_status: PromiseRunStatus,
    pub given: Vec<String>,
    pub when: Vec<String>,
    #[serde(rename = "then")]
    pub then_steps: Vec<String>,
    pub evidence: Vec<String>,
    #[serde(rename = "failureMeaning")]
    pub failure_meaning: String,
    pub warnings: Vec<ValidationIssue>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FeatureReport {
    pub feature: String,
    pub promises: Vec<PromiseReportItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReportSummary {
    pub promises: usize,
    pub errors: usize,
    pub warnings: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SeedReport {
    #[serde(rename = "apiVersion")]
    pub api_version: ProtocolVersion,
    pub summary: ReportSummary,
    pub features: Vec<FeatureReport>,
    pub issues: Vec<ValidationIssue>,
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

pub fn validate_promise_record(record: &PromiseRecord) -> Result<(), ProtocolDecodeError> {
    validate_id(&record.id, "promise id")?;
    ensure_shape(
        !record.given.is_empty(),
        "given must contain at least one item",
    )?;
    ensure_shape(
        !record.when.is_empty(),
        "when must contain at least one item",
    )?;
    ensure_shape(
        !record.then_steps.is_empty(),
        "then must contain at least one item",
    )?;
    ensure_shape(
        !record.observes.is_empty(),
        "observes must contain at least one item",
    )?;
    if let Some(examples) = &record.examples {
        ensure_shape(
            !examples.is_empty(),
            "examples must contain at least one item",
        )?;
    }
    Ok(())
}

pub fn validate_promises_file(file: &PromisesFile) -> Result<(), ProtocolDecodeError> {
    ensure_shape(
        !file.promises.is_empty(),
        "promises must contain at least one item",
    )?;
    for record in &file.promises {
        validate_promise_record(record)?;
    }
    Ok(())
}

pub fn validate_module_record(record: &ModuleRecord) -> Result<(), ProtocolDecodeError> {
    validate_id(&record.id, "module id")?;
    ensure_shape(
        !record.promises.is_empty(),
        "promises must contain at least one item",
    )?;
    ensure_shape(
        !record.covers.is_empty(),
        "covers must contain at least one item",
    )?;
    for promise_id in &record.promises {
        validate_id(promise_id, "module promise id")?;
    }
    Ok(())
}

pub fn validate_harness_config(config: &HarnessConfig) -> Result<(), ProtocolDecodeError> {
    ensure_shape(
        !config.test.runner.command.trim().is_empty(),
        "test.runner.command must not be empty",
    )
}

pub fn validate_test_results_file(_file: &TestResultsFile) -> Result<(), ProtocolDecodeError> {
    Ok(())
}

pub fn validate_adapter_event(event: &AdapterEvent) -> Result<(), ProtocolDecodeError> {
    ensure_shape(!event.run_id.trim().is_empty(), "runId must not be empty")?;
    ensure_shape(
        !event.timestamp.trim().is_empty(),
        "timestamp must not be empty",
    )?;
    ensure_shape(
        !event.adapter.name.trim().is_empty(),
        "adapter.name must not be empty",
    )?;
    ensure_shape(
        !event.adapter.version.trim().is_empty(),
        "adapter.version must not be empty",
    )?;
    if let Some(framework) = &event.adapter.framework {
        ensure_shape(
            !framework.trim().is_empty(),
            "adapter.framework must not be empty",
        )?;
    }
    ensure_shape(
        !event.payload.file.trim().is_empty(),
        "payload.file must not be empty",
    )?;
    ensure_shape(
        !event.payload.promise_id.trim().is_empty(),
        "payload.promiseId must not be empty",
    )?;
    ensure_shape(
        !event.payload.test_name.trim().is_empty(),
        "payload.testName must not be empty",
    )?;
    for (key, value) in &event.payload.labels {
        ensure_shape(
            !key.trim().is_empty(),
            "payload.labels keys must not be empty",
        )?;
        ensure_shape(
            !value.trim().is_empty(),
            "payload.labels values must not be empty",
        )?;
    }
    Ok(())
}

pub fn validate_seed_report(_report: &SeedReport) -> Result<(), ProtocolDecodeError> {
    Ok(())
}

pub fn decode_promise_record(raw: &str) -> Result<PromiseRecord, ProtocolDecodeError> {
    let record = decode_yaml(raw)?;
    validate_promise_record(&record)?;
    Ok(record)
}

pub fn decode_promises_file(raw: &str) -> Result<PromisesFile, ProtocolDecodeError> {
    let file = decode_yaml(raw)?;
    validate_promises_file(&file)?;
    Ok(file)
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawPromisesFile {
    #[serde(rename = "apiVersion")]
    _api_version: ProtocolVersion,
    promises: Vec<Value>,
}

pub fn decode_promises_file_items(
    raw: &str,
) -> Result<Vec<Result<PromiseRecord, ProtocolDecodeError>>, ProtocolDecodeError> {
    let file: RawPromisesFile = decode_yaml(raw)?;
    ensure_shape(
        !file.promises.is_empty(),
        "promises must contain at least one item",
    )?;
    Ok(file
        .promises
        .into_iter()
        .map(|item| {
            let record = decode_value(item)?;
            validate_promise_record(&record)?;
            Ok(record)
        })
        .collect())
}

pub fn decode_module_record(raw: &str) -> Result<ModuleRecord, ProtocolDecodeError> {
    let record = decode_yaml(raw)?;
    validate_module_record(&record)?;
    Ok(record)
}

pub fn decode_harness_config(raw: &str) -> Result<HarnessConfig, ProtocolDecodeError> {
    let config = decode_yaml(raw)?;
    validate_harness_config(&config)?;
    Ok(config)
}

pub fn decode_test_results_file(raw: &str) -> Result<TestResultsFile, ProtocolDecodeError> {
    let file = decode_yaml(raw)?;
    validate_test_results_file(&file)?;
    Ok(file)
}

pub fn decode_adapter_event(raw: &str) -> Result<AdapterEvent, ProtocolDecodeError> {
    let event = decode_json(raw)?;
    validate_adapter_event(&event)?;
    Ok(event)
}

pub fn decode_seed_report(raw: &str) -> Result<SeedReport, ProtocolDecodeError> {
    let report = decode_yaml(raw)?;
    validate_seed_report(&report)?;
    Ok(report)
}
