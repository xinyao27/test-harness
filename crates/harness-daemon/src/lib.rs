use harness_project::{
    check_feature_harness, get_example_run_status, load_behavior_file, load_review_log_file,
    ExampleRecord, ExampleRunStatus, FeatureRecord, HarnessError, RuleRecord, BEHAVIOR_PATH,
    REVIEW_LOG_PATH,
};
use harness_protocol::{
    BehaviorFile, BehaviorLifecycle, BehaviorReview, ExampleResult, LocalizedText, ModuleRecord,
    PackageRecord, ResultsFile, ReviewLogAcknowledgement, ReviewLogAction, ReviewLogEvent,
    ReviewState, ValidationSeverity,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioProject {
    pub name: LocalizedText,
    pub description: LocalizedText,
    pub package_count: usize,
    pub module_count: usize,
    pub feature_count: usize,
    pub rule_count: usize,
    pub example_count: usize,
    pub warning_count: usize,
    pub error_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioPackage {
    pub id: String,
    pub title: LocalizedText,
    pub path: String,
    pub purpose: LocalizedText,
    pub module_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioModule {
    pub id: String,
    pub package: String,
    pub title: LocalizedText,
    pub purpose: LocalizedText,
    pub covers: Vec<String>,
    pub feature_tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioFeature {
    pub tag: String,
    pub name: String,
    pub path: String,
    pub line: usize,
    pub locale: String,
    pub package: String,
    pub module: String,
    pub rules: Vec<StudioRule>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioRule {
    pub tag: String,
    pub name: String,
    pub line: usize,
    pub lifecycle: BehaviorLifecycle,
    pub review_state: ReviewState,
    pub owner: String,
    pub review_events: Vec<StudioReviewEvent>,
    pub examples: Vec<StudioExample>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioReviewEvent {
    pub id: String,
    pub at: String,
    pub by: String,
    pub action: ReviewLogAction,
    pub summary: LocalizedText,
    pub acknowledgement_state: ReviewState,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioRuleReviewInput {
    pub action: StudioRuleReviewAction,
    pub feature: String,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub reviewer: Option<String>,
    pub rule: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StudioRuleReviewAction {
    Approve,
    RequestChanges,
    Reject,
    Deprecate,
    Supersede,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioRuleReviewOutcome {
    pub feature: String,
    pub rule: String,
    pub lifecycle: BehaviorLifecycle,
    pub review_state: ReviewState,
    pub event_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioExample {
    pub tag: String,
    pub name: String,
    pub line: usize,
    pub run_status: String,
    pub evidence: Vec<StudioExampleEvidence>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioExampleEvidence {
    pub file: String,
    pub locale: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioReviewDraft {
    pub id: String,
    pub title: LocalizedText,
    pub module_ids: Vec<String>,
    pub state: String,
    pub reason: LocalizedText,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioSnapshot {
    pub project: StudioProject,
    pub packages: Vec<StudioPackage>,
    pub modules: Vec<StudioModule>,
    pub features: Vec<StudioFeature>,
    pub review_drafts: Vec<StudioReviewDraft>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub results_generated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownProject {
    pub id: String,
    pub name: String,
    pub path: String,
    pub source: String,
}

pub fn known_projects(workspace_root: impl AsRef<Path>) -> Vec<KnownProject> {
    let workspace_root = workspace_root.as_ref();
    let mut projects = vec![KnownProject {
        id: "current:test-harness".to_string(),
        name: workspace_root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("current-project")
            .to_string(),
        path: workspace_root.to_string_lossy().to_string(),
        source: "current".to_string(),
    }];

    let todo_backend = workspace_root.join("examples/todo-backend");
    if todo_backend.join("tests/harness.yaml").exists() {
        projects.push(KnownProject {
            id: "example:todo-backend".to_string(),
            name: "todo-backend".to_string(),
            path: todo_backend.to_string_lossy().to_string(),
            source: "example".to_string(),
        });
    }

    projects
}

pub fn resolve_project_root(
    workspace_root: impl AsRef<Path>,
    project_id: Option<&str>,
) -> Option<PathBuf> {
    let workspace_root = workspace_root.as_ref();
    let project_id = project_id.unwrap_or("current:test-harness");
    if let Some(path) = project_id.strip_prefix("directory:") {
        return resolve_directory_project_root(path);
    }

    match project_id {
        "current:test-harness" | "current" => Some(workspace_root.to_path_buf()),
        "example:todo-backend" => Some(workspace_root.join("examples/todo-backend")),
        "none" => None,
        _ => None,
    }
}

fn resolve_directory_project_root(path: &str) -> Option<PathBuf> {
    let root = PathBuf::from(path).canonicalize().ok()?;
    if root.join("tests/harness.yaml").exists() {
        Some(root)
    } else {
        None
    }
}

pub fn empty_snapshot(project_name: impl Into<String>) -> StudioSnapshot {
    let project_name = project_name.into();
    StudioSnapshot {
        project: StudioProject {
            name: localized(&project_name, &project_name),
            description: localized(
                "This project does not have a displayable Harness snapshot yet.",
                "这个 project 还没有可显示的 Harness snapshot。",
            ),
            package_count: 0,
            module_count: 0,
            feature_count: 0,
            rule_count: 0,
            example_count: 0,
            warning_count: 0,
            error_count: 0,
        },
        packages: Vec::new(),
        modules: Vec::new(),
        features: Vec::new(),
        review_drafts: Vec::new(),
        results_generated_at: None,
    }
}

pub fn build_studio_snapshot(root: impl AsRef<Path>) -> Result<StudioSnapshot, HarnessError> {
    let root = root.as_ref();
    let check = check_feature_harness(root)?;
    let warning_count = check
        .issues
        .iter()
        .filter(|issue| issue.severity == ValidationSeverity::Warning)
        .count();
    let error_count = check
        .issues
        .iter()
        .filter(|issue| issue.severity == ValidationSeverity::Error)
        .count();
    let results_generated_at = check.results.as_ref().map(|file| file.generated_at.clone());

    let packages = check
        .packages
        .iter()
        .map(to_studio_package)
        .collect::<Vec<_>>();
    let modules = check
        .modules
        .iter()
        .map(|module| to_studio_module(module, &check.features))
        .collect::<Vec<_>>();
    let features = check
        .features
        .iter()
        .map(|feature| {
            to_studio_feature(
                feature,
                &check.behavior,
                &check.review_log.events,
                check.results.as_ref(),
            )
        })
        .collect::<Vec<_>>();

    Ok(StudioSnapshot {
        project: StudioProject {
            name: localized(&project_name(root), &format!("{} 项目", project_name(root))),
            description: localized(
                "BDD Harness behavior model generated from Cucumber feature files.",
                "基于 Cucumber feature 文件生成的 BDD Harness 行为模型。",
            ),
            package_count: packages.len(),
            module_count: modules.len(),
            feature_count: unique_feature_count(&check.features),
            rule_count: unique_rule_count(&check.features),
            example_count: unique_example_count(&check.features),
            warning_count,
            error_count,
        },
        packages,
        modules,
        features,
        review_drafts: review_drafts(&check.behavior, &check.modules),
        results_generated_at,
    })
}

fn to_studio_package(package: &PackageRecord) -> StudioPackage {
    StudioPackage {
        id: package.id.clone(),
        title: package.title.clone(),
        path: package.path.clone(),
        purpose: package.purpose.clone(),
        module_ids: package.modules.clone(),
    }
}

fn to_studio_module(module: &ModuleRecord, features: &[FeatureRecord]) -> StudioModule {
    let feature_tags = features
        .iter()
        .filter(|feature| feature.module_id.as_deref() == Some(module.id.as_str()))
        .filter_map(|feature| feature.feature_id.as_ref())
        .map(|id| tag("@feature:", id))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    StudioModule {
        id: module.id.clone(),
        package: module.package.clone(),
        title: module.title.clone(),
        purpose: module.purpose.clone(),
        covers: module.covers.clone(),
        feature_tags,
    }
}

fn to_studio_feature(
    feature: &FeatureRecord,
    behavior: &BehaviorFile,
    review_events: &[ReviewLogEvent],
    results: Option<&ResultsFile>,
) -> StudioFeature {
    StudioFeature {
        tag: feature
            .feature_id
            .as_ref()
            .map(|id| tag("@feature:", id))
            .unwrap_or_else(|| feature.path.clone()),
        name: feature.name.clone(),
        path: feature.path.clone(),
        line: feature.line,
        locale: feature.locale_id.clone().unwrap_or_default(),
        package: feature.package_id.clone().unwrap_or_default(),
        module: feature.module_id.clone().unwrap_or_default(),
        rules: feature
            .rules
            .iter()
            .map(|rule| to_studio_rule(feature, rule, behavior, review_events, results))
            .collect(),
    }
}

fn to_studio_rule(
    feature: &FeatureRecord,
    rule: &RuleRecord,
    behavior: &BehaviorFile,
    review_events: &[ReviewLogEvent],
    results: Option<&ResultsFile>,
) -> StudioRule {
    let feature_tag = feature
        .feature_id
        .as_ref()
        .map(|id| tag("@feature:", id))
        .unwrap_or_default();
    let rule_tag = rule
        .rule_id
        .as_ref()
        .map(|id| tag("@rule:", id))
        .unwrap_or_else(|| format!("{}:{}", feature.path, rule.line));
    let behavior_record = behavior
        .rules
        .iter()
        .find(|record| record.feature == feature_tag && record.rule == rule_tag);
    StudioRule {
        tag: rule_tag.clone(),
        name: rule.name.clone(),
        line: rule.line,
        lifecycle: behavior_record
            .map(|record| record.lifecycle.clone())
            .unwrap_or(BehaviorLifecycle::Draft),
        review_state: behavior_record
            .map(|record| record.review.state.clone())
            .unwrap_or(ReviewState::Pending),
        owner: behavior_record
            .map(|record| record.owner.clone())
            .unwrap_or_default(),
        review_events: review_events_for_rule(review_events, &rule_tag),
        examples: rule
            .examples
            .iter()
            .map(|example| to_studio_example(&feature_tag, &rule_tag, example, results))
            .collect(),
    }
}

pub fn review_rule(
    root: impl AsRef<Path>,
    input: StudioRuleReviewInput,
) -> Result<StudioRuleReviewOutcome, String> {
    let root = root.as_ref();
    let mut behavior = load_behavior_file(root).map_err(|error| error.to_string())?;
    let mut review_log = load_review_log_file(root).map_err(|error| error.to_string())?;
    let reviewer = input
        .reviewer
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("studio")
        .to_string();
    let timestamp = timestamp_string();
    let note = input
        .note
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| LocalizedText::Text(value.to_string()));
    let (lifecycle, review_state, log_action) = review_transition(&input.action);

    let Some(record) = behavior
        .rules
        .iter_mut()
        .find(|record| record.feature == input.feature && record.rule == input.rule)
    else {
        return Err(format!(
            "Rule {} under feature {} was not found in {BEHAVIOR_PATH}.",
            input.rule, input.feature
        ));
    };

    record.lifecycle = lifecycle.clone();
    record.review = BehaviorReview {
        at: Some(timestamp.clone()),
        by: Some(reviewer.clone()),
        note: note.clone(),
        state: review_state.clone(),
    };

    let event_id = format!(
        "review-log.{}.{}",
        timestamp_millis(),
        slug(&format!("{:?}-{}", input.action, input.rule))
    );
    review_log.events.push(ReviewLogEvent {
        acknowledgement: ReviewLogAcknowledgement {
            at: Some(timestamp.clone()),
            by: Some(reviewer.clone()),
            note,
            state: review_state.clone(),
        },
        action: log_action,
        affected_rules: vec![input.rule.clone()],
        at: timestamp,
        by: reviewer,
        id: event_id.clone(),
        summary: review_summary(&input.action, &input.rule),
    });

    write_yaml(root.join(BEHAVIOR_PATH), &behavior)?;
    write_yaml(root.join(REVIEW_LOG_PATH), &review_log)?;

    Ok(StudioRuleReviewOutcome {
        event_id,
        feature: input.feature,
        lifecycle,
        review_state,
        rule: input.rule,
    })
}

fn to_studio_example(
    feature_tag: &str,
    rule_tag: &str,
    example: &ExampleRecord,
    results: Option<&ResultsFile>,
) -> StudioExample {
    let example_tag = example
        .example_id
        .as_ref()
        .map(|id| tag("@example:", id))
        .unwrap_or_else(|| format!("line:{}", example.line));
    let result_items = results
        .map(|file| matching_results(feature_tag, rule_tag, &example_tag, &file.results))
        .unwrap_or_default();
    StudioExample {
        tag: example_tag.clone(),
        name: example.name.clone(),
        line: example.line,
        run_status: example_run_status(get_example_run_status(
            feature_tag,
            rule_tag,
            &example_tag,
            results.map(|file| file.results.as_slice()).unwrap_or(&[]),
        )),
        evidence: result_items
            .iter()
            .map(|result| StudioExampleEvidence {
                file: result.file.clone(),
                locale: result.locale.clone(),
                status: result.status.to_string(),
                failure_message: result.failure_message.clone(),
            })
            .collect(),
    }
}

fn matching_results<'a>(
    feature: &str,
    rule: &str,
    example: &str,
    results: &'a [ExampleResult],
) -> Vec<&'a ExampleResult> {
    results
        .iter()
        .filter(|result| {
            result.feature == feature && result.rule == rule && result.example == example
        })
        .collect()
}

fn review_events_for_rule(events: &[ReviewLogEvent], rule_tag: &str) -> Vec<StudioReviewEvent> {
    events
        .iter()
        .filter(|event| event.affected_rules.iter().any(|rule| rule == rule_tag))
        .map(|event| StudioReviewEvent {
            acknowledgement_state: event.acknowledgement.state.clone(),
            action: event.action.clone(),
            at: event.at.clone(),
            by: event.by.clone(),
            id: event.id.clone(),
            summary: event.summary.clone(),
        })
        .collect()
}

fn review_transition(
    action: &StudioRuleReviewAction,
) -> (BehaviorLifecycle, ReviewState, ReviewLogAction) {
    match action {
        StudioRuleReviewAction::Approve => (
            BehaviorLifecycle::Accepted,
            ReviewState::Approved,
            ReviewLogAction::Approved,
        ),
        StudioRuleReviewAction::RequestChanges => (
            BehaviorLifecycle::Proposed,
            ReviewState::ChangesRequested,
            ReviewLogAction::ChangesRequested,
        ),
        StudioRuleReviewAction::Reject => (
            BehaviorLifecycle::Proposed,
            ReviewState::Rejected,
            ReviewLogAction::Rejected,
        ),
        StudioRuleReviewAction::Deprecate => (
            BehaviorLifecycle::Deprecated,
            ReviewState::Approved,
            ReviewLogAction::Deprecated,
        ),
        StudioRuleReviewAction::Supersede => (
            BehaviorLifecycle::Superseded,
            ReviewState::Approved,
            ReviewLogAction::Superseded,
        ),
    }
}

fn review_summary(action: &StudioRuleReviewAction, rule: &str) -> LocalizedText {
    let action_text = match action {
        StudioRuleReviewAction::Approve => ("Approved", "批准"),
        StudioRuleReviewAction::RequestChanges => ("Requested changes on", "请求修改"),
        StudioRuleReviewAction::Reject => ("Rejected", "拒绝"),
        StudioRuleReviewAction::Deprecate => ("Deprecated", "废弃"),
        StudioRuleReviewAction::Supersede => ("Superseded", "替换"),
    };
    localized(
        &format!("{} {rule} from Studio.", action_text.0),
        &format!("在 Studio 中{} {rule}。", action_text.1),
    )
}

fn write_yaml(path: PathBuf, value: &impl Serialize) -> Result<(), String> {
    let raw = serde_yaml::to_string(value).map_err(|error| error.to_string())?;
    fs::write(&path, raw).map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

fn timestamp_string() -> String {
    format!("unix-ms:{}", timestamp_millis())
}

fn timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn slug(value: &str) -> String {
    let mut output = String::new();
    let mut previous_dash = false;
    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            output.push(character);
            previous_dash = false;
        } else if !previous_dash {
            output.push('-');
            previous_dash = true;
        }
    }
    output.trim_matches('-').to_string()
}

fn review_drafts(behavior: &BehaviorFile, modules: &[ModuleRecord]) -> Vec<StudioReviewDraft> {
    let module_ids = modules
        .iter()
        .map(|module| module.id.clone())
        .collect::<Vec<_>>();
    behavior
        .rules
        .iter()
        .filter(|record| {
            record.lifecycle == BehaviorLifecycle::Proposed
                || record.review.state == ReviewState::Pending
                || record.review.state == ReviewState::ChangesRequested
        })
        .map(|record| StudioReviewDraft {
            id: record.rule.clone(),
            title: LocalizedText::Text(record.rule.clone()),
            module_ids: if record.owner.is_empty() {
                module_ids.clone()
            } else {
                vec![record.owner.clone()]
            },
            state: record.review.state.to_string(),
            reason: localized(
                "Rule needs human lifecycle review.",
                "Rule 需要人类进行生命周期 review。",
            ),
        })
        .collect()
}

fn localized(en: &str, zh_cn: &str) -> LocalizedText {
    LocalizedText::Localized(BTreeMap::from([
        ("en".to_string(), en.to_string()),
        ("zh-CN".to_string(), zh_cn.to_string()),
    ]))
}

fn project_name(root: &Path) -> String {
    root.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Harness Project")
        .to_string()
}

fn tag(prefix: &str, id: &str) -> String {
    format!("{prefix}{id}")
}

fn example_run_status(status: ExampleRunStatus) -> String {
    match status {
        ExampleRunStatus::Unknown => "unknown",
        ExampleRunStatus::Passing => "passing",
        ExampleRunStatus::Failing => "failing",
        ExampleRunStatus::Skipped => "skipped",
    }
    .to_string()
}

fn unique_feature_count(features: &[FeatureRecord]) -> usize {
    features
        .iter()
        .filter_map(|feature| feature.feature_id.clone())
        .collect::<BTreeSet<_>>()
        .len()
}

fn unique_rule_count(features: &[FeatureRecord]) -> usize {
    let mut ids = BTreeSet::new();
    for feature in features {
        let Some(feature_id) = &feature.feature_id else {
            continue;
        };
        for rule in &feature.rules {
            if let Some(rule_id) = &rule.rule_id {
                ids.insert((feature_id.clone(), rule_id.clone()));
            }
        }
    }
    ids.len()
}

fn unique_example_count(features: &[FeatureRecord]) -> usize {
    let mut ids = BTreeSet::new();
    for feature in features {
        let Some(feature_id) = &feature.feature_id else {
            continue;
        };
        for rule in &feature.rules {
            let Some(rule_id) = &rule.rule_id else {
                continue;
            };
            for example in &rule.examples {
                if let Some(example_id) = &example.example_id {
                    ids.insert((feature_id.clone(), rule_id.clone(), example_id.clone()));
                }
            }
        }
    }
    ids.len()
}
