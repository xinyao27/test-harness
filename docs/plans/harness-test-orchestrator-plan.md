# Harness Test Orchestrator Plan

## Summary

The next slice should turn the current two-command loop into one command:

```bash
harness test
```

The command should run Vite+/Vitest from the workspace root, let the Harness reporter write `.harness/results.yaml`, then render the same verification report that `harness verify` already produces.

This is still not AI-generated implementation. It is the smallest practical self-bootstrapping loop:

```text
canonical .promise.yaml files
  -> scenarioTest(...) bindings
  -> harness test
  -> Vitest execution
  -> .harness/results.yaml
  -> promise verification report
```

## Goal

After this slice, a human can:

1. Write or review `.promise.yaml` files.
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
3. Run the configured Vite+/Vitest command.
4. Fail if the test command exits non-zero.
5. Fail if `.harness/results.yaml` is missing after a successful test command.
6. Read `.harness/results.yaml` through the existing Effect Schema decoder.
7. Render the same report as `harness verify`.
8. Return non-zero if tests fail, result YAML is missing or invalid, or verification contains errors.

The command should keep `harness check`, `harness report`, and `harness verify` behavior unchanged.

## Root Handling

The orchestrator should make root handling explicit:

- Default root is the CLI `cwd`.
- The test command should run with that root as `cwd`.
- The reporter should continue writing `.harness/results.yaml` relative to the test process cwd.

This keeps the first implementation simple and predictable. A future slice can add explicit workspace discovery if users need to run the CLI from nested directories.

## Test Command

For the first implementation, use the repo's existing command:

```bash
vp run -r test
```

The command should be centralized in one small helper so it can later become configurable without changing report logic.

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
- CLI unit test: invalid `.harness/results.yaml` returns non-zero with a typed error.
- Integration/manual check:

```bash
vp check
vp run -r test
vp run -r build
vp exec harness test --lang zh-CN
```
