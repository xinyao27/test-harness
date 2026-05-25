mod config;
mod errors;
mod fs_utils;
mod localized_text;
mod module_registry;
mod programs;
mod promise_registry;
mod report;
mod results;
mod validation;

pub use config::{load_harness_config, HARNESS_CONFIG_PATH};
pub use errors::{HarnessError, ModuleLoadError, PromiseLoadError};
pub use localized_text::{resolve_localized_text, DEFAULT_LANGUAGE};
pub use module_registry::{
    find_module_files, find_source_files, load_module_records, MODULES_DIRECTORY,
};
pub use programs::{build_seed_report, check_seed_harness, SeedCheckResult, SeedReportOptions};
pub use promise_registry::{find_promise_files, load_promise_records, PROMISES_DIRECTORY};
pub use report::{generate_seed_report, render_seed_report_markdown, render_seed_report_summary};
pub use results::{
    create_test_results_file, get_promise_run_status, load_test_results, load_test_results_file,
    write_test_results_file, HARNESS_RESULTS_PATH, HARNESS_ROOT_ENV_VAR,
};
pub use validation::{
    validate_module_coverage, validate_module_records, validate_promise_records,
    validate_test_results,
};

pub use harness_protocol::{
    FeatureReport, HarnessConfig, LocalizedText, ModuleRecord, PromiseLifecycle, PromiseRecord,
    PromiseReportItem, PromiseRunStatus, ProtocolVersion, ReportSummary, SeedReport, TestResult,
    TestResultStatus, TestResultsFile, ValidationIssue, ValidationSeverity,
};

#[cfg(test)]
mod tests {
    use super::*;
    use harness_protocol::{PromiseBoundary, PromiseExampleRow, PromisePriority, PromiseReview};
    use std::collections::BTreeMap;
    use std::fs;
    use std::path::{Path, PathBuf};
    use tempfile::tempdir;

    const VALID_HARNESS_CONFIG: &str = r#"apiVersion: 1
test:
  runner:
    command: vp
    args:
      - test
"#;

    const VALID_PROMISE_YAML: &str = r#"apiVersion: 1
promises:
  - id: harness.promise_registry.load_canonical_yaml_promises
    feature: Seed Harness / Promise Registry
    title:
      en: Accepted promises are loaded from canonical YAML files
      zh-CN: 已接受的承诺会从 canonical YAML 文件中加载
    purpose:
      en: Protect the seed Harness's reviewed behavior promises.
      zh-CN: 保护 seed Harness 能读取自己已批准的行为承诺。
    priority: P0
    boundary: unit
    lifecycle: accepted
    given:
      - en: A promise file exists under the tests/promises root
        zh-CN: tests/promises/ 目录下存在一个 promise 文件
    when:
      - en: The seed Harness loads promise records
        zh-CN: seed Harness 加载 promise records
    then:
      - en: The promise is decoded into a PromiseRecord
        zh-CN: 该 promise 会被解码成 PromiseRecord
    observes:
      - tests/promises/**/*.promises.yaml
    failureMeaning:
      en: The Harness cannot trust its own reviewed behavior promises.
      zh-CN: Harness 无法信任自己已经 review 过的行为承诺。
    review:
      approvedBy: xinyao
      approvedAt: "2026-05-24"
"#;

    fn repo_root() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(Path::parent)
            .unwrap()
            .to_path_buf()
    }

    fn write_minimal_workspace(root: &Path) {
        fs::create_dir_all(root.join("tests")).unwrap();
        fs::write(root.join(HARNESS_CONFIG_PATH), VALID_HARNESS_CONFIG).unwrap();
        fs::create_dir_all(root.join("tests/promises/promise-registry")).unwrap();
        fs::write(
            root.join("tests/promises/promise-registry/promise-registry.promises.yaml"),
            VALID_PROMISE_YAML,
        )
        .unwrap();
    }

    fn valid_promise(id: &str) -> PromiseRecord {
        PromiseRecord {
            boundary: PromiseBoundary::Unit,
            deprecated_by: None,
            examples: None,
            failure_meaning: LocalizedText::Text("Failure has a clear meaning.".to_string()),
            feature: "Seed Harness / Validation".to_string(),
            given: vec![LocalizedText::Text("Given context.".to_string())],
            id: id.to_string(),
            lifecycle: PromiseLifecycle::Accepted,
            observes: vec!["crates/harness-core/src/validation.rs".to_string()],
            priority: PromisePriority::P0,
            purpose: LocalizedText::Text("Protect a reviewed behavior.".to_string()),
            review: PromiseReview {
                approved_at: Some("2026-05-25".to_string()),
                approved_by: Some("xinyao".to_string()),
                approved_in: None,
                notes: None,
            },
            supersedes: None,
            then_steps: vec![LocalizedText::Text("Then result.".to_string())],
            title: LocalizedText::Text("Readable promise title".to_string()),
            when: vec![LocalizedText::Text("When action.".to_string())],
        }
    }

    fn valid_module(id: &str) -> ModuleRecord {
        ModuleRecord {
            api_version: ProtocolVersion,
            covers: vec!["crates/harness-core/src/validation.rs".to_string()],
            id: id.to_string(),
            promises: vec!["harness.validation.rejects_unreadable_modules".to_string()],
            purpose: LocalizedText::Text(
                "Preserve a concrete architecture boundary for review.".to_string(),
            ),
            summary: LocalizedText::Text("Owns validation behavior.".to_string()),
            title: LocalizedText::Text("Validation".to_string()),
        }
    }

    fn result_for(promise_id: &str, status: TestResultStatus) -> TestResult {
        TestResult {
            failure_message: None,
            file: "crates/harness-core/src/lib.rs".to_string(),
            labels: Default::default(),
            promise_id: promise_id.to_string(),
            status,
            test_name: "core evidence".to_string(),
        }
    }

    #[test]
    fn loads_canonical_yaml_promises() {
        let temp = tempdir().unwrap();
        write_minimal_workspace(temp.path());

        let records = load_promise_records(temp.path()).unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(
            records[0].id,
            "harness.promise_registry.load_canonical_yaml_promises"
        );
    }

    #[test]
    fn surfaces_per_record_decode_errors() {
        let temp = tempdir().unwrap();
        fs::create_dir_all(temp.path().join("tests")).unwrap();
        fs::write(temp.path().join(HARNESS_CONFIG_PATH), VALID_HARNESS_CONFIG).unwrap();
        fs::create_dir_all(temp.path().join("tests/promises/grouped")).unwrap();
        fs::write(
            temp.path()
                .join("tests/promises/grouped/grouped.promises.yaml"),
            r#"apiVersion: 1
promises:
  - id: harness.promise_registry.load_canonical_yaml_promises
    feature: Seed Harness / Promise Registry
    title: Valid promise
    purpose: Protect valid child records.
    priority: P0
    boundary: unit
    lifecycle: accepted
    given: [A grouped file exists]
    when: [The loader decodes children]
    then: [The valid child is retained]
    observes: [tests/promises/**/*.promises.yaml]
    failureMeaning: Valid children would be lost.
    review:
      approvedBy: xinyao
  - id: INVALID ID
    feature: Seed Harness / Promise Registry
    title: Invalid promise
    purpose: Trigger child decode errors.
    priority: P0
    boundary: unit
    lifecycle: accepted
    given: [A grouped file exists]
    when: [The loader decodes children]
    then: [The invalid child is reported]
    observes: [tests/promises/**/*.promises.yaml]
    failureMeaning: Invalid children would be hidden.
    review:
      approvedBy: xinyao
"#,
        )
        .unwrap();

        let error = load_promise_records(temp.path()).unwrap_err();
        assert!(error.to_string().contains("PromiseSchemaDecodeError"));
        assert!(error.to_string().contains("[1]"));
    }

    #[test]
    fn loads_canonical_yaml_modules() {
        let temp = tempdir().unwrap();
        fs::create_dir_all(temp.path().join("tests/modules")).unwrap();
        fs::write(
            temp.path().join("tests/modules/core.module.yaml"),
            r#"apiVersion: 1
id: core
title: Core
summary: Core module
purpose: Keep module metadata loadable.
promises:
  - harness.module_registry.load_canonical_yaml_modules
covers:
  - crates/harness-core/src/module_registry.rs
"#,
        )
        .unwrap();

        let records = load_module_records(temp.path()).unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].id, "core");
        assert_eq!(
            records[0].promises,
            vec!["harness.module_registry.load_canonical_yaml_modules"]
        );
    }

    #[test]
    fn promise_run_status_mapping_is_deterministic() {
        let promise_id = "harness.report.computes_promise_run_status_from_results";

        assert_eq!(
            get_promise_run_status(promise_id, &[]),
            PromiseRunStatus::Unknown
        );
        assert_eq!(
            get_promise_run_status(
                promise_id,
                &[result_for(promise_id, TestResultStatus::Passing)]
            ),
            PromiseRunStatus::Passing
        );
        assert_eq!(
            get_promise_run_status(
                promise_id,
                &[result_for(promise_id, TestResultStatus::Skipped)]
            ),
            PromiseRunStatus::Skipped
        );
        assert_eq!(
            get_promise_run_status(
                promise_id,
                &[
                    result_for(promise_id, TestResultStatus::Passing),
                    result_for(promise_id, TestResultStatus::Failing),
                ],
            ),
            PromiseRunStatus::Failing
        );
    }

    #[test]
    fn validation_rejects_unreadable_promises() {
        let mut record = valid_promise("Invalid ID");
        record.title = LocalizedText::Text("works".to_string());
        record.given.clear();
        record.observes = vec![" ".to_string()];

        let codes = validate_promise_records(&[record])
            .into_iter()
            .map(|issue| issue.code)
            .collect::<Vec<_>>();

        assert!(codes.contains(&"invalid_promise_id".to_string()));
        assert!(codes.contains(&"vague_title".to_string()));
        assert!(codes.contains(&"empty_required_list".to_string()));
        assert!(codes.contains(&"blank_required_list_item".to_string()));
    }

    #[test]
    fn validation_warns_when_default_language_missing() {
        let mut record = valid_promise("harness.validation.warns_when_default_language_missing");
        record.title = LocalizedText::Localized(BTreeMap::from([(
            "zh-CN".to_string(),
            "缺少默认语言".to_string(),
        )]));

        let issues = validate_promise_records(&[record]);
        assert!(issues.iter().any(|issue| {
            issue.severity == ValidationSeverity::Warning
                && issue.code == "missing_default_language"
        }));
    }

    #[test]
    fn validation_checks_examples_table_shape() {
        let mut record = valid_promise("harness.validation.checks_examples_table_shape");
        record.examples = Some(vec![
            PromiseExampleRow {
                name: "first".to_string(),
                values: BTreeMap::from([("input".to_string(), "one".to_string())]),
            },
            PromiseExampleRow {
                name: "second".to_string(),
                values: BTreeMap::from([("other".to_string(), "two".to_string())]),
            },
            PromiseExampleRow {
                name: String::new(),
                values: BTreeMap::from([("input".to_string(), "three".to_string())]),
            },
        ]);

        let codes = validate_promise_records(&[record])
            .into_iter()
            .map(|issue| issue.code)
            .collect::<Vec<_>>();

        assert!(codes.contains(&"inconsistent_example_columns".to_string()));
        assert!(codes.contains(&"blank_example_row_name".to_string()));
    }

    #[test]
    fn validation_rejects_unreadable_modules() {
        let mut first = valid_module("utils");
        first.title = LocalizedText::Text("Utils".to_string());
        let mut second = valid_module("utils");
        second.summary = LocalizedText::Text(" ".to_string());
        second.purpose = LocalizedText::Localized(BTreeMap::from([(
            "zh-CN".to_string(),
            "缺少默认语言".to_string(),
        )]));

        let codes = validate_module_records(&[first, second])
            .into_iter()
            .map(|issue| issue.code)
            .collect::<Vec<_>>();

        assert!(codes.contains(&"duplicate_module_id".to_string()));
        assert!(codes.contains(&"blank_required_field".to_string()));
        assert!(codes.contains(&"missing_default_language".to_string()));
        assert!(codes.contains(&"vague_architecture_module".to_string()));
    }

    #[test]
    fn validation_flags_uncovered_source_files() {
        let modules = vec![ModuleRecord {
            api_version: ProtocolVersion,
            covers: vec!["crates/harness-core/src/covered.rs".to_string()],
            id: "core".to_string(),
            promises: vec!["harness.validation.flags_uncovered_source_files".to_string()],
            purpose: LocalizedText::Text("Purpose".to_string()),
            summary: LocalizedText::Text("Summary".to_string()),
            title: LocalizedText::Text("Title".to_string()),
        }];
        let issues = validate_module_coverage(
            &modules,
            &[
                "crates/harness-core/src/covered.rs".to_string(),
                "crates/harness-core/src/uncovered.rs".to_string(),
            ],
        );

        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].code, "uncovered_source_file");
        assert_eq!(
            issues[0].path.as_deref(),
            Some("crates/harness-core/src/uncovered.rs")
        );
    }

    #[test]
    fn validation_flags_promises_without_test_results() {
        let mut record = valid_promise("harness.validation.flags_promises_without_test_results");
        record.lifecycle = PromiseLifecycle::Implemented;

        let issues = validate_test_results(&[record], &[]);
        assert!(issues.iter().any(|issue| {
            issue.severity == ValidationSeverity::Warning && issue.code == "missing_test_result"
        }));
    }

    #[test]
    fn validation_flags_unknown_scenario_bindings() {
        let record = valid_promise("harness.validation.flags_unknown_scenario_bindings");
        let issues = validate_test_results(
            &[record],
            &[result_for(
                "harness.unknown.promise",
                TestResultStatus::Passing,
            )],
        );

        assert!(issues.iter().any(|issue| {
            issue.severity == ValidationSeverity::Error && issue.code == "unknown_result_binding"
        }));
    }

    #[test]
    fn full_report_matches_golden_output() {
        let temp = tempdir().unwrap();
        write_minimal_workspace(temp.path());

        let report = build_seed_report(temp.path(), SeedReportOptions::default()).unwrap();
        let rendered = render_seed_report_markdown(&report);
        let golden = fs::read_to_string(
            repo_root().join("protocol/fixtures/cli/golden/verify-basic.en.stdout"),
        )
        .unwrap();
        assert_eq!(rendered.trim_end(), golden.trim_end());
    }

    #[test]
    fn summary_report_matches_golden_output() {
        let temp = tempdir().unwrap();
        write_minimal_workspace(temp.path());

        let report = build_seed_report(temp.path(), SeedReportOptions::default()).unwrap();
        let rendered = render_seed_report_summary(&report);
        let golden = fs::read_to_string(
            repo_root().join("protocol/fixtures/cli/golden/report-summary-basic.en.stdout"),
        )
        .unwrap();
        assert_eq!(rendered.trim_end(), golden.trim_end());
    }

    #[test]
    fn report_falls_back_through_language_chain() {
        let temp = tempdir().unwrap();
        write_minimal_workspace(temp.path());

        let report = build_seed_report(
            temp.path(),
            SeedReportOptions {
                language: Some("fr-CA".to_string()),
                results: None,
            },
        )
        .unwrap();
        let rendered = render_seed_report_markdown(&report);
        assert!(rendered.contains("Accepted promises are loaded from canonical YAML files"));
        assert!(!rendered.contains("已接受的承诺会从 canonical YAML 文件中加载"));
    }

    #[test]
    fn report_renders_in_requested_language() {
        let temp = tempdir().unwrap();
        write_minimal_workspace(temp.path());

        let report = build_seed_report(
            temp.path(),
            SeedReportOptions {
                language: Some("zh-CN".to_string()),
                results: None,
            },
        )
        .unwrap();
        let rendered = render_seed_report_markdown(&report);
        assert!(rendered.contains("已接受的承诺会从 canonical YAML 文件中加载"));
        assert!(rendered.contains("该 promise 会被解码成 PromiseRecord"));
    }
}
