use harness_core::{
    get_promise_run_status, load_module_records, load_promise_records, load_test_results,
    validate_module_records, validate_promise_records, HarnessError,
};
use harness_protocol::{
    LocalizedText, ModuleRecord, PromiseBoundary, PromiseLifecycle, PromisePriority, PromiseRecord,
    PromiseRunStatus, ValidationSeverity,
};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioProject {
    pub name: LocalizedText,
    pub description: LocalizedText,
    pub promise_count: usize,
    pub module_count: usize,
    pub warning_count: usize,
    pub error_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioModule {
    pub id: String,
    pub title: LocalizedText,
    pub summary: LocalizedText,
    pub purpose: LocalizedText,
    pub priority: String,
    pub promise_ids: Vec<String>,
    pub covers: Vec<String>,
    pub related_module_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioPromiseReview {
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioPromise {
    pub id: String,
    pub module_id: String,
    pub feature: String,
    pub title: LocalizedText,
    pub purpose: LocalizedText,
    pub priority: PromisePriority,
    pub boundary: PromiseBoundary,
    pub lifecycle: PromiseLifecycle,
    pub run_status: PromiseRunStatus,
    pub given: Vec<LocalizedText>,
    pub when: Vec<LocalizedText>,
    pub then: Vec<LocalizedText>,
    pub observes: Vec<String>,
    pub failure_meaning: LocalizedText,
    pub review: StudioPromiseReview,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioReviewDraft {
    pub id: String,
    pub title: LocalizedText,
    pub module_ids: Vec<String>,
    pub priority: PromisePriority,
    pub state: String,
    pub reason: LocalizedText,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioSnapshot {
    pub project: StudioProject,
    pub modules: Vec<StudioModule>,
    pub promises: Vec<StudioPromise>,
    pub review_drafts: Vec<StudioReviewDraft>,
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
    match project_id.unwrap_or("current:test-harness") {
        "current:test-harness" | "current" => Some(workspace_root.to_path_buf()),
        "example:todo-backend" => Some(workspace_root.join("examples/todo-backend")),
        "none" => None,
        _ => None,
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
            promise_count: 0,
            module_count: 0,
            warning_count: 0,
            error_count: 0,
        },
        modules: Vec::new(),
        promises: Vec::new(),
        review_drafts: Vec::new(),
    }
}

pub fn build_studio_snapshot(root: impl AsRef<Path>) -> Result<StudioSnapshot, HarnessError> {
    let root = root.as_ref();
    let modules = load_module_records(root)?;
    let promises = load_promise_records(root)?;
    let results = load_test_results(root)?;
    let issues = validate_module_records(&modules)
        .into_iter()
        .chain(validate_promise_records(&promises))
        .collect::<Vec<_>>();
    let warning_count = issues
        .iter()
        .filter(|issue| issue.severity == ValidationSeverity::Warning)
        .count();
    let error_count = issues
        .iter()
        .filter(|issue| issue.severity == ValidationSeverity::Error)
        .count();
    let promise_module_ids = promise_module_ids(&modules);
    let promise_records_by_id = promises
        .iter()
        .map(|promise| (promise.id.as_str(), promise))
        .collect::<BTreeMap<_, _>>();
    let studio_modules = modules
        .iter()
        .map(|module| to_studio_module(module, &promise_records_by_id, &promises, &modules))
        .collect::<Vec<_>>();
    let studio_promises = promises
        .iter()
        .map(|promise| StudioPromise {
            id: promise.id.clone(),
            module_id: promise_module_ids
                .get(promise.id.as_str())
                .cloned()
                .unwrap_or_else(|| "unassigned".to_string()),
            feature: promise.feature.clone(),
            title: promise.title.clone(),
            purpose: promise.purpose.clone(),
            priority: promise.priority.clone(),
            boundary: promise.boundary.clone(),
            lifecycle: promise.lifecycle.clone(),
            run_status: get_promise_run_status(&promise.id, &results),
            given: promise.given.clone(),
            when: promise.when.clone(),
            then: promise.then_steps.clone(),
            observes: promise.observes.clone(),
            failure_meaning: promise.failure_meaning.clone(),
            review: StudioPromiseReview {
                state: review_state(promise).to_string(),
                approved_by: promise.review.approved_by.clone(),
                approved_at: promise.review.approved_at.clone(),
            },
        })
        .collect::<Vec<_>>();

    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Harness project");
    Ok(StudioSnapshot {
        project: StudioProject {
            name: localized(name, name),
            description: localized(
                "Read from the selected Harness project.",
                "从当前选中的 Harness project 读取。",
            ),
            promise_count: studio_promises.len(),
            module_count: studio_modules.len(),
            warning_count,
            error_count,
        },
        modules: studio_modules,
        promises: studio_promises,
        review_drafts: Vec::new(),
    })
}

fn to_studio_module(
    module: &ModuleRecord,
    promises_by_id: &BTreeMap<&str, &PromiseRecord>,
    all_promises: &[PromiseRecord],
    all_modules: &[ModuleRecord],
) -> StudioModule {
    StudioModule {
        id: module.id.clone(),
        title: module.title.clone(),
        summary: module.summary.clone(),
        purpose: module.purpose.clone(),
        priority: module_priority(module, promises_by_id),
        promise_ids: module.promises.clone(),
        covers: module.covers.clone(),
        related_module_ids: related_module_ids(module, all_promises, all_modules),
    }
}

fn module_priority(
    module: &ModuleRecord,
    promises_by_id: &BTreeMap<&str, &PromiseRecord>,
) -> String {
    module
        .promises
        .iter()
        .filter_map(|promise_id| promises_by_id.get(promise_id.as_str()))
        .map(|promise| &promise.priority)
        .min_by_key(|priority| priority_rank(priority))
        .map_or_else(|| "none".to_string(), ToString::to_string)
}

fn priority_rank(priority: &PromisePriority) -> u8 {
    match priority {
        PromisePriority::P0 => 0,
        PromisePriority::P1 => 1,
        PromisePriority::P2 => 2,
    }
}

fn promise_module_ids(modules: &[ModuleRecord]) -> BTreeMap<&str, String> {
    let mut ids = BTreeMap::new();
    for module in modules {
        for promise_id in &module.promises {
            ids.entry(promise_id.as_str())
                .or_insert_with(|| module.id.clone());
        }
    }
    ids
}

fn related_module_ids(
    module: &ModuleRecord,
    promises: &[PromiseRecord],
    modules: &[ModuleRecord],
) -> Vec<String> {
    let owned_promise_ids = module
        .promises
        .iter()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    let mut related = BTreeSet::new();
    for promise in promises
        .iter()
        .filter(|promise| owned_promise_ids.contains(promise.id.as_str()))
    {
        for observed in &promise.observes {
            for other in modules.iter().filter(|other| other.id != module.id) {
                if other
                    .covers
                    .iter()
                    .any(|pattern| matches_cover_glob(observed, pattern))
                {
                    related.insert(other.id.clone());
                }
            }
        }
    }
    related.into_iter().collect()
}

fn matches_cover_glob(path: &str, pattern: &str) -> bool {
    if let Some(prefix) = pattern.strip_suffix("/**") {
        path == prefix || path.starts_with(&format!("{prefix}/"))
    } else {
        path == pattern
    }
}

fn review_state(promise: &PromiseRecord) -> &'static str {
    if promise
        .review
        .approved_by
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
        || promise
            .review
            .approved_at
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
        || promise
            .review
            .approved_in
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
    {
        "approved"
    } else if promise.lifecycle == PromiseLifecycle::ChangedRequiresReview {
        "changes_requested"
    } else {
        "pending"
    }
}

fn localized(en: &str, zh_cn: &str) -> LocalizedText {
    LocalizedText::Localized(BTreeMap::from([
        ("en".to_string(), en.to_string()),
        ("zh-CN".to_string(), zh_cn.to_string()),
    ]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use harness_core::write_test_results_file;
    use harness_protocol::{ProtocolVersion, TestResult, TestResultStatus, TestResultsFile};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn snapshot_reads_modules_promises_and_results_from_project_files() {
        harness_adapter_rust::scenario_test!(
            "harness.daemon.snapshot_reads_canonical_project_files",
            "daemon snapshots are derived from canonical Harness files",
            {
                let temp = tempdir().unwrap();
                fs::create_dir_all(temp.path().join("tests/modules")).unwrap();
                fs::create_dir_all(temp.path().join("tests/promises/core")).unwrap();
                fs::write(
                    temp.path().join("tests/modules/core.module.yaml"),
                    r#"apiVersion: 1
id: core
title:
  en: Core
  zh-CN: Core
summary: Loads project files.
purpose: Keep the daemon snapshot grounded in canonical files.
promises:
  - harness.core.reads_files
covers:
  - crates/core/**
"#,
                )
                .unwrap();
                fs::write(
                    temp.path().join("tests/promises/core/core.promises.yaml"),
                    r#"apiVersion: 1
promises:
  - id: harness.core.reads_files
    feature: Daemon / Snapshot
    title: Reads files
    purpose: Protect daemon-backed snapshots.
    priority: P0
    boundary: integration
    lifecycle: accepted
    given: [A Harness project exists]
    when: [The daemon reads the project]
    then: [A Studio snapshot is produced]
    observes: [crates/core/lib.rs]
    failureMeaning: Studio would show stale data.
    review:
      approvedBy: xinyao
"#,
                )
                .unwrap();
                write_test_results_file(
                    temp.path(),
                    &TestResultsFile {
                        api_version: ProtocolVersion,
                        generated_at: "2026-05-26T00:00:00Z".to_string(),
                        results: vec![TestResult {
                            failure_message: None,
                            file: "crates/core/lib.rs".to_string(),
                            labels: Default::default(),
                            promise_id: "harness.core.reads_files".to_string(),
                            status: TestResultStatus::Passing,
                            test_name: "core evidence".to_string(),
                        }],
                    },
                )
                .unwrap();

                let snapshot = build_studio_snapshot(temp.path()).unwrap();

                assert_eq!(snapshot.project.module_count, 1);
                assert_eq!(snapshot.project.promise_count, 1);
                assert_eq!(snapshot.modules[0].id, "core");
                assert_eq!(snapshot.modules[0].priority, "P0");
                assert_eq!(snapshot.promises[0].module_id, "core");
                assert_eq!(snapshot.promises[0].run_status, PromiseRunStatus::Passing);
                assert_eq!(snapshot.promises[0].review.state, "approved");
            }
        );
    }

    #[test]
    fn snapshot_json_matches_studio_field_names() {
        harness_adapter_rust::scenario_test!(
            "harness.daemon.http_snapshot_matches_studio_contract",
            "daemon snapshots serialize with Studio-compatible field names",
            {
                let snapshot = empty_snapshot("example");
                let value = serde_json::to_value(snapshot).unwrap();

                assert!(value.get("project").is_some());
                assert!(value.get("modules").is_some());
                assert!(value.get("promises").is_some());
                assert!(value.get("reviewDrafts").is_some());
                assert!(value["project"].get("promiseCount").is_some());
                assert!(value["project"].get("moduleCount").is_some());
            }
        );
    }
}
