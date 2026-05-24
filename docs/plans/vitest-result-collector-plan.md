# Vitest Result Collector Slice Plan

## Summary

The next slice should turn `Run Status: unknown` into real `passing`, `failing`, or `skipped` statuses by collecting Vitest results and mapping them back to canonical promise ids.

Claude reviewed the first draft of this plan and found two architecture issues:

- `scenario({ id })` currently writes to an in-memory registry, but Vitest test files run in isolated workers. A reporter in the main process cannot read that worker-local registry.
- `harness verify` needs a durable result source. In-process reporter state disappears after Vitest exits.

So this slice must use a cross-process mechanism:

```text
scenarioTest(...)
  -> sets Vitest task.meta.promiseId
  -> Vitest reporter reads task.meta and test status
  -> reporter writes .harness/results.yaml
  -> harness verify reads promises + results
  -> report shows promise run status
```

## Goal

After this slice:

```bash
vp run -r test
vp exec harness verify --lang zh-CN
```

should show each collected promise as `passing`, `failing`, or `skipped` instead of always `unknown`.

If no result exists for a promise, it should remain `unknown`.

## Design Decisions

### Use Vitest Metadata, Not The In-Memory Registry

The current `scenario()` registry is useful for same-process validation, but it is not enough for Vitest result collection because worker-local state is not visible to the main process.

The test binding API for this slice should be a thin Vitest helper, tentatively:

```ts
scenarioTest(
  "harness.promise_registry.load_canonical_yaml_promises",
  "loads canonical YAML promises",
  () => {
    // test body
  },
);
```

The helper should attach the promise id to Vitest task metadata so the reporter can read it later.

### Persist Results To A File

The reporter should write a YAML result file:

```text
.harness/results.yaml
```

`harness verify` should read this file and merge it with canonical YAML promises.

This makes the flow explicit, debuggable, and independent from any single process lifetime.

YAML should be the default artifact format for Harness-owned files. Use JSON only when an external tool or protocol requires it.

### Keep The MVP Narrow

This slice should not implement:

- assertion fingerprints
- evidence drift detection
- browser/app orchestration
- visual UI
- AI-based analysis

Those belong after the basic promise-to-test result loop works.

## Data Shape

Use YAML parsing plus Effect Schema decoding for the result file.

```ts
const TestResultSchema = Schema.Struct({
  failureMessage: Schema.optionalKey(Schema.String),
  file: Schema.String,
  promiseId: Schema.String,
  status: Schema.Literals(["passing", "failing", "skipped"]),
  testName: Schema.String,
});

const TestResultsFileSchema = Schema.Struct({
  generatedAt: Schema.String,
  results: Schema.Array(TestResultSchema),
});
```

Report generation can derive `PromiseRunStatus` from these results:

- no results for promise id -> `unknown`
- any failing result -> `failing`
- otherwise any skipped result -> `skipped`
- otherwise all collected results are passing -> `passing`

## Implementation Steps

1. Add a new self-promise:

```text
promises/result-collector/maps-results.promise.yaml
```

It should describe the Harness promise that Vitest results can be mapped back to canonical promise ids.

2. Add result schemas and types in `packages/core`.

Suggested module:

```text
packages/core/src/results.ts
```

3. Add a Vitest-specific helper.

Suggested module:

```text
packages/core/src/vitest.ts
```

It should provide the smallest helper that can attach `promiseId` to the current Vitest task metadata.

4. Add a minimal Vitest reporter.

Suggested module:

```text
packages/core/src/vitest-reporter.ts
```

The reporter should collect `promiseId`, file, test name, status, and failure message, then write `.harness/results.yaml`.

5. Update report generation.

`generateSeedReport(...)` should accept collected results and compute `runStatus` instead of hardcoding `unknown`.

6. Update CLI behavior.

- `harness verify` reads `.harness/results.yaml` if it exists.
- `harness report` can share the same behavior.
- `harness test` can remain a stub or become the orchestrator only after the reporter path is stable.

7. Add tests.

Minimum tests:

- result file schema decodes valid YAML
- invalid result file returns a typed error
- report status is `unknown` when no result exists
- report status is `passing` for passing promise results
- report status is `failing` when any bound result fails
- report status is `skipped` when all bound results are skipped
- reporter maps Vitest metadata to persisted result records

## Open Questions Before Coding

- Confirm the exact Vitest API for attaching metadata from inside a test helper.
- Confirm the exact reporter hook to collect final task results.
- Decide whether `scenarioTest` should wrap `test(...)` directly, or whether a lower-level helper should support both `test` and `it`.

The implementation should answer these by checking the installed Vitest/Vite+ APIs before coding.
