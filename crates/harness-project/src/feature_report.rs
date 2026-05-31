use crate::feature_registry::FeatureRecord;
use harness_protocol::{ValidationIssue, ValidationSeverity};
use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FeatureHarnessReport {
    pub features: Vec<FeatureRecord>,
    pub issues: Vec<ValidationIssue>,
    pub summary: FeatureHarnessReportSummary,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FeatureHarnessReportSummary {
    pub errors: usize,
    pub examples: usize,
    pub features: usize,
    pub rules: usize,
    pub warnings: usize,
}

pub fn generate_feature_report(
    features: &[FeatureRecord],
    issues: &[ValidationIssue],
) -> FeatureHarnessReport {
    let mut features = features.to_vec();
    features.sort_by(|left, right| {
        left.package_id
            .cmp(&right.package_id)
            .then_with(|| left.module_id.cmp(&right.module_id))
            .then_with(|| left.feature_id.cmp(&right.feature_id))
            .then_with(|| left.path.cmp(&right.path))
    });

    FeatureHarnessReport {
        summary: FeatureHarnessReportSummary {
            errors: issues
                .iter()
                .filter(|issue| issue.severity == ValidationSeverity::Error)
                .count(),
            examples: unique_example_count(&features),
            features: unique_feature_count(&features),
            rules: unique_rule_count(&features),
            warnings: issues
                .iter()
                .filter(|issue| issue.severity == ValidationSeverity::Warning)
                .count(),
        },
        features,
        issues: issues.to_vec(),
    }
}

pub fn render_feature_report_markdown(report: &FeatureHarnessReport) -> String {
    let mut lines = vec![
        "Seed Harness Report".to_string(),
        String::new(),
        "Protocol: 1".to_string(),
        format!("Features: {}", report.summary.features),
        format!("Rules: {}", report.summary.rules),
        format!("Examples: {}", report.summary.examples),
        format!("Errors: {}", report.summary.errors),
        format!("Warnings: {}", report.summary.warnings),
        String::new(),
    ];

    for feature in &report.features {
        lines.push(format!("Feature: {}", feature.name));
        lines.push(format!("    File: {}", feature.path));
        if let Some(package_id) = &feature.package_id {
            lines.push(format!("    Package: {package_id}"));
        }
        if let Some(module_id) = &feature.module_id {
            lines.push(format!("    Module: {module_id}"));
        }
        if let Some(feature_id) = &feature.feature_id {
            lines.push(format!("    Feature Tag: @feature:{feature_id}"));
        }
        if let Some(locale_id) = &feature.locale_id {
            lines.push(format!("    Locale: {locale_id}"));
        }
        lines.push(String::new());

        for rule in &feature.rules {
            lines.push(format!("    Rule: {}", rule.name));
            if let Some(rule_id) = &rule.rule_id {
                lines.push(format!("        Rule Tag: @rule:{rule_id}"));
            }
            for example in &rule.examples {
                lines.push(format!("        Example: {}", example.name));
                if let Some(example_id) = &example.example_id {
                    lines.push(format!("            Example Tag: @example:{example_id}"));
                }
            }
            lines.push(String::new());
        }

        for example in &feature.top_level_examples {
            lines.push(format!("    Top-level Example: {}", example.name));
        }
    }

    if !report.issues.is_empty() {
        lines.push("Issues".to_string());
        lines.push(String::new());
        for issue in &report.issues {
            let path = issue
                .path
                .as_ref()
                .map(|path| format!(" ({path})"))
                .unwrap_or_default();
            lines.push(format!(
                "- [{}] {}{}: {}",
                issue.severity, issue.code, path, issue.message
            ));
        }
        lines.push(String::new());
    }

    format!("{}\n", lines.join("\n").trim_end())
}

pub fn render_feature_report_summary(report: &FeatureHarnessReport) -> String {
    let middle_dot = "\u{00b7}";
    let mut lines = vec![format!(
        "Seed Harness Report  {middle_dot}  {} features  {middle_dot}  {} rules  {middle_dot}  {} examples  {middle_dot}  {} errors  {middle_dot}  {} warnings",
        report.summary.features,
        report.summary.rules,
        report.summary.examples,
        report.summary.errors,
        report.summary.warnings
    )];

    for feature in &report.features {
        let feature_id = feature
            .feature_id
            .as_deref()
            .unwrap_or("missing-feature-tag");
        lines.push(format!("  @feature:{feature_id}  {}", feature.name));
        if let Some(locale_id) = &feature.locale_id {
            lines.push(format!("    @locale:{locale_id}"));
        }
        for rule in &feature.rules {
            let rule_id = rule.rule_id.as_deref().unwrap_or("missing-rule-tag");
            lines.push(format!("    @rule:{rule_id}  {}", rule.name));
            for example in &rule.examples {
                let example_id = example
                    .example_id
                    .as_deref()
                    .unwrap_or("missing-example-tag");
                lines.push(format!("      @example:{example_id}  {}", example.name));
            }
        }
    }

    if !report.issues.is_empty() {
        lines.push(String::new());
        lines.push("Issues".to_string());
        for issue in &report.issues {
            lines.push(format!("- [{}] {}", issue.severity, issue.message));
        }
    }

    format!("{}\n", lines.join("\n").trim_end())
}

fn unique_feature_count(features: &[FeatureRecord]) -> usize {
    features
        .iter()
        .map(|feature| {
            feature
                .feature_id
                .clone()
                .unwrap_or_else(|| feature.path.clone())
        })
        .collect::<HashSet<_>>()
        .len()
}

fn unique_rule_count(features: &[FeatureRecord]) -> usize {
    let mut ids = HashSet::new();
    for feature in features {
        let feature_id = feature
            .feature_id
            .clone()
            .unwrap_or_else(|| feature.path.clone());
        for rule in &feature.rules {
            let rule_id = rule
                .rule_id
                .clone()
                .unwrap_or_else(|| format!("{}:{}", feature.path, rule.line));
            ids.insert((feature_id.clone(), rule_id));
        }
    }
    ids.len()
}

fn unique_example_count(features: &[FeatureRecord]) -> usize {
    let mut ids = HashSet::new();
    for feature in features {
        let feature_id = feature
            .feature_id
            .clone()
            .unwrap_or_else(|| feature.path.clone());
        for rule in &feature.rules {
            let rule_id = rule
                .rule_id
                .clone()
                .unwrap_or_else(|| format!("{}:{}", feature.path, rule.line));
            for example in &rule.examples {
                let example_id = example
                    .example_id
                    .clone()
                    .unwrap_or_else(|| format!("{}:{}", feature.path, example.line));
                ids.insert((feature_id.clone(), rule_id.clone(), example_id));
            }
        }
    }
    ids.len()
}
