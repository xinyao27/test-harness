use crate::errors::{FeatureLoadError, HarnessError};
use crate::fs_utils::collect_files;
use gherkin::{Feature, GherkinEnv, ParseFileError, Scenario, StepType};
use harness_protocol::{ValidationIssue, ValidationSeverity};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

pub const FEATURES_DIRECTORY: &str = "features";
pub const FEATURE_FILE_SUFFIX: &str = ".feature";
pub const PACKAGE_TAG_PREFIX: &str = "@package:";
pub const MODULE_TAG_PREFIX: &str = "@module:";
pub const FEATURE_TAG_PREFIX: &str = "@feature:";
pub const RULE_TAG_PREFIX: &str = "@rule:";
pub const EXAMPLE_TAG_PREFIX: &str = "@example:";
pub const LOCALE_TAG_PREFIX: &str = "@locale:";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FeatureRecord {
    pub path: String,
    pub name: String,
    pub line: usize,
    pub tags: Vec<String>,
    pub package_id: Option<String>,
    pub module_id: Option<String>,
    pub feature_id: Option<String>,
    pub locale_id: Option<String>,
    pub rules: Vec<RuleRecord>,
    pub top_level_examples: Vec<ExampleRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuleRecord {
    pub name: String,
    pub line: usize,
    pub tags: Vec<String>,
    pub rule_id: Option<String>,
    pub examples: Vec<ExampleRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExampleRecord {
    pub keyword: String,
    pub name: String,
    pub line: usize,
    pub tags: Vec<String>,
    pub example_id: Option<String>,
    pub has_given: bool,
    pub has_when: bool,
    pub has_then: bool,
    pub step_shape: Vec<StepType>,
}

pub fn find_feature_files(root_dir: impl AsRef<Path>) -> Result<Vec<PathBuf>, HarnessError> {
    let directory = root_dir.as_ref().join(FEATURES_DIRECTORY);
    collect_files(&directory, FEATURE_FILE_SUFFIX).map_err(|cause| {
        HarnessError::SourceFileScanError {
            path: directory,
            cause,
        }
    })
}

pub fn load_feature_records(
    root_dir: impl AsRef<Path>,
) -> Result<Vec<FeatureRecord>, HarnessError> {
    let root_dir = root_dir.as_ref();
    let mut records = Vec::new();
    let mut errors = Vec::new();

    for path in find_feature_files(root_dir)? {
        match load_feature_record(root_dir, &path) {
            Ok(record) => records.push(record),
            Err(error) => errors.push(error),
        }
    }

    if errors.is_empty() {
        Ok(records)
    } else {
        Err(HarnessError::FeatureRecordLoadErrors { errors })
    }
}

pub fn validate_feature_records(records: &[FeatureRecord]) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    let mut feature_locale_ids = HashMap::<(String, String), String>::new();
    let mut rule_feature_ids = HashMap::<String, String>::new();
    let mut rule_locale_ids = HashMap::<(String, String, String), String>::new();
    let mut example_locale_ids = HashMap::<(String, String, String, String), String>::new();

    for record in records {
        for (field, value) in [
            ("package", &record.package_id),
            ("module", &record.module_id),
            ("feature", &record.feature_id),
            ("locale", &record.locale_id),
        ] {
            if value.is_none() {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "missing_feature_hierarchy_tag",
                    format!(
                        "Feature \"{}\" must declare an @{field}:... tag at the Feature level.",
                        record.name
                    ),
                    Some(record.path.clone()),
                ));
            }
        }

        if let (Some(feature_id), Some(locale_id)) = (&record.feature_id, &record.locale_id) {
            let key = (feature_id.clone(), locale_id.clone());
            if let Some(previous_path) = feature_locale_ids.insert(key, record.path.clone()) {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "duplicate_localized_feature",
                    format!(
                        "Feature tag \"@feature:{feature_id}\" with locale \"@locale:{locale_id}\" is used by both {previous_path} and {}.",
                        record.path
                    ),
                    Some(record.path.clone()),
                ));
            }
        }

        if record.rules.is_empty() {
            issues.push(issue(
                ValidationSeverity::Error,
                "feature_without_rule",
                format!(
                    "Feature \"{}\" must group behavior under at least one Rule.",
                    record.name
                ),
                Some(record.path.clone()),
            ));
        }

        for example in &record.top_level_examples {
            issues.push(issue(
                ValidationSeverity::Error,
                "example_without_rule",
                format!(
                    "Example \"{}\" at line {} must live under a Rule.",
                    example.name, example.line
                ),
                Some(record.path.clone()),
            ));
        }

        for rule in &record.rules {
            if rule.rule_id.is_none() {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "missing_rule_tag",
                    format!(
                        "Rule \"{}\" at line {} must declare an @rule:... tag.",
                        rule.name, rule.line
                    ),
                    Some(record.path.clone()),
                ));
            }

            if let Some(rule_id) = &rule.rule_id {
                if let Some(feature_id) = &record.feature_id {
                    if let Some(previous_feature_id) =
                        rule_feature_ids.insert(rule_id.clone(), feature_id.clone())
                    {
                        if previous_feature_id != *feature_id {
                            issues.push(issue(
                                ValidationSeverity::Error,
                                "rule_tag_reused_across_features",
                                format!(
                                    "Rule tag \"@rule:{rule_id}\" is used by both @feature:{previous_feature_id} and @feature:{feature_id}."
                                ),
                                Some(record.path.clone()),
                            ));
                        }
                    }
                }

                if let (Some(feature_id), Some(locale_id)) = (&record.feature_id, &record.locale_id)
                {
                    let key = (feature_id.clone(), rule_id.clone(), locale_id.clone());
                    if let Some(previous_path) =
                        rule_locale_ids.insert(key, format!("{}:{}", record.path, rule.line))
                    {
                        issues.push(issue(
                            ValidationSeverity::Error,
                            "duplicate_localized_rule",
                            format!(
                                "Rule tag \"@rule:{rule_id}\" under \"@feature:{feature_id}\" with locale \"@locale:{locale_id}\" is used by both {previous_path} and {}:{}.",
                                record.path, rule.line
                            ),
                            Some(record.path.clone()),
                        ));
                    }
                }
            }

            for example in &rule.examples {
                if example.example_id.is_none() {
                    issues.push(issue(
                        ValidationSeverity::Error,
                        "missing_example_tag",
                        format!(
                            "Example \"{}\" at line {} must declare an @example:... tag.",
                            example.name, example.line
                        ),
                        Some(record.path.clone()),
                    ));
                }

                if let (Some(feature_id), Some(rule_id), Some(example_id), Some(locale_id)) = (
                    &record.feature_id,
                    &rule.rule_id,
                    &example.example_id,
                    &record.locale_id,
                ) {
                    let key = (
                        feature_id.clone(),
                        rule_id.clone(),
                        example_id.clone(),
                        locale_id.clone(),
                    );
                    if let Some(previous_path) =
                        example_locale_ids.insert(key, format!("{}:{}", record.path, example.line))
                    {
                        issues.push(issue(
                            ValidationSeverity::Error,
                            "duplicate_localized_example",
                            format!(
                                "Example tag \"@example:{example_id}\" under \"@rule:{rule_id}\" with locale \"@locale:{locale_id}\" is used by both {previous_path} and {}:{}.",
                                record.path, example.line
                            ),
                            Some(record.path.clone()),
                        ));
                    }
                }
            }

            if rule.examples.is_empty() {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "rule_without_example",
                    format!(
                        "Rule \"{}\" at line {} must contain at least one Example.",
                        rule.name, rule.line
                    ),
                    Some(record.path.clone()),
                ));
            }

            for example in &rule.examples {
                if !example.has_given || !example.has_when || !example.has_then {
                    issues.push(issue(
                        ValidationSeverity::Error,
                        "incomplete_bdd_example",
                        format!(
                            "Example \"{}\" at line {} must include Given, When, and Then steps.",
                            example.name, example.line
                        ),
                        Some(record.path.clone()),
                    ));
                }
            }
        }
    }

    issues.extend(validate_localized_feature_parity(records));

    issues
}

fn validate_localized_feature_parity(records: &[FeatureRecord]) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    let mut grouped = HashMap::<String, Vec<&FeatureRecord>>::new();

    for record in records {
        if let Some(feature_id) = &record.feature_id {
            grouped.entry(feature_id.clone()).or_default().push(record);
        }
    }

    for (feature_id, mut localized_records) in grouped {
        if localized_records.len() < 2 {
            continue;
        }

        localized_records.sort_by(|left, right| {
            left.locale_id
                .cmp(&right.locale_id)
                .then_with(|| left.path.cmp(&right.path))
        });
        let reference = localized_records[0];

        for candidate in localized_records.iter().skip(1) {
            if reference.package_id != candidate.package_id
                || reference.module_id != candidate.module_id
            {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "localized_feature_hierarchy_mismatch",
                    format!(
                        "Localized feature \"@feature:{feature_id}\" must keep the same package and module tags across locales."
                    ),
                    Some(candidate.path.clone()),
                ));
            }

            let reference_rules = rule_shape(reference);
            let candidate_rules = rule_shape(candidate);

            if reference_rules.keys().collect::<HashSet<_>>()
                != candidate_rules.keys().collect::<HashSet<_>>()
            {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "localized_rule_set_mismatch",
                    format!(
                        "Localized feature \"@feature:{feature_id}\" must keep the same @rule tags across locales."
                    ),
                    Some(candidate.path.clone()),
                ));
                continue;
            }

            for (rule_id, reference_examples) in &reference_rules {
                let Some(candidate_examples) = candidate_rules.get(rule_id) else {
                    continue;
                };

                if reference_examples.keys().collect::<HashSet<_>>()
                    != candidate_examples.keys().collect::<HashSet<_>>()
                {
                    issues.push(issue(
                        ValidationSeverity::Error,
                        "localized_example_set_mismatch",
                        format!(
                            "Localized rule \"@rule:{rule_id}\" must keep the same @example tags across locales."
                        ),
                        Some(candidate.path.clone()),
                    ));
                    continue;
                }

                for (example_id, reference_step_shape) in reference_examples {
                    let Some(candidate_step_shape) = candidate_examples.get(example_id) else {
                        continue;
                    };
                    if reference_step_shape != candidate_step_shape {
                        issues.push(issue(
                            ValidationSeverity::Error,
                            "localized_step_shape_mismatch",
                            format!(
                                "Localized example \"@example:{example_id}\" under \"@rule:{rule_id}\" must keep the same Given/When/Then step shape across locales."
                            ),
                            Some(candidate.path.clone()),
                        ));
                    }
                }
            }
        }
    }

    issues
}

fn rule_shape(record: &FeatureRecord) -> HashMap<String, HashMap<String, Vec<StepType>>> {
    let mut rules = HashMap::new();
    for rule in &record.rules {
        let Some(rule_id) = &rule.rule_id else {
            continue;
        };
        let mut examples = HashMap::new();
        for example in &rule.examples {
            if let Some(example_id) = &example.example_id {
                examples.insert(example_id.clone(), example.step_shape.clone());
            }
        }
        rules.insert(rule_id.clone(), examples);
    }
    rules
}

fn load_feature_record(root_dir: &Path, path: &Path) -> Result<FeatureRecord, FeatureLoadError> {
    let feature = Feature::parse_path(path, GherkinEnv::default()).map_err(map_parse_file_error)?;
    Ok(to_feature_record(root_dir, path, feature))
}

fn map_parse_file_error(error: ParseFileError) -> FeatureLoadError {
    match error {
        ParseFileError::Reading { path, source } => FeatureLoadError::FeatureFileReadError {
            path,
            cause: source.to_string(),
        },
        ParseFileError::Parsing {
            path,
            error,
            source,
        } => {
            let mut cause = source.to_string();
            if let Some(error) = error {
                cause = format!("{cause}; {error}");
            }
            FeatureLoadError::FeatureFileParseError { path, cause }
        }
    }
}

fn to_feature_record(root_dir: &Path, path: &Path, feature: Feature) -> FeatureRecord {
    FeatureRecord {
        path: normalize_path(root_dir, path),
        name: feature.name,
        line: feature.position.line,
        package_id: tag_value(&feature.tags, PACKAGE_TAG_PREFIX),
        module_id: tag_value(&feature.tags, MODULE_TAG_PREFIX),
        feature_id: tag_value(&feature.tags, FEATURE_TAG_PREFIX),
        locale_id: tag_value(&feature.tags, LOCALE_TAG_PREFIX),
        top_level_examples: feature.scenarios.iter().map(to_example_record).collect(),
        rules: feature
            .rules
            .iter()
            .map(|rule| RuleRecord {
                name: rule.name.clone(),
                line: rule.position.line,
                rule_id: tag_value(&rule.tags, RULE_TAG_PREFIX),
                tags: rule.tags.clone(),
                examples: rule.scenarios.iter().map(to_example_record).collect(),
            })
            .collect(),
        tags: feature.tags,
    }
}

fn to_example_record(scenario: &Scenario) -> ExampleRecord {
    let step_types = scenario
        .steps
        .iter()
        .map(|step| step.ty)
        .collect::<HashSet<_>>();

    ExampleRecord {
        keyword: scenario.keyword.clone(),
        name: scenario.name.clone(),
        line: scenario.position.line,
        tags: scenario.tags.clone(),
        example_id: tag_value(&scenario.tags, EXAMPLE_TAG_PREFIX),
        has_given: step_types.contains(&StepType::Given),
        has_when: step_types.contains(&StepType::When),
        has_then: step_types.contains(&StepType::Then),
        step_shape: scenario.steps.iter().map(|step| step.ty).collect(),
    }
}

fn tag_value(tags: &[String], prefix: &str) -> Option<String> {
    let bare_prefix = prefix.strip_prefix('@').unwrap_or(prefix);
    tags.iter()
        .find_map(|tag| {
            tag.strip_prefix(prefix)
                .or_else(|| tag.strip_prefix(bare_prefix))
        })
        .map(str::to_string)
}

fn normalize_path(root_dir: &Path, path: &Path) -> String {
    path.strip_prefix(root_dir)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn issue(
    severity: ValidationSeverity,
    code: impl Into<String>,
    message: impl Into<String>,
    path: Option<String>,
) -> ValidationIssue {
    ValidationIssue {
        code: code.into(),
        message: message.into(),
        severity,
        path,
        subject: None,
    }
}
