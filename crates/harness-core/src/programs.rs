use crate::config::load_harness_config;
use crate::errors::HarnessError;
use crate::module_registry::{find_source_files, load_module_records};
use crate::promise_registry::load_promise_records;
use crate::report::generate_seed_report;
use crate::results::load_test_results;
use crate::validation::{
    validate_module_coverage, validate_promise_records, validate_test_results,
};
use harness_protocol::{ModuleRecord, PromiseRecord, SeedReport, TestResult, ValidationIssue};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct SeedCheckResult {
    pub issues: Vec<ValidationIssue>,
    pub modules: Vec<ModuleRecord>,
    pub records: Vec<PromiseRecord>,
}

pub fn check_seed_harness(root_dir: impl AsRef<Path>) -> Result<SeedCheckResult, HarnessError> {
    let root_dir = root_dir.as_ref();
    load_harness_config(root_dir)?;
    let records = load_promise_records(root_dir)?;
    let modules = load_module_records(root_dir)?;
    let source_files = find_source_files(root_dir)?;
    let mut issues = validate_promise_records(&records);
    issues.extend(validate_module_coverage(&modules, &source_files));
    Ok(SeedCheckResult {
        issues,
        modules,
        records,
    })
}

#[derive(Debug, Clone, Default)]
pub struct SeedReportOptions {
    pub language: Option<String>,
    pub results: Option<Vec<TestResult>>,
}

pub fn build_seed_report(
    root_dir: impl AsRef<Path>,
    options: SeedReportOptions,
) -> Result<SeedReport, HarnessError> {
    let root_dir = root_dir.as_ref();
    let check = check_seed_harness(root_dir)?;
    let results = match options.results {
        Some(results) => results,
        None => load_test_results(root_dir)?,
    };
    let mut issues = check.issues;
    issues.extend(validate_test_results(&check.records, &results));
    Ok(generate_seed_report(
        &check.records,
        &issues,
        options.language.as_deref(),
        &results,
    ))
}
