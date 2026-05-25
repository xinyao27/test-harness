use harness_protocol::{
    decode_adapter_event, decode_harness_config, decode_module_record, decode_promise_record,
    decode_promises_file, decode_promises_file_items, decode_seed_report, decode_test_results_file,
};
use jsonschema::{Registry, Validator};
use serde_json::Value as JsonValue;
use std::fs;
use std::path::{Path, PathBuf};

const PROTOCOL_SCHEMA_NAMES: &[&str] = &[
    "adapter-event.schema.yaml",
    "harness-config.schema.yaml",
    "module.schema.yaml",
    "promise.schema.yaml",
    "promises-file.schema.yaml",
    "report.schema.yaml",
    "results.schema.yaml",
];

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .expect("crate should live under crates/")
        .to_path_buf()
}

fn fixture_paths(kind: &str, validity: &str) -> Vec<PathBuf> {
    let directory = repo_root()
        .join("protocol")
        .join("fixtures")
        .join(kind)
        .join(validity);
    let mut paths = fs::read_dir(directory)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.is_file())
        .collect::<Vec<_>>();
    paths.sort();
    paths
}

fn load_schema(schema_name: &str) -> Validator {
    let schema = read_protocol_schema(schema_name);
    let registry = protocol_schema_registry();
    jsonschema::options()
        .with_registry(&registry)
        .build(&schema)
        .unwrap_or_else(|error| panic!("{schema_name} should compile: {error}"))
}

fn read_protocol_schema(schema_name: &str) -> JsonValue {
    read_yaml_as_json(&repo_root().join("protocol").join("v1").join(schema_name))
}

fn protocol_schema_registry() -> Registry<'static> {
    let mut registry = Registry::new();
    for schema_name in PROTOCOL_SCHEMA_NAMES {
        let schema = read_protocol_schema(schema_name);
        let schema_id = schema
            .get("$id")
            .and_then(JsonValue::as_str)
            .unwrap_or_else(|| panic!("{schema_name} should declare $id"))
            .to_string();
        registry = registry
            .add(schema_id.as_str(), schema)
            .unwrap_or_else(|error| panic!("{schema_name} should register: {error}"));
    }
    registry
        .prepare()
        .unwrap_or_else(|error| panic!("protocol schema registry should prepare: {error}"))
}

fn read_yaml_as_json(path: &Path) -> JsonValue {
    let raw = fs::read_to_string(path).unwrap();
    let yaml: serde_yaml::Value = serde_yaml::from_str(&raw)
        .unwrap_or_else(|error| panic!("{} should parse as YAML: {error}", path.display()));
    serde_json::to_value(yaml)
        .unwrap_or_else(|error| panic!("{} should convert to JSON value: {error}", path.display()))
}

fn schema_errors(validator: &Validator, instance: &JsonValue) -> String {
    validator
        .iter_errors(instance)
        .map(|error| error.to_string())
        .collect::<Vec<_>>()
        .join("\n")
}

fn assert_fixtures(
    schema_name: &str,
    kind: &str,
    decode: impl Fn(&str) -> Result<(), harness_protocol::ProtocolDecodeError>,
) {
    let validator = load_schema(schema_name);

    for path in fixture_paths(kind, "valid") {
        let raw = fs::read_to_string(&path).unwrap();
        let instance = read_yaml_as_json(&path);
        assert!(
            validator.is_valid(&instance),
            "{} should match {schema_name}:\n{}",
            path.display(),
            schema_errors(&validator, &instance)
        );
        decode(&raw).unwrap_or_else(|error| panic!("{} should decode: {error}", path.display()));
    }

    for path in fixture_paths(kind, "invalid") {
        let raw = fs::read_to_string(&path).unwrap();
        let instance = read_yaml_as_json(&path);
        assert!(
            !validator.is_valid(&instance),
            "{} should fail {schema_name}",
            path.display()
        );
        assert!(
            decode(&raw).is_err(),
            "{} should fail protocol decoding",
            path.display()
        );
    }
}

fn assert_promises_file_items() {
    for path in fixture_paths("promise-files", "valid") {
        let raw = fs::read_to_string(&path).unwrap();
        let items = decode_promises_file_items(&raw)
            .unwrap_or_else(|error| panic!("{} wrapper should decode: {error}", path.display()));
        assert!(
            items.iter().all(Result::is_ok),
            "{} child promises should decode",
            path.display()
        );
    }

    for path in fixture_paths("promise-files", "invalid") {
        let raw = fs::read_to_string(&path).unwrap();
        let has_load_error = match decode_promises_file_items(&raw) {
            Ok(items) => items.iter().any(Result::is_err),
            Err(_) => true,
        };
        assert!(
            has_load_error,
            "{} should fail wrapper or child promise decoding",
            path.display()
        );
    }
}

#[test]
fn config_fixtures_match_protocol_v1() {
    assert_fixtures("harness-config.schema.yaml", "configs", |raw| {
        decode_harness_config(raw).map(|_| ())
    });
}

#[test]
fn cli_contract_is_versioned_and_explicit() {
    let contract = read_yaml_as_json(&repo_root().join("protocol/v1/cli.yaml"));

    assert_eq!(contract["apiVersion"], 1);
    assert_eq!(contract["kind"], "harness-cli-contract");
    assert_eq!(
        contract["commands"]["test"]["writes"][0],
        ".harness/runs/<run-id>/events/*.ndjson"
    );
    assert_eq!(
        contract["commands"]["test"]["writes"][1],
        ".harness/results.yaml"
    );
    assert!(contract["environment"]["HARNESS_ROOT_DIR"].is_string());
    assert!(contract["environment"]["HARNESS_RUN_ID"].is_string());
    assert!(contract["environment"]["HARNESS_ADAPTER_EVENTS_DIR"].is_string());
}

#[test]
fn adapter_event_fixtures_match_protocol_v1() {
    assert_fixtures("adapter-event.schema.yaml", "adapter-events", |raw| {
        decode_adapter_event(raw).map(|_| ())
    });
}

#[test]
fn module_fixtures_match_protocol_v1() {
    assert_fixtures("module.schema.yaml", "modules", |raw| {
        decode_module_record(raw).map(|_| ())
    });
}

#[test]
fn promise_fixtures_match_protocol_v1() {
    assert_fixtures("promise.schema.yaml", "promises", |raw| {
        decode_promise_record(raw).map(|_| ())
    });
}

#[test]
fn promises_file_fixtures_match_protocol_v1() {
    assert_fixtures("promises-file.schema.yaml", "promise-files", |raw| {
        decode_promises_file(raw).map(|_| ())
    });
    assert_promises_file_items();
}

#[test]
fn result_fixtures_match_protocol_v1() {
    assert_fixtures("results.schema.yaml", "results", |raw| {
        decode_test_results_file(raw).map(|_| ())
    });
}

#[test]
fn report_fixtures_match_protocol_v1() {
    assert_fixtures("report.schema.yaml", "reports", |raw| {
        decode_seed_report(raw).map(|_| ())
    });
}
