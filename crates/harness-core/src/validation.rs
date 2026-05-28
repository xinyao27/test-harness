use crate::localized_text::{
    has_default_language_text, is_blank, is_localized_text_blank, resolve_localized_text,
};
use harness_protocol::{
    ModuleRecord, PromiseExampleRow, PromiseLifecycle, PromiseRecord, PromiseReviewState,
    TestResult, ValidationIssue, ValidationSeverity,
};
use regex::Regex;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
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

        if record.lifecycle == PromiseLifecycle::Accepted
            && record.review.state != PromiseReviewState::Approved
        {
            issues.push(issue(
                ValidationSeverity::Warning,
                "missing_review_metadata",
                format!(
                    "Accepted promise \"{}\" should have review.state approved.",
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

pub fn validate_module_records(modules: &[ModuleRecord]) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    let mut seen = HashSet::new();

    for module in modules {
        if !seen.insert(module.id.clone()) {
            issues.push(issue(
                ValidationSeverity::Error,
                "duplicate_module_id",
                format!("Duplicate module id \"{}\".", module.id),
                None,
                None,
            ));
        }

        if !ID_PATTERN.is_match(&module.id) {
            issues.push(issue(
                ValidationSeverity::Error,
                "invalid_module_id",
                format!(
                    "Module id \"{}\" must be stable, lowercase, and dot/underscore/hyphen separated.",
                    module.id
                ),
                None,
                None,
            ));
        }

        for (field, value) in [
            ("title", &module.title),
            ("summary", &module.summary),
            ("purpose", &module.purpose),
        ] {
            if is_localized_text_blank(value) {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "blank_required_field",
                    format!("Module \"{}\" has a blank {field}.", module.id),
                    None,
                    None,
                ));
            }
            if !has_default_language_text(value) {
                issues.push(issue(
                    ValidationSeverity::Warning,
                    "missing_default_language",
                    format!(
                        "Module \"{}\" should include non-blank en text for {field}.",
                        module.id
                    ),
                    None,
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
                None,
                None,
            ));
        }
    }

    issues
}

fn is_vague_module_name(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "common" | "general" | "helpers" | "misc" | "miscellaneous" | "stuff" | "utils"
    )
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

/// Compare reviewed promises against collected test results and flag the gap.
///
/// Implements `harness.validation.flags_promises_without_test_results`:
///   - `implemented` lifecycle + no matching result → **Error**
///     (implemented = code + tests both exist; zero evidence is a contradiction)
///   - `accepted` or `changed_requires_review` + no matching result → **Warning**
///     (the human signed off but implementation/tests haven't caught up)
///   - `proposed` or `deprecated` → silent
///   - A test result whose promise id does not match any canonical promise →
///     **Error** (`unknown_result_binding`), catching binding typos.
///
/// Each issue's message names the promise id, the owning module, and the
/// lifecycle so a reviewer or agent can act without re-reading the YAML.
pub fn validate_test_results(
    records: &[PromiseRecord],
    modules: &[ModuleRecord],
    results: &[TestResult],
) -> Vec<ValidationIssue> {
    let promise_ids: HashSet<&str> = records.iter().map(|record| record.id.as_str()).collect();
    let result_promise_ids: HashSet<&str> = results
        .iter()
        .map(|result| result.promise_id.as_str())
        .collect();

    // Build a quick promise_id → module_id index so each issue can name the
    // module that owns the promise.
    let mut module_by_promise: HashMap<&str, &str> = HashMap::new();
    for module in modules {
        for promise_id in &module.promises {
            module_by_promise.insert(promise_id.as_str(), module.id.as_str());
        }
    }

    let mut issues = Vec::new();

    for record in records {
        if result_promise_ids.contains(record.id.as_str()) {
            continue;
        }
        let module_clause = module_by_promise
            .get(record.id.as_str())
            .map(|module_id| format!(" (module `{module_id}`)"))
            .unwrap_or_default();

        match record.lifecycle {
            PromiseLifecycle::Implemented => {
                issues.push(issue(
                    ValidationSeverity::Error,
                    "implemented_promise_without_evidence",
                    format!(
                        "Implemented promise `{}`{module_clause} has no bound test result — \
                         `implemented` means code and tests both exist, so zero evidence is a contradiction.",
                        record.id
                    ),
                    Some(record.id.clone()),
                    None,
                ));
            }
            PromiseLifecycle::Accepted | PromiseLifecycle::ChangedRequiresReview => {
                let lifecycle_word = match record.lifecycle {
                    PromiseLifecycle::Accepted => "accepted",
                    PromiseLifecycle::ChangedRequiresReview => "changed_requires_review",
                    _ => unreachable!(),
                };
                issues.push(issue(
                    ValidationSeverity::Warning,
                    "accepted_promise_without_evidence",
                    format!(
                        "Promise `{}`{module_clause} is `{lifecycle_word}` but has no bound test result — \
                         a reviewed promise without executable evidence is the gap promise-first review is meant to close.",
                        record.id
                    ),
                    Some(record.id.clone()),
                    None,
                ));
            }
            PromiseLifecycle::Proposed | PromiseLifecycle::Deprecated => {
                // Silent: proposed has not been signed off yet; deprecated is
                // no longer in scope.
            }
        }
    }

    for result in results {
        if !promise_ids.contains(result.promise_id.as_str()) {
            issues.push(issue(
                ValidationSeverity::Error,
                "unknown_result_binding",
                format!(
                    "Test result binding `{}` does not match any canonical promise.",
                    result.promise_id
                ),
                Some(result.promise_id.clone()),
                None,
            ));
        }
    }

    issues
}

/// Compute a deterministic hash of the reviewable content of a promise — the
/// subset of fields whose change should require a re-review:
/// `title`, `purpose`, `priority`, `boundary`, `given`, `when`, `then`,
/// `observes`, `failureMeaning`, `examples`. Anything outside that set (the
/// `id`, `lifecycle`, `review`, `supersedes`, `deprecatedBy`) is excluded.
///
/// The hash is sha256 of a JSON object built from a BTreeMap, which gives
/// stable lexicographic key ordering across runs and platforms.
pub fn compute_promise_content_hash(promise: &PromiseRecord) -> String {
    let mut fields: BTreeMap<&str, serde_json::Value> = BTreeMap::new();
    fields.insert(
        "title",
        serde_json::to_value(&promise.title).expect("LocalizedText serializes"),
    );
    fields.insert(
        "purpose",
        serde_json::to_value(&promise.purpose).expect("LocalizedText serializes"),
    );
    fields.insert(
        "priority",
        serde_json::to_value(&promise.priority).expect("priority serializes"),
    );
    fields.insert(
        "boundary",
        serde_json::to_value(&promise.boundary).expect("boundary serializes"),
    );
    fields.insert(
        "given",
        serde_json::to_value(&promise.given).expect("given serializes"),
    );
    fields.insert(
        "when",
        serde_json::to_value(&promise.when).expect("when serializes"),
    );
    fields.insert(
        "then",
        serde_json::to_value(&promise.then_steps).expect("then serializes"),
    );
    fields.insert(
        "observes",
        serde_json::to_value(&promise.observes).expect("observes serializes"),
    );
    fields.insert(
        "failureMeaning",
        serde_json::to_value(&promise.failure_meaning).expect("failureMeaning serializes"),
    );
    fields.insert(
        "examples",
        serde_json::to_value(&promise.examples).expect("examples serializes"),
    );

    let json = serde_json::to_string(&fields).expect("BTreeMap serializes to JSON");
    let digest = Sha256::digest(json.as_bytes());
    let mut hex = String::with_capacity(64);
    for byte in digest {
        use std::fmt::Write;
        write!(&mut hex, "{:02x}", byte).expect("hex write");
    }
    format!("sha256:{hex}")
}

/// Flag every `accepted` (or `implemented`) promise whose stored
/// `review.contentHash` no longer matches its current reviewable content.
///
/// Implements `harness.validation.detects_promise_content_drift_after_acceptance`.
/// Promises without a stored hash are silent (migration path for promises
/// approved before the field existed). Promises in lifecycle `proposed`,
/// `changed_requires_review`, or `deprecated` are silent (drift only matters
/// once a human has signed off and the lifecycle has not since transitioned).
pub fn validate_promise_content_drift(
    records: &[PromiseRecord],
    modules: &[ModuleRecord],
) -> Vec<ValidationIssue> {
    let mut module_by_promise: HashMap<&str, &str> = HashMap::new();
    for module in modules {
        for promise_id in &module.promises {
            module_by_promise.insert(promise_id.as_str(), module.id.as_str());
        }
    }

    let mut issues = Vec::new();
    for record in records {
        // Only signed-off lifecycles can drift in a meaningful way.
        let is_signed_off = matches!(
            record.lifecycle,
            PromiseLifecycle::Accepted | PromiseLifecycle::Implemented
        );
        if !is_signed_off {
            continue;
        }
        let Some(stored) = record.review.content_hash.as_deref() else {
            continue;
        };
        let current = compute_promise_content_hash(record);
        if stored == current.as_str() {
            continue;
        }
        let module_clause = module_by_promise
            .get(record.id.as_str())
            .map(|module_id| format!(" (module `{module_id}`)"))
            .unwrap_or_default();
        issues.push(issue(
            ValidationSeverity::Warning,
            "accepted_promise_content_drifted",
            format!(
                "Promise `{}`{module_clause} is `{}` but its reviewable content has changed \
                 since the last approval — the recorded review signature no longer covers \
                 the file's content. Re-review (and re-approve) the promise, or move it \
                 to `changed_requires_review`.",
                record.id, record.lifecycle
            ),
            Some(record.id.clone()),
            None,
        ));
    }
    issues
}
