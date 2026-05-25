---
name: harness-troubleshoot
description: Diagnose a failing `harness check`, `harness test`, or `harness verify` command. Use when the CLI exits non-zero, when a promise shows `Run Status: unknown`, when `missing_test_result` or `unknown_result_binding` warnings appear, when a `lifecycle: accepted` promise is flagged as missing review approval, or when a promise you expect to see is not in the report at all. Do not use for authoring or onboarding work (use `harness-add-feature` or `harness-onboard-project`).
---

# Troubleshooting a Failing Harness Command

This skill is for the moment when `harness check` / `harness test` / `harness verify` does not give you a clean report. The fix is rarely "rerun" — read the message, map it to the failure type, apply the fix.

## The Mental Model

```text
tests/harness.yaml                ─┐
tests/modules/**/*.module.yaml    ─┤
tests/promises/**/*.promises.yaml ─┤
                                    ├─► Registry → Validation → Report
.harness/results.yaml             ─┘
        ▲
        │
    Adapter result metadata (e.g. Vitest scenarioTest promise ids)
```

Each failure mode comes from a different layer in this pipeline. Identifying the layer is half the fix.

## Diagnostic Flow

1. Read the **exact** error or warning text — do not paraphrase. The wording maps to a specific case in the table below.
2. Match the wording to a row in the failure-mode table. Apply the suggested fix.
3. Re-run the failing command (`harness check` for shape issues, `harness test` for evidence issues). Iterate.
4. If the message does not match any row, surface it to the human — do not invent a fix. Stale messages can mean the registry, schema, validation, or report layer changed in a way the table does not yet cover.

## Failure-Mode Table

| What you see                                                    | What it means                                                                                                                         | Where to fix                                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Your promise id is not in the report at all                     | There is no canonical promise entry for that id, or the grouped promise file failed to load.                                          | Check `tests/promises/**/*.promises.yaml` for the id; check `harness check` for load errors. Use an existing group file as the shape template. |
| `Run Status: unknown`                                           | The canonical promise exists, but no collected test result matched it. A `scenarioTest` for that id did not run under `harness test`. | Add or repair the `scenarioTest` for that id. The `harness-add-feature` skill covers binding rules.                                            |
| `missing_test_result` warning                                   | An implemented promise has no collected test result.                                                                                  | Add or repair the `scenarioTest` evidence before treating the promise as covered.                                                              |
| `unknown_result_binding`                                        | The adapter-emitted `promiseId` does not match any promise entry in the loaded `*.promises.yaml` files.                               | Fix the id (typo? renamed?) or add the missing promise entry. Remember: ids are permanent; do not silently rename.                             |
| `harness check` flags missing review approval                   | A promise is `lifecycle: accepted` but has no `review.approvedBy` / `approvedAt`.                                                     | Either fill the review metadata in, or move the promise back to `proposed`. Only a human should set `accepted`.                                |
| `harness check` flags an unreadable promise                     | The validation module rejected the file's metadata as too thin or malformed for a reviewer to manage reliably.                        | Read the specific complaint and fix the offending field — use a passing promise file as a reference shape.                                     |
| Vitest test passes but `Run Status` is still not passing        | The test ran but did not bind to the promise — likely `scenarioTest` was called with the wrong id, or a plain `test(...)` was used.   | Convert to `scenarioTest(promiseId, ...)` with the exact id from the YAML.                                                                     |
| `harness verify --summary` shows fewer promises than you expect | The registry did not load all promise files. Most likely a YAML parse error or a missing required field in one file.                  | Run `harness check` to see which file failed; fix it.                                                                                          |

## Common Mistakes While Fixing

- **Weakening the assertion to make the test pass.** That is evidence drift — fix the code or update the promise, do not silently lower the bar. Surface the change in the PR; do not hide it behind a green test.
- **Renaming an `id` to "fix" `unknown_result_binding`.** Ids are permanent. If the id is wrong on the test side, fix the test. If the id is wrong on the YAML side, add a new promise entry with the correct id and deprecate the old one.
- **Setting `lifecycle: accepted` to clear the "missing review approval" warning.** That bypasses the review gate. Either get human approval and fill in `review`, or move back to `proposed`.
- **Editing `.harness/results.yaml` by hand.** Results are adapter output; they are regenerated every `harness test`. Hand-edits will be overwritten.

## Handoff

If you fixed it, report:

- Which command was failing, with the exact error wording.
- Which file(s) you changed, and why.
- The current `harness check` / `harness test` exit status and the promise(s)'s `Run Status` line.

If you could not fix it, surface to the human with:

- The exact error wording.
- Which row of the failure-mode table (if any) it looked like.
- What you tried, what changed, what did not.
