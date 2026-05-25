use crate::localized_text::{
    has_default_language_text, is_blank, is_localized_text_blank, resolve_localized_text,
};
use harness_protocol::{
    ModuleRecord, PromiseExampleRow, PromiseLifecycle, PromiseRecord, TestResult, ValidationIssue,
    ValidationSeverity,
};
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

static ID_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$").unwrap());

fn issue(
    severity: ValidationSeverity,
    code: impl Into<String>,
    message: impl Into<String>,
    promise_id: Option<String>,
    path: Option<String>,
) -> ValidationIssue {
    ValidationIssue {
        code: code.into(),
        message: message.into(),
        severity,
        path,
        promise_id,
    }
}

fn has_review_approval(record: &PromiseRecord) -> bool {
    record
        .review
        .approved_by
        .as_deref()
        .is_some_and(|value| !is_blank(value))
        || record
            .review
            .approved_in
            .as_deref()
            .is_some_and(|value| !is_blank(value))
}

pub fn validate_promise_records(records: &[PromiseRecord]) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    let mut seen = HashSet::new();

    for record in records {
        if !seen.insert(record.id.clone()) {
            issues.push(issue(
                ValidationSeverity::Error,
                "duplicate_promise_id",
                format!("Duplicate promise id \"{}\".", record.id),
                Some(record.id.clone()),
                None,
            ));
        }

        if !ID_PATTERN.is_match(&record.id) {
            issues.push(issue(
                ValidationSeverity::Error,
                "invalid_promise_id",
                format!(
                    "Promise id \"{}\" must be stable, lowercase, and dot/underscore/hyphen separated.",
                    record.id
                ),
                Some(record.id.clone()),
                None,
            ));
        }

        for (field, value) in [
            ("title", &record.title),
            ("purpose", &record.purpose),
            ("failureMeaning", &record.failure_meaning),
        ] {
            if is_localized_text_blank(value) {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "blank_required_field",
                    format!("Promise \"{}\" has a blank {field}.", record.id),
                    Some(record.id.clone()),
                    None,
                ));
            }
            if !has_default_language_text(value) {
                issues.push(issue(
                    ValidationSeverity::Warning,
                    "missing_default_language",
                    format!(
                        "Promise \"{}\" should include non-blank en text for {field}.",
                        record.id
                    ),
                    Some(record.id.clone()),
                    None,
                ));
            }
        }

        if is_blank(&record.feature) {
            issues.push(issue(
                ValidationSeverity::Error,
                "blank_required_field",
                format!("Promise \"{}\" has a blank feature.", record.id),
                Some(record.id.clone()),
                None,
            ));
        }

        for (field, values) in [
            ("given", &record.given),
            ("when", &record.when),
            ("then", &record.then_steps),
        ] {
            if values.is_empty() {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "empty_required_list",
                    format!(
                        "Promise \"{}\" must include at least one {field} item.",
                        record.id
                    ),
                    Some(record.id.clone()),
                    None,
                ));
            }

            for (index, value) in values.iter().enumerate() {
                if is_localized_text_blank(value) {
                    issues.push(issue(
                        ValidationSeverity::Error,
                        "blank_required_list_item",
                        format!(
                            "Promise \"{}\" has a blank {field}[{index}] item.",
                            record.id
                        ),
                        Some(record.id.clone()),
                        None,
                    ));
                }
                if !has_default_language_text(value) {
                    issues.push(issue(
                        ValidationSeverity::Warning,
                        "missing_default_language",
                        format!(
                            "Promise \"{}\" should include non-blank en text for {field}[{index}].",
                            record.id
                        ),
                        Some(record.id.clone()),
                        None,
                    ));
                }
            }
        }

        if record.observes.is_empty() {
            issues.push(issue(
                ValidationSeverity::Error,
                "empty_required_list",
                format!(
                    "Promise \"{}\" must include at least one observes item.",
                    record.id
                ),
                Some(record.id.clone()),
                None,
            ));
        }

        for (index, value) in record.observes.iter().enumerate() {
            if is_blank(value) {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "blank_required_list_item",
                    format!(
                        "Promise \"{}\" has a blank observes[{index}] item.",
                        record.id
                    ),
                    Some(record.id.clone()),
                    None,
                ));
            }
        }

        let title = resolve_localized_text(&record.title, None);
        if matches!(
            title.trim().to_ascii_lowercase().as_str(),
            "works" | "returns expected value"
        ) {
            issues.push(issue(
                ValidationSeverity::Error,
                "vague_title",
                format!("Promise \"{}\" has a vague title.", record.id),
                Some(record.id.clone()),
                None,
            ));
        }

        if record.lifecycle == PromiseLifecycle::Accepted && !has_review_approval(record) {
            issues.push(issue(
                ValidationSeverity::Warning,
                "missing_review_metadata",
                format!(
                    "Accepted promise \"{}\" should include review.approvedBy or review.approvedIn.",
                    record.id
                ),
                Some(record.id.clone()),
                None,
            ));
        }

        if let Some(examples) = &record.examples {
            let first_keys = examples.first().map(example_keys).unwrap_or_default();
            let mut seen_names = HashMap::new();
            for (row_index, row) in examples.iter().enumerate() {
                let row_keys = example_keys(row);
                if row_index > 0 && row_keys != first_keys {
                    issues.push(issue(
                        ValidationSeverity::Error,
                        "inconsistent_example_columns",
                        format!(
                            "Promise \"{}\" example row {row_index} (\"{}\") has columns differing from the first row.",
                            record.id, row.name
                        ),
                        Some(record.id.clone()),
                        None,
                    ));
                }
                if is_blank(&row.name) {
                    issues.push(issue(
                        ValidationSeverity::Error,
                        "blank_example_row_name",
                        format!(
                            "Promise \"{}\" example row {row_index} has a blank `name`.",
                            record.id
                        ),
                        Some(record.id.clone()),
                        None,
                    ));
                    continue;
                }
                if let Some(previous) = seen_names.insert(row.name.clone(), row_index) {
                    issues.push(issue(
                        ValidationSeverity::Error,
                        "duplicate_example_row_name",
                        format!(
                            "Promise \"{}\" example rows {previous} and {row_index} share the same name \"{}\".",
                            record.id, row.name
                        ),
                        Some(record.id.clone()),
                        None,
                    ));
                }
            }
        }
    }

    issues
}

fn example_keys(row: &PromiseExampleRow) -> HashSet<String> {
    let mut keys = row.values.keys().cloned().collect::<HashSet<_>>();
    keys.insert("name".to_string());
    keys
}

pub fn validate_module_coverage(
    modules: &[ModuleRecord],
    source_files: &[String],
) -> Vec<ValidationIssue> {
    source_files
        .iter()
        .filter(|file_path| {
            !modules.iter().any(|module| {
                module
                    .covers
                    .iter()
                    .any(|pattern| matches_cover_glob(file_path, pattern))
            })
        })
        .map(|file_path| {
            issue(
                ValidationSeverity::Error,
                "uncovered_source_file",
                format!(
                    "Source file \"{}\" is not covered by any module's covers list.",
                    file_path
                ),
                None,
                Some(file_path.clone()),
            )
        })
        .collect()
}

fn matches_cover_glob(file_path: &str, pattern: &str) -> bool {
    if let Some(prefix) = pattern.strip_suffix("/**") {
        file_path == prefix || file_path.starts_with(&format!("{prefix}/"))
    } else {
        file_path == pattern
    }
}

pub fn validate_test_results(
    records: &[PromiseRecord],
    results: &[TestResult],
) -> Vec<ValidationIssue> {
    let promise_ids = records
        .iter()
        .map(|record| record.id.as_str())
        .collect::<HashSet<_>>();
    let result_promise_ids = results
        .iter()
        .map(|result| result.promise_id.as_str())
        .collect::<HashSet<_>>();
    let mut issues = Vec::new();

    for record in records {
        if record.lifecycle == PromiseLifecycle::Implemented
            && !result_promise_ids.contains(record.id.as_str())
        {
            issues.push(issue(
                ValidationSeverity::Warning,
                "missing_test_result",
                format!(
                    "Implemented promise \"{}\" has no collected test result.",
                    record.id
                ),
                Some(record.id.clone()),
                None,
            ));
        }
    }

    for result in results {
        if !promise_ids.contains(result.promise_id.as_str()) {
            issues.push(issue(
                ValidationSeverity::Error,
                "unknown_result_binding",
                format!(
                    "Test result binding \"{}\" does not match any canonical promise.",
                    result.promise_id
                ),
                Some(result.promise_id.clone()),
                None,
            ));
        }
    }

    issues
}
