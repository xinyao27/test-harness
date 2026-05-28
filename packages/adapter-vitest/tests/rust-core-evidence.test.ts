import { spawn } from "node:child_process";

import { describe, expect } from "vitest";

import { scenarioTest } from "../src/index.ts";

type CommandResult = {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
};

const rootDir = process.cwd();
let rustWorkspaceTestRun: Promise<CommandResult> | undefined;
const rustCoreEvidenceTimeoutMs = 60_000;

const rustCoreEvidenceMarkers = {
  "harness.cli.check_validates_promises": ["tests::check_succeeds_for_valid_promises"],
  "harness.cli.rejects_invalid_arguments_with_usage_hint": [
    "tests::invalid_lang_argument_fails_with_usage",
  ],
  "harness.cli.report_renders_promise_status": ["tests::verify_renders_readable_report"],
  "harness.cli.report_summary_lists_promises_compactly": [
    "tests::summary_report_matches_golden_output",
  ],
  "harness.cli.test_orchestrates_adapter_and_verify": [
    "tests::test_command_orchestrates_adapter_and_report_results",
  ],
  "harness.cli.test_reads_runner_config": ["tests::test_command_reads_runner_config"],
  "harness.module_registry.load_canonical_yaml_modules": ["tests::loads_canonical_yaml_modules"],
  "harness.promise.canonical_file_is_grouped": ["promises_file_fixtures_match_protocol_v1"],
  "harness.promise.schema_defines_required_fields": ["promise_fixtures_match_protocol_v1"],
  "harness.promise.schema_supports_example_variants": ["promise_fixtures_match_protocol_v1"],
  "harness.promise_registry.load_canonical_yaml_promises": ["tests::loads_canonical_yaml_promises"],
  "harness.promise_registry.surfaces_per_record_decode_errors": [
    "tests::surfaces_per_record_decode_errors",
  ],
  "harness.protocol.adapter_events_are_versioned_stream_records": [
    "adapter_event_fixtures_match_protocol_v1",
  ],
  "harness.protocol.cli_contract_is_versioned_and_enforced": [
    "tests::cli_contract_commands_are_enforced",
    "cli_contract_is_versioned_and_explicit",
  ],
  "harness.protocol.cli_golden_outputs_lock_human_surface": [
    "tests::full_report_matches_golden_output",
    "tests::summary_report_matches_golden_output",
  ],
  "harness.protocol.conformance_fixtures_lock_reference_behavior": [
    "config_fixtures_match_protocol_v1",
    "promise_fixtures_match_protocol_v1",
    "result_fixtures_match_protocol_v1",
    "report_fixtures_match_protocol_v1",
  ],
  "harness.protocol.module_schema_is_portable": ["module_fixtures_match_protocol_v1"],
  "harness.protocol.promise_files_are_versioned": ["promises_file_fixtures_match_protocol_v1"],
  "harness.protocol.results_are_versioned_adapter_outputs": ["result_fixtures_match_protocol_v1"],
  "harness.protocol.runner_config_is_versioned": ["config_fixtures_match_protocol_v1"],
  "harness.protocol.schemas_define_language_agnostic_contract": [
    "adapter_event_fixtures_match_protocol_v1",
    "config_fixtures_match_protocol_v1",
    "module_fixtures_match_protocol_v1",
    "promise_fixtures_match_protocol_v1",
    "promises_file_fixtures_match_protocol_v1",
    "result_fixtures_match_protocol_v1",
    "report_fixtures_match_protocol_v1",
  ],
  "harness.report.computes_promise_run_status_from_results": [
    "tests::promise_run_status_mapping_is_deterministic",
  ],
  "harness.report.falls_back_through_language_chain": [
    "tests::report_falls_back_through_language_chain",
  ],
  "harness.report.renders_in_requested_language": ["tests::report_renders_in_requested_language"],
  "harness.results.schema_defines_required_fields": ["result_fixtures_match_protocol_v1"],
  "harness.validation.checks_examples_table_shape": [
    "tests::validation_checks_examples_table_shape",
  ],
  "harness.validation.flags_promises_without_test_results": [
    "tests::implemented_promise_without_evidence_is_an_error",
    "tests::accepted_promise_without_evidence_is_a_warning",
    "tests::proposed_or_deprecated_promises_are_silent",
    "tests::issue_message_names_the_owning_module",
  ],
  "harness.validation.flags_uncovered_source_files": [
    "tests::validation_flags_uncovered_source_files",
  ],
  "harness.validation.flags_unknown_scenario_bindings": [
    "tests::validation_flags_unknown_scenario_bindings",
  ],
  "harness.validation.rejects_unreadable_modules": ["tests::validation_rejects_unreadable_modules"],
  "harness.validation.rejects_unreadable_promises": [
    "tests::validation_rejects_unreadable_promises",
  ],
  "harness.validation.warns_when_default_language_missing": [
    "tests::validation_warns_when_default_language_missing",
  ],
} as const;

const runCargo = async (args: readonly string[]): Promise<CommandResult> =>
  await new Promise((resolve, reject) => {
    const child = spawn("cargo", args, {
      cwd: rootDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stderr: Buffer.concat(stderr).toString().trimEnd(),
        stdout: Buffer.concat(stdout).toString().trimEnd(),
      });
    });
  });

const runRustWorkspaceTests = async (): Promise<CommandResult> => {
  rustWorkspaceTestRun ??= runCargo(["test", "--workspace"]);
  return await rustWorkspaceTestRun;
};

const cargoTestPassed = (output: string, marker: string): boolean =>
  output.split(/\r?\n/).some((line) => line.trim() === `test ${marker} ... ok`);

describe("Rust core evidence bridge", () => {
  for (const [promiseId, markers] of Object.entries(rustCoreEvidenceMarkers)) {
    scenarioTest(
      promiseId,
      `Rust implementation satisfies ${promiseId}`,
      async () => {
        const result = await runRustWorkspaceTests();
        const output = `${result.stdout}\n${result.stderr}`;

        expect(result.exitCode, result.stderr).toBe(0);
        for (const marker of markers) {
          expect(cargoTestPassed(output, marker), `missing cargo pass marker ${marker}`).toBe(true);
        }
      },
      { timeout: rustCoreEvidenceTimeoutMs },
    );
  }
});
