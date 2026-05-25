---
name: harness-onboard-project
description: Introduce this Test Harness to an existing codebase for the first time — propose a module structure, then promise groups, then evidence. Use when adopting the harness in a fresh project, scanning an unfamiliar repo for reviewable behavior, producing an initial module + promise map, or when the project has no `*.promises.yaml` files yet. Do not use for routine feature work (use `harness-add-feature`) or for diagnosing command failures (use `harness-troubleshoot`).
---

# Onboarding the Harness to an Existing Project

This skill is for the **first time** a Harness lands in a project. The output is an initial layer of `modules/*.module.yaml` files, grouped `promises/**/*.promises.yaml` files, and adapter evidence bindings — enough that a human can review the project top-down without reading every line of code.

You do not implement new behavior here. You **describe what is already there** in promise-shaped form, using existing files in `promises/` / `modules/` (if any) as shape templates. New behavior is a follow-up that runs through the `harness-add-feature` skill.

## The Mental Model

```text
Architecture        ← project-wide overview (not yet implemented)
  Module            ← one reviewable area a human could own — modules/*.module.yaml
    Promise group   ← related behavior commitments — promises/**/*.promises.yaml
      Promise       ← one behavior commitment inside the file's `promises:` list
        Evidence    ← adapter test results
```

Onboarding is top-down: **architecture → module → promise → evidence**. Each step is a separate review event. Do not skip ahead.

## Workflow — Three Phases, Hand to Human Between Each

### Phase 1 — Propose the module list

1. Scan top-level project documentation (`README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/`) and the top-level code layout (`packages/`, `apps/`, `src/`, etc.). List the candidate reviewable areas.
2. If any `*.promises.yaml` files already exist, collect their promise ids and `feature:` strings.
3. Propose a candidate module list. For each candidate, write one sentence: what area it covers, roughly how many promises it would hold, what the review audience looks like.
4. Call out boundary calls you are unsure about, e.g. "this area could be one module or two because…".
5. **Stop. Hand to the human for review.** Do not write any `.module.yaml` files yet.

Prefer **more modules over fewer** — module ids are permanent (same rule as promise ids), and splitting later is expensive while merging is cheap.

### Phase 2 — Propose the promises per module

Only after the module list is approved:

1. For each approved module, identify the **promises** that describe the area's actual behavior from a human's perspective. One promise = one reviewable guarantee, not an implementation step.
2. For each promise, draft `title`, `purpose`, `priority`, `boundary`, `given` / `when` / `then`, `observes`, `failureMeaning`. Leave `lifecycle: proposed` and `review` empty — the human fills those in.
3. Where possible, point at existing tests in the project that _already_ prove this promise, even if they are not yet bound with `scenarioTest`.
4. **Stop. Hand to the human for review** of the promise list. The human decides which to accept, edit, or drop.

### Phase 3 — Write the files and bind tests

Only after the promise list is approved:

1. Write `modules/<id>.module.yaml` per approved module — bilingual `title` / `summary` / `purpose`, explicit `promises:` id list.
2. Write `promises/<area>/<group>.promises.yaml` files with `apiVersion: 1` and a top-level `promises:` list. Keep related promises together when they share a review owner and split groups when the behavior area or implementation stack differs.
3. Bind tests to canonical promise ids. For Vitest use `scenarioTest(promiseId, ...)`; for other adapters emit the same id in adapter result metadata. If an existing test already proves a promise, wrap it. If not, write one. Assert on what the promise's `observes` list names — DB state, UI text, files, events, exit codes. Prefer exact matchers over loose ones; `expect(mock).toHaveBeenCalled()` alone is weak evidence outside `boundary: adapter`.
4. Run `harness check` and `harness test` — confirm every accepted promise lists `Run Status: passing`. (Invoke via your project's usual CLI wrapper if `harness` is not on PATH directly: `npx harness ...`, `pnpm harness ...`, etc.)
5. Hand back at module level (see [Handoff](#handoff)).

## Common Pitfalls

- **Skipping Phase 1 review** — going straight to writing module YAML before the human has agreed which modules exist. The human's most valuable input is at the module-shape level; do not bury it.
- **Inventing promises that no code currently proves** — onboarding describes existing behavior. New behavior runs through `harness-add-feature` afterwards.
- **Creating one file per promise by habit** — prefer grouped `*.promises.yaml` files so related review units stay readable together.
- **Over-fine module split with single-sentence summaries** — if you find yourself writing the same `summary` twice, those are one module.
- **Copy-pasting promise titles into module `summary`** — a module's summary should add navigation context, not duplicate what promise titles already say.
- **Setting `lifecycle: accepted` on the promises you draft** — only the human can do that. Default to `proposed`; the human fills in `review.approvedBy` / `approvedAt`.

## Handoff

Report at the module level, then the promise level:

- Which modules were proposed and accepted, with promise counts and one-line rationale each.
- Which promises were drafted under each module, grouped by module.
- Which tests now bind to each promise (or which promises still need test evidence).
- `harness test` results for the accepted promises (one line each: `id → Run Status`).
- Any boundary calls you flagged in Phase 1 that the human should re-confirm now that the files exist.
- Any promises currently `proposed` or `changed_requires_review` that still need the human's review/approval.
