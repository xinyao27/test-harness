# Harness Test Orchestrator Plan

> Status: Historical plan, implemented as a generic configured-runner path in the Rust CLI.

## Summary

This slice turned the earlier two-command loop into one command:

```bash
harness test
```

The command runs the configured test runner from `tests/harness.yaml`, passes the workspace root through `HARNESS_ROOT_DIR`, requires a Harness result file, then renders the same verification report that `harness verify` already produces. In this repository, the configured command uses the Rust adapter runtime to wrap `vp test` and merge adapter event shards into `.harness/results.yaml`.

This is still not AI-generated implementation. It is the smallest practical self-bootstrapping loop:

```text
canonical .promises.yaml files
  -> scenarioTest(...) bindings
  -> harness test
  -> configured runner execution
  -> adapter event shards
  -> adapter runtime merge
  -> .harness/results.yaml
  -> promise verification report
```

## Goal

After this slice, a human can:

1. Write or review `.promises.yaml` files.
2. Bind executable tests to promise ids with `scenarioTest(...)`.
3. Run one command to see which reviewed promises are currently passing, failing, skipped, or unknown.

The command should preserve the existing report language option:

```bash
harness test --lang zh-CN
```

## Boundaries

This slice should not introduce new concepts.

Out of scope:

- AI generation from promises
- evidence drift detection
- assertion fingerprints
- browser or app orchestration
- Vitest UI integration
- visual reports

## Behavior

`harness test` should:

1. Resolve the workspace root.
2. Remove or overwrite stale `.harness/results.yaml`.
3. Run the configured command from `tests/harness.yaml`.
4. If the test command exits non-zero, fail; if it still wrote results, render them so the failing promises remain visible.
5. If the test command exits non-zero without results, report only the test command failure instead of also reporting a missing result file.
6. Fail if `.harness/results.yaml` is missing after a successful test command.
7. Read `.harness/results.yaml` through the Rust protocol decoder.
8. Render the same report as `harness verify`.
9. Return non-zero if tests fail, result YAML is missing or invalid, or verification contains errors.

The command should keep `harness check`, `harness report`, and `harness verify` behavior unchanged.

## Root Handling

The orchestrator should make root handling explicit:

- Default root is the CLI `cwd`.
- The test command should run with that root as `cwd`.
- The CLI should pass that root to the reporter through `HARNESS_ROOT_DIR`.
- The reporter should write `.harness/results.yaml` relative to `HARNESS_ROOT_DIR`, falling back to the test process cwd only when the env var is absent.

This keeps the first implementation simple and predictable while avoiding accidental writes to package subdirectories. A future slice can add explicit workspace discovery if users need to run the CLI from nested directories.

## Test Command

For this repository's development self-bootstrap, the configured command currently wraps:

```bash
vp test
```

Packaged users should invoke the installed Harness binary or adapter entrypoint instead of Cargo. The CLI itself only knows the configured runner contract; Vitest-specific details stay in the adapter/runtime boundary.

## Done Looks Like

Running:

```bash
harness test --lang zh-CN
```

should:

- execute the test suite
- create `.harness/results.yaml`
- print the Seed Harness report
- show the current self-promises as `passing`

## Test Plan

- CLI unit test: `harness test` invokes the configured test runner and then renders a report.
- CLI unit test: non-zero test runner exit returns non-zero and prints the failure.
- CLI unit test: missing `.harness/results.yaml` returns non-zero with a clear missing-result message only when the test command succeeded.
- CLI unit test: invalid `.harness/results.yaml` returns non-zero with a typed error.
- Integration/manual check:

```bash
vp check
vp run -r test
vp run -r build
cargo run -q -p harness-cli -- test --lang zh-CN
```
