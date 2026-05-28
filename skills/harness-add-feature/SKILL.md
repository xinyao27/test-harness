---
name: harness-add-feature
description: Add or change behavior in a project that uses this Test Harness — draft the behavior promise, get it reviewed, bind tests, implement, and verify with `harness test`. Use when adding a new feature, modifying an existing feature whose behavior a human will review, deprecating or renaming behavior, or fixing a `harness test` failure on a promise you own. Do not use for first-time harness onboarding (use `harness-onboard-project`) or for diagnosing harness command failures (use `harness-troubleshoot`).
---

# Adding or Changing a Feature in a Harness Project

This skill is the **default entry point** for changing behavior in a project that uses this Test Harness. Most work flows through here: features, bug fixes that involve a behavior change, deprecations, renames.

You do not need to know how the Harness is implemented internally. You only need to produce protocol artifacts and adapter evidence correctly — and the reference docs below tell you the field shapes.

## The Mental Model

```text
Harness config   ← runner entrypoint — tests/harness.yaml
  Module         ← architecture boundary — tests/modules/*.module.yaml
    Promise group ← related review units — tests/promises/**/*.promises.yaml
      Promise    ← one behavior guarantee inside the file's `promises:` list
        Evidence ← what proves the promise is still satisfied
          Adapter test ← executable encoding (Vitest scenarioTest, Rust adapter metadata, etc.)
```

Humans review **promises**. You write **tests and code** that prove them. The grouped promise file is the canonical source of meaning — the test is just executable evidence for it. New promise files should use `apiVersion: 1` and a top-level `promises:` array.

Modules are the project's architecture map. Do not create a module just because a feature needs a place to live; create or split a module only when the project's architecture boundary changes.

## Workflow

1. **Find the existing promise first.** Look in `tests/promises/**/*.promises.yaml`. If one already covers what you are about to change, use it. Also check `tests/modules/*.module.yaml` to see which architecture boundary owns it.

2. **Draft a new promise only if the behavior is genuinely new.** Each promise = one human-readable guarantee, not an implementation step. Add it to the most specific existing group file when it belongs with that behavior area; create a new `*.promises.yaml` group only when the existing groups would blur review ownership. Key invariants: `id` is permanent (renames require a new id plus `deprecatedBy` on the old promise); natural-language fields can be plain English or a `{ en, zh-CN }` map; only a human moves `lifecycle` to `accepted` by filling in the `review` block.

3. **If the new promise needs a new module**, surface it to the human as an architecture change — that is a bigger move. Usually a new promise fits into an existing module under `tests/modules/`.

4. **Ask for human review when the meaning shifts.** Any change to `title`, `purpose`, `priority`, `boundary`, `given` / `when` / `then`, `observes`, or `lifecycle` is a review event — even if the test still passes. Do not approve a promise unilaterally: either the human fills the `review` block themselves in Studio, or you drive the review through `AskUserQuestion` (see [Driving the Review](#driving-the-review)) and only write the approval back to YAML after an explicit affirmative answer.

5. **Bind tests to the promise id.** Once a promise is accepted, write adapter tests that prove it, bound to the promise id from the YAML. For Vitest, existing tests in the workspace show the `scenarioTest(promiseId, name, fn)` shape. Other adapters should emit the same canonical promise id in their result metadata. Assert on what the promise's `observes` list names — DB state, UI text, files, events, exit codes — and prefer exact matchers (`toBe`, `toEqual`) over loose ones. If a test would weaken to "mock was called" or `toBeDefined()`, that is evidence drift; surface it in the PR rather than silently lowering the bar.

6. **Implement until the accepted promises pass.** Run `harness test` to confirm.

7. **Hand back at promise level.** See [Handoff](#handoff).

A passing Vitest test alone does not mean the promise is satisfied — it is only a runtime pass. Do not declare done after `vitest run`; declare done after `harness test` shows `Run Status: passing` for the promise you touched.

## Driving the Review

A promise stays `lifecycle: proposed` until a human reviews it. There are two surfaces for that:

- **Studio UI** — open Studio, pair the daemon, use the review panel. Best for batching, since you see canvas + neighbourhood + evidence at the same time.
- **Terminal-driven (this skill)** — Claude walks the human through pending promises one at a time using `AskUserQuestion`. Best when they'd rather stay in the terminal, when Studio isn't running, or when they want the agent to handle the bookkeeping.

When driving the review from the terminal:

1. **Pick the queue.** Find pending promises with `grep -rn "state: pending" tests/promises/`. Treat `lifecycle: changed_requires_review` promises as a separate queue — they need a re-review note explaining what changed.

2. **For each pending promise, present a readable summary** — id, priority, boundary, title, purpose, given/when/then, `failureMeaning`, `observes`. Quote the human-language fields exactly; don't paraphrase. Keep it scannable so the human can decide in seconds.

3. **Ask once, with three options**, via `AskUserQuestion`:
   - **通过 / pass** — approve it.
   - **改一下 / needs changes** — direction is right but content needs editing; pause to discuss the specific change before re-asking.
   - **不要这条 / reject** — drop the promise.

4. **Land the decision in YAML** (until a `harness studio review` subcommand exists, this is a direct edit; once it exists, prefer the CLI):

   For **approved**:

   ```yaml
   priority: P0
   boundary: integration
   lifecycle: accepted # proposed → accepted
   ...
   review:
     state: approved
     decidedBy: <user> # short handle, e.g. xinyao
     decidedAt: 2026-05-28 # plain YYYY-MM-DD is fine
     events:
       - action: approved
         by: <user>
         at: 2026-05-28
   ```

   For **changes_requested**: set `review.state: changes_requested`, append an event, leave `lifecycle` as it was, then iterate on the content with the human. Re-present and re-ask after editing.

   For **rejected**: set `review.state: rejected`, set `lifecycle: deprecated`, and remove the promise id from its module's `promises:` list. If anything bound a test to it, surface that as drift.

5. **Run `harness check` after each batch** to confirm the YAML still parses and module ↔ promise wiring stays consistent.

The agent is the conduit, not the authority — every transition must be confirmed by the human through `AskUserQuestion`. Never mark a promise approved without an explicit affirmative answer in the current chat.

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
