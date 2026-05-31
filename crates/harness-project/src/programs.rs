use crate::config::load_harness_config;
use crate::errors::HarnessError;
use crate::feature_registry::{load_feature_records, validate_feature_records, FeatureRecord};
use crate::feature_report::{generate_feature_report, FeatureHarnessReport};
use crate::module_registry::{
    find_source_files, load_behavior_file, load_locales_file, load_module_records,
    load_package_records, load_review_log_file,
};
use crate::results::load_results_file;
use crate::validation::{
    validate_behavior_records, validate_feature_manifest_links, validate_module_coverage,
    validate_module_records, validate_package_records, validate_results_file_bindings,
    validate_review_log_records,
};
use harness_protocol::{
    BehaviorFile, LocalesFile, ModuleRecord, PackageRecord, ResultsFile, ReviewLogFile,
    ValidationIssue, ValidationSeverity,
};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct SeedCheckResult {
    pub behavior: BehaviorFile,
    pub features: Vec<FeatureRecord>,
    pub issues: Vec<ValidationIssue>,
    pub locales: LocalesFile,
    pub modules: Vec<ModuleRecord>,
    pub packages: Vec<PackageRecord>,
    pub results: Option<ResultsFile>,
    pub review_log: ReviewLogFile,
}

pub type FeatureCheckResult = SeedCheckResult;

pub fn check_feature_harness(
    root_dir: impl AsRef<Path>,
) -> Result<FeatureCheckResult, HarnessError> {
    check_seed_harness(root_dir)
}

pub fn build_feature_report(
    root_dir: impl AsRef<Path>,
) -> Result<FeatureHarnessReport, HarnessError> {
    let check = check_feature_harness(root_dir)?;
    Ok(generate_feature_report(&check.features, &check.issues))
}

pub fn check_seed_harness(root_dir: impl AsRef<Path>) -> Result<SeedCheckResult, HarnessError> {
    let root_dir = root_dir.as_ref();
    load_harness_config(root_dir)?;
    let packages = load_package_records(root_dir)?;
    let modules = load_module_records(root_dir)?;
    let locales = load_locales_file(root_dir)?;
    let behavior = load_behavior_file(root_dir)?;
    let review_log = load_review_log_file(root_dir)?;
    let features = load_feature_records(root_dir)?;
    let source_files = find_source_files(root_dir)?;
    let results = load_results_file(root_dir)?;

    let mut issues = Vec::new();
    issues.extend(validate_package_records(&packages, &modules));
    issues.extend(validate_module_records(&modules));
    issues.extend(validate_module_coverage(&modules, &source_files));
    issues.extend(validate_feature_records(&features));
    issues.extend(validate_feature_manifest_links(
        &features, &packages, &modules, &locales,
    ));
    issues.extend(validate_behavior_records(&behavior, &features));
    issues.extend(validate_review_log_records(&review_log, &behavior));
    issues.extend(validate_results_file_bindings(results.as_ref(), &features));
    if features.is_empty() {
        issues.push(ValidationIssue {
            code: "missing_feature_files".to_string(),
            message: "The Harness must contain at least one features/**/*.feature file."
                .to_string(),
            path: Some("features".to_string()),
            subject: None,
            severity: ValidationSeverity::Error,
        });
    }

    Ok(SeedCheckResult {
        behavior,
        features,
        issues,
        locales,
        modules,
        packages,
        results,
        review_log,
    })
}
