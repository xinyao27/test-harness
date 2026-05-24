---
name: harness-add-feature
description: Add or change behavior in a project that uses this Test Harness — draft the behavior promise, get it reviewed, bind tests, implement, and verify with `harness test`. Use when adding a new feature, modifying an existing feature whose behavior a human will review, deprecating or renaming behavior, or fixing a `harness test` failure on a promise you own. Do not use for first-time harness onboarding (use `harness-onboard-project`) or for diagnosing harness command failures (use `harness-troubleshoot`).
---

# Adding or Changing a Feature in a Harness Project

This skill is the **default entry point** for changing behavior in a project that uses this Test Harness. Most work flows through here: features, bug fixes that involve a behavior change, deprecations, renames.

You do not need to know how the Harness is implemented internally. You only need to produce protocol artifacts and adapter evidence correctly — and the reference docs below tell you the field shapes.

## The Mental Model

```text
Module           ← navigation grouping — modules/*.module.yaml
  Promise        ← review unit (what the system guarantees) — promises/**/*.promise.yaml
    Evidence     ← what proves the promise is still satisfied
      Adapter test ← the executable encoding (Vitest: scenarioTest)
```

Humans review **promises**. You write **tests and code** that prove them. The promise file is the canonical source of meaning — the test is just executable evidence for it.

## Workflow

1. **Find the existing promise first.** Look in `promises/**/*.promise.yaml`. If one already covers what you are about to change, use it. Also check `modules/*.module.yaml` to see which area it belongs to.

2. **Draft a new promise only if the behavior is genuinely new.** Each promise = one human-readable guarantee, not an implementation step. Use existing files under `promises/**/*.promise.yaml` as the shape template. Key invariants: `id` is permanent (renames require a new id plus `deprecatedBy` on the old file); natural-language fields can be plain English or a `{ en, zh-CN }` map; only a human moves `lifecycle` to `accepted` by filling in the `review` block.

3. **If the new promise needs a new module**, surface it to the human — that is a bigger move. Usually a new promise fits into an existing module under `modules/`.

4. **Ask for human review when the meaning shifts.** Any change to `title`, `purpose`, `priority`, `boundary`, `given` / `when` / `then`, `observes`, or `lifecycle` is a review event — even if the test still passes. Do not set `lifecycle: accepted` yourself; the human does that by filling in `review.approvedBy` / `approvedAt`.

5. **Bind tests with `scenarioTest`.** Once a promise is accepted, write Vitest tests that prove it, bound to the promise id from the YAML. Existing tests in the workspace show the `scenarioTest(promiseId, name, fn)` shape. Assert on what the promise's `observes` list names — DB state, UI text, files, events, exit codes — and prefer exact matchers (`toBe`, `toEqual`) over loose ones. If a test would weaken to "mock was called" or `toBeDefined()`, that is evidence drift; surface it in the PR rather than silently lowering the bar.

6. **Implement until the accepted promises pass.** Run `harness test` to confirm.

7. **Hand back at promise level.** See [Handoff](#handoff).

A passing Vitest test alone does not mean the promise is satisfied — it is only a runtime pass. Do not declare done after `vitest run`; declare done after `harness test` shows `Run Status: passing` for the promise you touched.

## Verifying Your Change

```bash
harness check    # promise files are well-formed
harness test     # runs the adapter, collects .harness/results.yaml, renders the report
harness verify   # re-renders the report from existing results (faster)
```

(Invoke however your project runs CLI binaries — `harness ...` directly if it is on PATH, otherwise `npx harness ...`, `pnpm harness ...`, etc.)

What to look for in the report:

- Every promise you touched lists `Run Status: passing`.
- `Errors: 0` in the summary header.
- The Vitest output above the report shows the promise's tests ran.

If something fails (`Run Status: unknown`, `missing_test_result`, `unknown_result_binding`, etc.), switch to the `harness-troubleshoot` skill.

## Handoff

When you hand work back to a human, report at the promise level, not the test level:

- Which promises were **added**, **changed**, or **deprecated**, and why.
- Which promises still need **review** (anything currently `proposed` or `changed_requires_review`).
- Which tests bind to the changed promises.
- The `harness test` result for those promises (one line each: `id → Run Status`).
- Any **promise drift** or **evidence drift** the human should know about, with the reason and the affected ids.

A passing CI run is not the report. The promise report is.
