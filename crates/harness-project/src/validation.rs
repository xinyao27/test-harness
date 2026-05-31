use crate::feature_registry::{FeatureRecord, MODULE_TAG_PREFIX, PACKAGE_TAG_PREFIX};
use crate::localized_text::{
    has_default_language_text, is_blank, is_localized_text_blank, resolve_localized_text,
};
use harness_protocol::{
    BehaviorFile, BehaviorLifecycle, LocalesFile, ModuleRecord, PackageRecord, ResultsFile,
    ReviewLogFile, ReviewState, ValidationIssue, ValidationSeverity, ValidationSubject,
    ValidationSubjectKind,
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
    subject: Option<ValidationSubject>,
    path: Option<String>,
) -> ValidationIssue {
    ValidationIssue {
        code: code.into(),
        message: message.into(),
        severity,
        path,
        subject,
    }
}

fn subject(kind: ValidationSubjectKind, id: impl Into<String>) -> ValidationSubject {
    ValidationSubject {
        kind,
        id: id.into(),
    }
}

pub fn validate_package_records(
    packages: &[PackageRecord],
    modules: &[ModuleRecord],
) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    let mut seen = HashSet::new();
    let module_by_id = modules
        .iter()
        .map(|module| (module.id.as_str(), module))
        .collect::<HashMap<_, _>>();

    for package in packages {
        if !seen.insert(package.id.clone()) {
            issues.push(issue(
                ValidationSeverity::Error,
                "duplicate_package_id",
                format!("Duplicate package id \"{}\".", package.id),
                Some(subject(ValidationSubjectKind::Package, package.id.clone())),
                None,
            ));
        }
        validate_id_field(
            &mut issues,
            ValidationSubjectKind::Package,
            &package.id,
            "package id",
        );
        validate_localized_field(
            &mut issues,
            ValidationSubjectKind::Package,
            &package.id,
            "title",
            &package.title,
        );
        validate_localized_field(
            &mut issues,
            ValidationSubjectKind::Package,
            &package.id,
            "purpose",
            &package.purpose,
        );
        if is_blank(&package.path) {
            issues.push(issue(
                ValidationSeverity::Error,
                "blank_required_field",
                format!("Package \"{}\" has a blank path.", package.id),
                Some(subject(ValidationSubjectKind::Package, package.id.clone())),
                None,
            ));
        }
        if package.modules.is_empty() {
            issues.push(issue(
                ValidationSeverity::Error,
                "package_without_modules",
                format!("Package \"{}\" must list at least one module.", package.id),
                Some(subject(ValidationSubjectKind::Package, package.id.clone())),
                None,
            ));
        }
        for module_id in &package.modules {
            match module_by_id.get(module_id.as_str()) {
                Some(module) if module.package != package.id => issues.push(issue(
                    ValidationSeverity::Error,
                    "package_module_mismatch",
                    format!(
                        "Package \"{}\" lists module \"{}\", but that module belongs to package \"{}\".",
                        package.id, module.id, module.package
                    ),
                    Some(subject(ValidationSubjectKind::Module, module.id.clone())),
                    None,
                )),
                Some(_) => {}
                None => issues.push(issue(
                    ValidationSeverity::Error,
                    "unknown_package_module",
                    format!(
                        "Package \"{}\" lists unknown module \"{}\".",
                        package.id, module_id
                    ),
                    Some(subject(ValidationSubjectKind::Package, package.id.clone())),
                    None,
                )),
            }
        }
    }

    let package_ids = packages
        .iter()
        .map(|package| package.id.as_str())
        .collect::<HashSet<_>>();
    for module in modules {
        if !package_ids.contains(module.package.as_str()) {
            issues.push(issue(
                ValidationSeverity::Error,
                "module_unknown_package",
                format!(
                    "Module \"{}\" references unknown package \"{}\".",
                    module.id, module.package
                ),
                Some(subject(ValidationSubjectKind::Module, module.id.clone())),
                None,
            ));
        }
        if let Some(package) = packages.iter().find(|package| package.id == module.package) {
            if !package
                .modules
                .iter()
                .any(|module_id| module_id == &module.id)
            {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "module_missing_from_package",
                    format!(
                        "Module \"{}\" belongs to package \"{}\" but is not listed by that package.",
                        module.id, package.id
                    ),
                    Some(subject(ValidationSubjectKind::Module, module.id.clone())),
                    None,
                ));
            }
        }
    }

    issues
}

pub fn validate_module_records(modules: &[ModuleRecord]) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    let mut seen = HashSet::new();

    for module in modules {
        if !seen.insert(module.id.clone()) {
            issues.push(issue(
                ValidationSeverity::Error,
                "duplicate_module_id",
                format!("Duplicate module id \"{}\".", module.id),
                Some(subject(ValidationSubjectKind::Module, module.id.clone())),
                None,
            ));
        }
        validate_id_field(
            &mut issues,
            ValidationSubjectKind::Module,
            &module.id,
            "module id",
        );
        validate_id_field(
            &mut issues,
            ValidationSubjectKind::Package,
            &module.package,
            "module package",
        );
        validate_localized_field(
            &mut issues,
            ValidationSubjectKind::Module,
            &module.id,
            "title",
            &module.title,
        );
        validate_localized_field(
            &mut issues,
            ValidationSubjectKind::Module,
            &module.id,
            "purpose",
            &module.purpose,
        );
        if module.covers.is_empty() {
            issues.push(issue(
                ValidationSeverity::Error,
                "module_without_covers",
                format!("Module \"{}\" must cover at least one path.", module.id),
                Some(subject(ValidationSubjectKind::Module, module.id.clone())),
                None,
            ));
        }
        for (index, cover) in module.covers.iter().enumerate() {
            if is_blank(cover) {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "blank_module_cover",
                    format!("Module \"{}\" has a blank covers[{index}] item.", module.id),
                    Some(subject(ValidationSubjectKind::Module, module.id.clone())),
                    None,
                ));
            }
        }
        if is_vague_module_name(&module.id)
            || is_vague_module_name(&resolve_localized_text(&module.title, None))
        {
            issues.push(issue(
                ValidationSeverity::Warning,
                "vague_architecture_module",
                format!(
                    "Module \"{}\" should name a concrete architecture boundary, not a generic bucket.",
                    module.id
                ),
                Some(subject(ValidationSubjectKind::Module, module.id.clone())),
                None,
            ));
        }
    }

    issues
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
                ValidationSeverity::Warning,
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

pub fn validate_feature_manifest_links(
    features: &[FeatureRecord],
    packages: &[PackageRecord],
    modules: &[ModuleRecord],
    locales: &LocalesFile,
) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    let package_ids = packages
        .iter()
        .map(|package| package.id.as_str())
        .collect::<HashSet<_>>();
    let modules_by_id = modules
        .iter()
        .map(|module| (module.id.as_str(), module))
        .collect::<HashMap<_, _>>();

    for feature in features {
        if let Some(package_id) = &feature.package_id {
            if !package_ids.contains(package_id.as_str()) {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "feature_unknown_package",
                    format!(
                        "Feature file {} uses unknown {PACKAGE_TAG_PREFIX}{package_id}.",
                        feature.path
                    ),
                    Some(subject(
                        ValidationSubjectKind::Feature,
                        feature_identifier(feature),
                    )),
                    Some(feature.path.clone()),
                ));
            }
        }
        if let Some(module_id) = &feature.module_id {
            match modules_by_id.get(module_id.as_str()) {
                Some(module) if feature.package_id.as_deref() != Some(module.package.as_str()) => {
                    issues.push(issue(
                        ValidationSeverity::Error,
                        "feature_module_package_mismatch",
                        format!(
                            "Feature file {} uses {MODULE_TAG_PREFIX}{module_id}, but that module belongs to package \"{}\".",
                            feature.path, module.package
                        ),
                        Some(subject(ValidationSubjectKind::Module, module_id.clone())),
                        Some(feature.path.clone()),
                    ));
                }
                Some(_) => {}
                None => issues.push(issue(
                    ValidationSeverity::Error,
                    "feature_unknown_module",
                    format!(
                        "Feature file {} uses unknown {MODULE_TAG_PREFIX}{module_id}.",
                        feature.path
                    ),
                    Some(subject(
                        ValidationSubjectKind::Feature,
                        feature_identifier(feature),
                    )),
                    Some(feature.path.clone()),
                )),
            }
        }
    }

    let required = locales
        .required_locales
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let mut locales_by_feature = HashMap::<&str, HashSet<&str>>::new();
    for feature in features {
        if let (Some(feature_id), Some(locale_id)) = (&feature.feature_id, &feature.locale_id) {
            locales_by_feature
                .entry(feature_id.as_str())
                .or_default()
                .insert(locale_id.as_str());
        }
    }
    for (feature_id, seen_locales) in locales_by_feature {
        for required_locale in &required {
            if !seen_locales.contains(required_locale) {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "missing_required_feature_locale",
                    format!(
                        "Feature \"@feature:{feature_id}\" is missing required locale \"@locale:{required_locale}\"."
                    ),
                    Some(subject(ValidationSubjectKind::Feature, feature_id.to_string())),
                    None,
                ));
            }
        }
    }

    issues
}

pub fn validate_behavior_records(
    behavior: &BehaviorFile,
    features: &[FeatureRecord],
) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    let known_rules = feature_rule_ids(features);
    let mut seen = HashSet::new();

    for record in &behavior.rules {
        let identity = (record.feature.clone(), record.rule.clone());
        if !seen.insert(identity.clone()) {
            issues.push(issue(
                ValidationSeverity::Error,
                "duplicate_behavior_rule",
                format!(
                    "Behavior lifecycle contains duplicate rule \"{}\" under \"{}\".",
                    record.rule, record.feature
                ),
                Some(subject(ValidationSubjectKind::Rule, record.rule.clone())),
                None,
            ));
        }
        if !known_rules.contains(&identity) {
            issues.push(issue(
                ValidationSeverity::Error,
                "behavior_unknown_rule",
                format!(
                    "Behavior lifecycle references \"{}\" under \"{}\", but no matching feature Rule exists.",
                    record.rule, record.feature
                ),
                Some(subject(ValidationSubjectKind::Rule, record.rule.clone())),
                None,
            ));
        }
        if matches!(record.lifecycle, BehaviorLifecycle::Accepted)
            && record.review.state != ReviewState::Approved
        {
            issues.push(issue(
                ValidationSeverity::Warning,
                "accepted_rule_without_approved_review",
                format!(
                    "Accepted Rule \"{}\" should have review.state approved.",
                    record.rule
                ),
                Some(subject(ValidationSubjectKind::Rule, record.rule.clone())),
                None,
            ));
        }
    }

    for (feature_id, rule_id) in known_rules {
        if !seen.contains(&(feature_id.clone(), rule_id.clone())) {
            issues.push(issue(
                ValidationSeverity::Error,
                "rule_missing_lifecycle",
                format!(
                    "Rule \"{rule_id}\" under \"{feature_id}\" is missing from tests/harness.behavior.yaml."
                ),
                Some(subject(ValidationSubjectKind::Rule, rule_id)),
                None,
            ));
        }
    }

    issues
}

pub fn validate_review_log_records(
    review_log: &ReviewLogFile,
    behavior: &BehaviorFile,
) -> Vec<ValidationIssue> {
    let known_rules = behavior
        .rules
        .iter()
        .map(|record| record.rule.as_str())
        .collect::<HashSet<_>>();
    let mut issues = Vec::new();
    for event in &review_log.events {
        for rule in &event.affected_rules {
            if !known_rules.contains(rule.as_str()) {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "review_log_unknown_rule",
                    format!(
                        "Review log event \"{}\" references unknown Rule \"{}\".",
                        event.id, rule
                    ),
                    Some(subject(ValidationSubjectKind::Rule, rule.clone())),
                    None,
                ));
            }
        }
    }
    issues
}

pub fn validate_results_file_bindings(
    results: Option<&ResultsFile>,
    features: &[FeatureRecord],
) -> Vec<ValidationIssue> {
    let Some(results) = results else {
        return Vec::new();
    };
    let known_examples = feature_example_ids(features);
    results
        .results
        .iter()
        .filter(|result| {
            !known_examples.contains(&(
                result.feature.clone(),
                result.rule.clone(),
                result.example.clone(),
            ))
        })
        .map(|result| {
            issue(
                ValidationSeverity::Error,
                "unknown_example_result_binding",
                format!(
                    "Result binding \"{} / {} / {}\" does not match any known Cucumber Example.",
                    result.feature, result.rule, result.example
                ),
                Some(subject(
                    ValidationSubjectKind::Example,
                    result.example.clone(),
                )),
                Some(result.file.clone()),
            )
        })
        .collect()
}

fn validate_id_field(
    issues: &mut Vec<ValidationIssue>,
    kind: ValidationSubjectKind,
    id: &str,
    field: &str,
) {
    if !ID_PATTERN.is_match(id) {
        issues.push(issue(
            ValidationSeverity::Error,
            format!("invalid_{}", field.replace(' ', "_")),
            format!(
                "{field} \"{id}\" must be stable, lowercase, and dot/underscore/hyphen separated."
            ),
            Some(subject(kind, id.to_string())),
            None,
        ));
    }
}

fn validate_localized_field(
    issues: &mut Vec<ValidationIssue>,
    kind: ValidationSubjectKind,
    id: &str,
    field: &str,
    value: &harness_protocol::LocalizedText,
) {
    if is_localized_text_blank(value) {
        issues.push(issue(
            ValidationSeverity::Error,
            "blank_required_field",
            format!("{kind:?} \"{id}\" has a blank {field}."),
            Some(subject(kind.clone(), id.to_string())),
            None,
        ));
    }
    if !has_default_language_text(value) {
        issues.push(issue(
            ValidationSeverity::Warning,
            "missing_default_language",
            format!("{kind:?} \"{id}\" should include non-blank en text for {field}."),
            Some(subject(kind, id.to_string())),
            None,
        ));
    }
}

fn is_vague_module_name(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "common" | "general" | "helpers" | "misc" | "miscellaneous" | "stuff" | "utils"
    )
}

fn matches_cover_glob(file_path: &str, pattern: &str) -> bool {
    if let Some(prefix) = pattern.strip_suffix("/**") {
        file_path == prefix || file_path.starts_with(&format!("{prefix}/"))
    } else {
        file_path == pattern || file_path.starts_with(&format!("{pattern}/"))
    }
}

fn feature_rule_ids(features: &[FeatureRecord]) -> HashSet<(String, String)> {
    let mut ids = HashSet::new();
    for feature in features {
        let Some(feature_id) = &feature.feature_id else {
            continue;
        };
        for rule in &feature.rules {
            if let Some(rule_id) = &rule.rule_id {
                ids.insert((tag("@feature:", feature_id), tag("@rule:", rule_id)));
            }
        }
    }
    ids
}

fn feature_example_ids(features: &[FeatureRecord]) -> HashSet<(String, String, String)> {
    let mut ids = HashSet::new();
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
                    ids.insert((
                        tag("@feature:", feature_id),
                        tag("@rule:", rule_id),
                        tag("@example:", example_id),
                    ));
                }
            }
        }
    }
    ids
}

fn feature_identifier(feature: &FeatureRecord) -> String {
    feature
        .feature_id
        .as_ref()
        .map(|id| tag("@feature:", id))
        .unwrap_or_else(|| feature.path.clone())
}

fn tag(prefix: &str, id: &str) -> String {
    format!("{prefix}{id}")
}
