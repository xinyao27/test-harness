# Test Harness Design

> Status: Design draft v2
> Goal: Build a Vitest-first, promise-driven Test Harness where humans review behavior promises and Agents implement code that satisfies those promises.

## Documentation Convention

Project documentation defaults to English. Every English Markdown document must have a corresponding Chinese translation using the same base filename with a `.zh-CN.md` suffix.

Example:

```text
test-harness-design.md
test-harness-design.zh-CN.md
```

## 1. What This Is

This project is a **promise-driven Test Harness** built on top of Vitest.

It is not trying to replace Vitest. Vitest already does the hard work of discovering tests, running tests, showing failures, providing reporters, supporting projects, Browser Mode, coverage, and the Node API.

This Harness adds the layer Vitest does not provide:

- human-readable behavior promises
- promise review and approval
- promise lifecycle history
- quality rules for Agent-written tests
- promise drift and evidence drift detection
- result and evidence mapping back to promises
- a UX for continuous promise iteration

The core idea:

```text
Humans review promises.
Agents write tests and implementation.
Vitest runs the executable checks.
The Harness maps results back to approved promises.
```

## 2. Architecture At A Glance

```text
Human + Agent
  -> discuss feature intent
  -> draft behavior promises

Promise Workspace
  -> review / approve / request changes
  -> track lifecycle and drift

Promise Registry
  -> store promises, review state, history, drift records

Vitest Tests
  -> encode promises as executable evidence
  -> use scenario bindings

Vitest Runner / UI / Reporters
  -> run tests, browser checks, coverage, reports

Result + Evidence Collector
  -> collect pass/fail, logs, screenshots, DOM/state/file evidence

Analyzer
  -> build feature map, promise map, evidence coverage, risk map

Promise Review Console
  -> show promises, review queues, drift, evidence, failures, run history
```

Vitest owns execution. The Harness owns promise meaning.

## 3. Development Workflow

1. Human and Agent discuss a feature.
2. Agent drafts the feature's behavior promises.
3. Human reviews the promises, not implementation code.
4. Approved promises become stable behavior commitments.
5. Agent writes Vitest tests and implementation logic.
6. Vitest runs the checks.
7. Harness maps test results and evidence back to promise ids.
8. Future changes update, split, merge, or deprecate promises through review.
9. Promise drift and evidence drift require explicit human attention.

The desired outcome is that humans can mostly review **what the system promises**, while Agents handle **how the code satisfies those promises**.

## 4. Self-Bootstrapping Strategy

This Harness should be built by using itself as early as possible.

The first implementation should be a small **seed Harness**, not the full final system. Its job is to make the project self-hosting:

```text
Seed Harness
  -> store promises for this Harness project
  -> attach scenario bindings to Vitest tests
  -> run Vitest
  -> collect results by promise id
  -> check basic readability and evidence rules
  -> report which Harness promises pass, fail, or need review
```

After that seed exists, every major part of the Harness should be developed through promises about the Harness itself:

```text
build minimal Harness capability
  -> write promises for the next Harness capability
  -> review those promises
  -> implement tests and logic
  -> run the Harness against itself
  -> use failures and drift records to guide the next iteration
```

The detailed MVP plan lives in [mvp-seed-harness-design.md](mvp-seed-harness-design.md).

## 5. Core Terms

### Human Management Model

Tests will grow large over time. Humans should not manage the system by reading test files directly.

The human-readable management hierarchy is:

```text
Feature
  -> Promise
    -> Evidence
      -> Vitest Tests
```

Features are the navigation entry point. Promises are the review unit. Evidence explains why a promise is still trusted. Vitest tests are the executable encoding underneath.

Default UX should summarize stable green promises and highlight only what needs attention:

```text
Needs Review
Changed
Drifted
Failing
Missing Evidence
Weak Evidence
P0 / P1
```

The goal is that a human reads this:

```text
Checkout / Payment

P0  Successful payment marks order as paid
    Status: passing
    Evidence: order.status, success page UI, payment event

P0  Failed payment preserves unpaid order
    Status: failing
    Failure meaning: user may think payment failed but order changed

P1  Payment retry does not duplicate charge
    Status: evidence drift
    Missing evidence: charge id uniqueness no longer asserted
```

before reading any test implementation.

### Promise

A **promise** is a human-readable behavior commitment.

In code and schemas, avoid the bare name `Promise` because this is a Vitest / Node project and `Promise` already means JavaScript `Promise`. Prefer explicit names:

```text
BehaviorPromise
PromiseRecord
promiseId
```

Example:

```text
When payment succeeds, the order becomes paid and the user sees a success page.
```

A promise should explain:

- what behavior is guaranteed
- why it matters
- its priority
- its boundary
- the Given / When / Then behavior
- what observable evidence proves it
- what failure means

Promise files are the canonical source of truth for reviewed behavior commitments. A promise rename is not a silent id edit: create a new id and deprecate the old one so history stays readable.

Promise state should be split into review lifecycle and computed run state:

```ts
type PromiseLifecycle =
  | "proposed"
  | "accepted"
  | "implemented"
  | "changed_requires_review"
  | "deprecated";

type PromiseRunStatus =
  | "unknown"
  | "passing"
  | "failing"
  | "skipped"
  | "missing_evidence"
  | "evidence_drifted";
```

`lifecycle` is persisted in promise files. `runStatus` is computed by the collector from the latest Vitest run and evidence checks.

### Scenario

A **scenario** is the test-side metadata that connects executable tests back to promises.

`scenario(...)` is not the canonical promise definition. It should bind a Vitest test to an existing `promiseId`. If local metadata conflicts with the canonical promise file, the Harness should report drift or invalid metadata.

Minimal Vitest-side shape:

```ts
scenario({
  id: "checkout.payment.success_marks_order_paid",
  evidence: ["orders.status", "success page UI"],
});
```

The full title, priority, boundary, Given / When / Then, and review lifecycle live in the promise file.

### Evidence

**Evidence** is what proves a promise is satisfied.

Examples:

- return value
- database row
- file content
- emitted event
- visible UI text
- DOM state
- screenshot
- log or trace
- error type

The Harness should prefer observable evidence over mock-call-only assertions.

`observes` in a promise file is the expected evidence claim. Vitest assertions are the actual executable evidence. The Harness should map each important `observes` item to at least one assertion, explicit evidence tag, or captured assertion fingerprint.

### Promise Drift

**Promise drift** means the promise itself changed.

It is not automatically bad. Product behavior can change. But promise drift must be visible and reviewable because it changes what the system claims to guarantee.

Example:

```text
Old promise:
When payment succeeds, the order becomes paid and the user sees a success page.

New promise:
When payment succeeds, the system processes the order.
```

This is weaker because it removed the exact paid status and the user-visible success page.

Common promise drift signals:

- priority goes down: `P0 -> P1`
- boundary gets weaker: `browser/e2e -> unit`
- `then` removes an important outcome
- `observes` removes UI, database, file, or state evidence
- Given scope narrows
- exact behavior becomes vague wording
- user-visible behavior disappears
- error handling or edge cases are removed

Every weakening drift should create a drift record:

```text
old promise
new promise
drift type
initiator: human / agent / tool
reason
timestamp
human acknowledgement state
```

### Evidence Drift

**Evidence drift** means the promise did not change, but the tests no longer prove it as strongly.

Example promise:

```text
When payment succeeds, the order becomes paid and the user sees a success page.
```

Old evidence:

```ts
expect(order.status).toBe("paid");
expect(screen.getByText("Payment successful")).toBeVisible();
```

New evidence:

```ts
expect(payOrder()).resolves.toBeDefined();
```

The test may still pass, but it no longer proves that the order became paid or that the user saw the success page.

Common evidence drift signals:

- exact assertion becomes broad: `toBe("paid") -> toBeDefined()`
- state assertion is removed
- UI assertion is removed
- database/file/event assertion is removed
- test asserts only that a mock was called
- business logic is mocked instead of external IO
- test becomes `skip`, `todo`, or unreachable
- test boundary changes to a weaker level without review
- evidence listed in `observes` is no longer asserted

Evidence drift should create an evidence delta:

```text
evidence added
evidence removed
evidence weakened
evidence changed
promises affected
tests affected
requires human review: yes / no
```

The seed Harness should implement a deterministic Evidence Drift v1 by recording an assertion fingerprint per scenario:

```text
matcher names
asserted symbols
asserted literals
observed targets
explicit evidence tags
```

Example fingerprint:

```text
scenario: checkout.payment.success_marks_order_paid
assertions:
  - target: order.status
    matcher: toBe
    literal: paid
  - target: screen.getByText
    matcher: toBeVisible
    literal: Payment successful
```

When fingerprints change, the Harness can show an evidence delta before any AI-based drift classification exists.

Simple distinction:

```text
Promise drift:
  The target changed.

Evidence drift:
  The target stayed the same, but the proof got weaker.
```

## 6. Vitest-First Design

Use Vitest for:

- test discovery
- test execution
- watch and run mode
- assertions and matchers
- mocks and fixtures
- test projects
- Browser Mode
- reporters
- coverage
- UI
- Node API

Use the Harness for:

- promise metadata
- human review state
- promise lifecycle history
- promise drift records
- evidence mapping
- evidence drift detection
- quality checks
- result normalization by promise id
- feature and risk maps
- Promise Review Console UX

## 7. Readability And Manageability Rules

The Harness must make tests readable by changing the unit of management from test files to promises.

Rules:

1. Humans navigate by feature, not by file path.
2. Humans review promises, not test implementation first.
3. Promise cards show only title, priority, boundary, lifecycle, run status, Given / When / Then, observable evidence, and failure meaning by default.
4. Test code is available as drill-down detail, not the first screen.
5. Stable passing promises are summarized; review attention goes to changed, failing, drifted, weak, or missing-evidence promises.
6. Every promise must map to observable evidence.
7. Every important evidence item should map to one or more Vitest assertions.
8. The checker must reject unreadable or unmanageable tests, including vague names, missing purpose, missing Given / When / Then, missing observes, and mock-call-only assertions outside adapter boundaries.
9. Promise files are canonical; scenario bindings in tests must not silently redefine reviewed promise meaning.
10. Change views should show new promises, removed promises, renamed promises, weakened promises, evidence removed, and failing accepted promises since the last review.
11. UI badges must qualify drift as either Promise Drift or Evidence Drift.

This keeps the system manageable even when the number of tests grows.

## 8. Harness Pass

A test passing Vitest is only a **Runtime Pass**.

A promise passing the Harness requires:

```text
Runtime Pass
  Vitest checks pass.

Quality Pass
  The test is readable, structured, and meaningful.

Evidence Pass
  Current evidence still proves the accepted promise.

Review Pass
  Any promise drift or evidence drift has been acknowledged.
```

## 9. UX Shape

The product UX should be a **Promise Review Console**, not a generic test dashboard.

Recommended layout:

```text
Left
  Feature tree
  Promise board by lifecycle status

Center
  Selected promise
  Review controls
  Promise diff
  Promise Drift records
  Evidence Drift records
  Evidence coverage
  History

Right
  Vitest UI / report
  Run results
  Logs
  Screenshots
  DOM / state / file evidence
```

Important UX questions:

- What does this system promise?
- Which promises need review?
- Which promises changed?
- Which promises were weakened?
- Which tests are green but no longer prove the accepted promise?
- Which assertion fingerprints changed since the last accepted review?
- Which approved promises are failing?
- Which feature changes affected which promises?
- Can I run the relevant Vitest checks now?

## 10. MVP

Build the smallest version that preserves the core model. The detailed seed plan is in [mvp-seed-harness-design.md](mvp-seed-harness-design.md).

1. **Seed Harness**
   Create the smallest self-hosting loop: promise storage, Vitest scenario bindings, result collection by promise id, and a readable report for this Harness project itself.

2. **Agent authoring skill**
   Teach Agents how to draft Harness-friendly promises and tests.

3. **Promise registry**
   Store promises, lifecycle state, review state, history, and drift records.

4. **Vitest scenario helper**
   Provide `scenario(...)` metadata for Vitest tests.

5. **Quality and drift checker**
   Check canonical metadata, scenario bindings, readable structure, Chinese test purpose, boundaries, observable assertions, promise drift, evidence drift, and assertion fingerprint changes.

6. **Evidence mapper**
   Track N:M mappings between promises, tests, and evidence.

7. **Vitest result collector**
   Read Vitest reporter output or Node API results and normalize results by promise id.

8. **Minimal Promise Review Console**
   Show promise review state, run results, drift records, and evidence coverage.

## 11. Success Criteria

This Harness is successful when:

1. Humans can understand the system through promises.
2. Humans mainly review promises, not implementation code.
3. Agents write tests that are readable and reviewable.
4. Vitest results map clearly back to approved promises.
5. Promise drift cannot happen silently.
6. Evidence drift cannot hide behind green tests.
7. The Harness can use its own promises and Vitest checks to validate its core behavior.
8. Feature and risk maps can be generated from promises, tests, and evidence.
