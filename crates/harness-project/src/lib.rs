mod config;
mod errors;
mod feature_registry;
mod feature_report;
mod fs_utils;
mod localized_text;
mod module_registry;
mod programs;
mod results;
mod validation;

pub use config::{load_harness_config, HARNESS_CONFIG_PATH};
pub use errors::{FeatureLoadError, HarnessError};
pub use feature_registry::{
    find_feature_files, load_feature_records, validate_feature_records, ExampleRecord,
    FeatureRecord, RuleRecord, EXAMPLE_TAG_PREFIX, FEATURES_DIRECTORY, FEATURE_FILE_SUFFIX,
    FEATURE_TAG_PREFIX, LOCALE_TAG_PREFIX, MODULE_TAG_PREFIX, PACKAGE_TAG_PREFIX, RULE_TAG_PREFIX,
};
pub use feature_report::{
    generate_feature_report, render_feature_report_markdown, render_feature_report_summary,
    FeatureHarnessReport, FeatureHarnessReportSummary,
};
pub use localized_text::{resolve_localized_text, DEFAULT_LANGUAGE};
pub use module_registry::{
    find_source_files, load_behavior_file, load_locales_file, load_module_records,
    load_package_records, load_review_log_file, BEHAVIOR_PATH, LOCALES_PATH, MODULES_PATH,
    PACKAGES_PATH, REVIEW_LOG_PATH,
};
pub use programs::{
    build_feature_report, check_feature_harness, check_seed_harness, FeatureCheckResult,
    SeedCheckResult,
};
pub use results::{
    create_results_file, get_example_run_status, load_example_results, load_results_file,
    write_results_file, ExampleRunStatus, HARNESS_RESULTS_PATH, HARNESS_ROOT_ENV_VAR,
};
pub use validation::{
    validate_behavior_records, validate_feature_manifest_links, validate_module_coverage,
    validate_module_records, validate_package_records, validate_results_file_bindings,
    validate_review_log_records,
};

pub use harness_protocol::{
    BehaviorFile, BehaviorLifecycle, BehaviorRuleRecord, ExampleResult, ExampleStatus,
    HarnessConfig, LocalesFile, LocalizedText, ModuleRecord, PackageRecord, ProtocolVersion,
    ResultsFile, ReviewLogFile, ReviewState, StepResult, ValidationIssue, ValidationSeverity,
};
