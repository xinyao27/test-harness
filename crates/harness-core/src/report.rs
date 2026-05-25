use crate::localized_text::resolve_localized_text;
use crate::results::get_promise_run_status;
use harness_protocol::{
    FeatureReport, PromiseRecord, PromiseReportItem, ProtocolVersion, ReportSummary, SeedReport,
    TestResult, ValidationIssue, ValidationSeverity,
};
use std::collections::BTreeMap;

pub fn generate_seed_report(
    records: &[PromiseRecord],
    issues: &[ValidationIssue],
    language: Option<&str>,
    results: &[TestResult],
) -> SeedReport {
    let mut by_feature = BTreeMap::<String, Vec<&PromiseRecord>>::new();
    for record in records {
        by_feature
            .entry(record.feature.clone())
            .or_default()
            .push(record);
    }

    let features = by_feature
        .into_iter()
        .map(|(feature, mut records)| {
            records.sort_by(|left, right| left.id.cmp(&right.id));
            FeatureReport {
                feature,
                promises: records
                    .into_iter()
                    .map(|record| PromiseReportItem {
                        evidence: record.observes.clone(),
                        failure_meaning: resolve_localized_text(&record.failure_meaning, language),
                        given: record
                            .given
                            .iter()
                            .map(|item| resolve_localized_text(item, language))
                            .collect(),
                        lifecycle: record.lifecycle.clone(),
                        priority: record.priority.clone(),
                        promise_id: record.id.clone(),
                        purpose: resolve_localized_text(&record.purpose, language),
                        run_status: get_promise_run_status(&record.id, results),
                        then_steps: record
                            .then_steps
                            .iter()
                            .map(|item| resolve_localized_text(item, language))
                            .collect(),
                        title: resolve_localized_text(&record.title, language),
                        warnings: issues
                            .iter()
                            .filter(|issue| {
                                issue.promise_id.as_deref() == Some(record.id.as_str())
                                    && issue.severity == ValidationSeverity::Warning
                            })
                            .cloned()
                            .collect(),
                        when: record
                            .when
                            .iter()
                            .map(|item| resolve_localized_text(item, language))
                            .collect(),
                    })
                    .collect(),
            }
        })
        .collect::<Vec<_>>();

    SeedReport {
        api_version: ProtocolVersion,
        features,
        issues: issues.to_vec(),
        summary: ReportSummary {
            errors: issues
                .iter()
                .filter(|issue| issue.severity == ValidationSeverity::Error)
                .count(),
            promises: records.len(),
            warnings: issues
                .iter()
                .filter(|issue| issue.severity == ValidationSeverity::Warning)
                .count(),
        },
    }
}

pub fn render_seed_report_markdown(report: &SeedReport) -> String {
    let mut lines = vec![
        "Seed Harness Report".to_string(),
        String::new(),
        "Protocol: 1".to_string(),
        format!("Promises: {}", report.summary.promises),
        format!("Errors: {}", report.summary.errors),
        format!("Warnings: {}", report.summary.warnings),
        String::new(),
    ];

    for feature in &report.features {
        lines.push(format!("Feature: {}", feature.feature));
        lines.push(String::new());

        for promise in &feature.promises {
            lines.push(format!("{}  {}", promise.priority, promise.title));
            lines.push(format!("    Promise ID: {}", promise.promise_id));
            lines.push(format!("    Lifecycle: {}", promise.lifecycle));
            lines.push(format!("    Run Status: {}", promise.run_status));
            lines.push(format!("    Purpose: {}", promise.purpose));

            if !promise.warnings.is_empty() {
                lines.push("    Warnings:".to_string());
                for warning in &promise.warnings {
                    lines.push(format!("    - {}", warning.message));
                }
            }

            lines.push("    Given:".to_string());
            for given in &promise.given {
                lines.push(format!("    - {given}"));
            }

            lines.push("    When:".to_string());
            for when in &promise.when {
                lines.push(format!("    - {when}"));
            }

            lines.push("    Then:".to_string());
            for then_step in &promise.then_steps {
                lines.push(format!("    - {then_step}"));
            }

            lines.push("    Evidence:".to_string());
            for evidence in &promise.evidence {
                lines.push(format!("    - {evidence}"));
            }

            lines.push(format!("    Failure meaning: {}", promise.failure_meaning));
            lines.push(String::new());
        }
    }

    let global_issues = report
        .issues
        .iter()
        .filter(|issue| issue.promise_id.is_none())
        .collect::<Vec<_>>();
    if !global_issues.is_empty() {
        lines.push("Global Issues".to_string());
        lines.push(String::new());
        for issue in global_issues {
            lines.push(format!("- [{}] {}", issue.severity, issue.message));
        }
        lines.push(String::new());
    }

    format!("{}\n", lines.join("\n").trim_end())
}

pub fn render_seed_report_summary(report: &SeedReport) -> String {
    let middle_dot = "\u{00b7}";
    let mut lines = vec![
        format!(
            "Seed Harness Report  {middle_dot}  {} promises  {middle_dot}  {} errors  {middle_dot}  {} warnings",
            report.summary.promises, report.summary.errors, report.summary.warnings
        ),
        String::new(),
    ];

    let lifecycle_width = report
        .features
        .iter()
        .flat_map(|feature| feature.promises.iter())
        .map(|promise| promise.lifecycle.to_string().len())
        .max()
        .unwrap_or(0);
    let run_status_width = report
        .features
        .iter()
        .flat_map(|feature| feature.promises.iter())
        .map(|promise| promise.run_status.to_string().len())
        .max()
        .unwrap_or(0);

    for feature in &report.features {
        lines.push(feature.feature.clone());
        for promise in &feature.promises {
            lines.push(format!(
                "  {}  {:<lifecycle_width$}  {:<run_status_width$}  {}",
                promise.priority, promise.lifecycle, promise.run_status, promise.title
            ));
        }
        lines.push(String::new());
    }

    let global_issues = report
        .issues
        .iter()
        .filter(|issue| issue.promise_id.is_none())
        .collect::<Vec<_>>();
    if !global_issues.is_empty() {
        lines.push("Global Issues".to_string());
        lines.push(String::new());
        for issue in global_issues {
            lines.push(format!("- [{}] {}", issue.severity, issue.message));
        }
        lines.push(String::new());
    }

    format!("{}\n", lines.join("\n").trim_end())
}
