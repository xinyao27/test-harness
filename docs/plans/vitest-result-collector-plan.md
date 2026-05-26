# Vitest Result Collector Slice Plan

> Status: Historical plan, implemented with adapter event shards and the shared Rust adapter runtime.

## Summary

This slice turned `Run Status: unknown` into real `passing`, `failing`, or `skipped` statuses by collecting Vitest results and mapping them back to canonical promise ids.

Claude reviewed the first draft of this plan and found two architecture issues:

- The earlier same-process scenario registry was in-memory, but Vitest test files run in isolated workers. A reporter in the main process cannot read that worker-local registry.
- `harness verify` needs a durable result source. In-process reporter state disappears after Vitest exits.

So this slice must use a cross-process mechanism:

```text
scenarioTest(...)
  -> sets Vitest task.meta.promiseId
  -> Vitest reporter reads task.meta and test status
  -> reporter writes .harness/runs/<run-id>/events/*.ndjson
  -> Rust adapter runtime merges events into .harness/results.yaml
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

Current implementation uses the language-agnostic schemas under `protocol/v1/`, with Rust protocol decoding as the reference implementation. The Vitest reporter emits adapter event records, and the adapter runtime merges those events into the canonical result file.

```text
protocol/v1/adapter-event.schema.yaml
  -> .harness/runs/<run-id>/events/*.ndjson
  -> harness-adapter-runtime
  -> protocol/v1/results.schema.yaml
  -> .harness/results.yaml
```

Report generation can derive `PromiseRunStatus` from these results:

- no results for promise id -> `unknown`
- any failing result -> `failing`
- otherwise any skipped result -> `skipped`
- otherwise all collected results are passing -> `passing`

## Implementation Steps

1. Add self-promises for Vitest result collection and shared runtime merging:

```text
tests/promises/adapters/vitest/vitest.promises.yaml
tests/promises/adapter-runtime/adapter-runtime.promises.yaml
```

They describe the promises that Vitest results can be mapped back to canonical promise ids and that adapter event shards can become protocol results.

2. Add result schemas and types in the Rust core/protocol crates.

Suggested module:

```text
crates/harness-core/src/results.rs
```

3. Add a Vitest-specific helper.

Suggested module:

```text
packages/adapter-vitest/src/index.ts
```

It should provide the smallest helper that can attach `promiseId` to the current Vitest task metadata.

4. Add a minimal Vitest reporter.

Suggested module:

```text
packages/adapter-vitest/src/reporter.ts
```

The reporter should collect `promiseId`, file, test name, status, and failure message, then write adapter event shards. The shared Rust runtime merges those shards into `.harness/results.yaml`.

5. Update report generation.

`generateSeedReport(...)` should accept collected results and compute `runStatus` instead of hardcoding `unknown`.

6. Update CLI behavior.

- `harness verify` reads `.harness/results.yaml` if it exists.
- `harness report` can share the same behavior.
- `harness test` runs the configured command from `tests/harness.yaml`; in this repo, that command uses `harness-adapter-runtime` to wrap `vp test`.

7. Add tests.

Minimum tests:

- result file schema decodes valid YAML
- invalid result file returns a typed error
- report status is `unknown` when no result exists
- report status is `passing` for passing promise results
- report status is `failing` when any bound result fails
- report status is `skipped` when all bound results are skipped
- reporter maps Vitest metadata to persisted adapter event records
- adapter runtime merges persisted adapter event records into result records

## Open Questions Before Coding

- Confirm the exact Vitest API for attaching metadata from inside a test helper.
- Confirm the exact reporter hook to collect final task results.
- Decide whether `scenarioTest` should wrap `test(...)` directly, or whether a lower-level helper should support both `test` and `it`.

The implementation should answer these by checking the installed Vitest/Vite+ APIs before coding.
