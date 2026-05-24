---
name: harness-promise-authoring
description: Author or change behavior in a project that uses this Test Harness. Use when drafting a `.promise.yaml`, binding a Vitest test with `scenarioTest`, adding a feature whose behavior a human will review, deprecating or renaming a promise, or fixing a `harness check` / `harness test` failure on a reviewed promise.
---

# Harness Promise Authoring

This skill teaches Agents how to draft Harness-friendly **promises** and **tests** so a human reviewer can understand what the system guarantees without reading every line of test code.

You do not need to know how the Harness is implemented internally. You only need to produce protocol artifacts and adapter evidence correctly:

- `.promise.yaml` files — the canonical record of one reviewable behavior commitment.
- Adapter tests bound to promise ids — the executable proof of those commitments.
- For the current TypeScript reference implementation, Vitest tests bind with `scenarioTest(promiseId, ...)`.

## The Mental Model

```text
Feature        ← navigation entry point (what part of the system)
  Promise      ← review unit (what the system guarantees) — canonical file
    Evidence   ← what proves the promise is still satisfied
      Adapter test ← the executable encoding
```

Humans review **promises**. Agents write **tests and code** that prove them. The promise file is the canonical source of meaning — the test is just executable evidence for it.

## Workflow

1. **Find the existing promise first.** Before changing or extending behavior, look in `promises/**/*.promise.yaml`. If one already covers what you are about to change, use it.
2. **Draft a new promise only if the behavior is genuinely new.** Each promise should describe one human-readable guarantee, not an implementation step.
3. **Ask for human review when the meaning shifts.** Any change to title, purpose, priority, boundary, Given / When / Then, observes, or lifecycle is a review event — even if the test still passes.
4. **Bind tests with `scenarioTest`.** Once a promise is accepted, write Vitest tests that prove it, and attach them to the promise id.
5. **Implement until the accepted promises pass.** Run `vp exec harness test` to confirm.
6. **Hand back to the human with promise-level status,** not test-level status. (See the [Handoff](#handoff) section.)

A passing Vitest test alone does not mean the promise is satisfied — it is only a runtime pass. The test must be readable, the evidence must still prove the promise, and any drift must be acknowledged. Do not declare done after `vp test`; declare done after `harness test` shows `Run Status: passing` for the promise you touched.

## Promise File Rules

Promises live in `promises/<module-area>/<slug>.promise.yaml`. Module areas use kebab-case and should match a code or product area, such as `cli`, `checkout`, or `validation`. Adapter-specific promises live under `promises/adapters/<adapter-name>/`. Use the existing files as templates; the minimal shape is:

```yaml
apiVersion: 1
id: checkout.payment.success_marks_order_paid
feature: Checkout / Payment
title: Successful payment marks the order as paid
purpose: Protect the operator's source of truth so a paid order is never displayed as unpaid.
priority: P0 # P0 / P1 / P2
boundary: integration # unit | integration | browser | e2e | adapter
lifecycle: proposed # proposed | accepted | implemented | changed_requires_review | deprecated

given:
  - A user has placed an order
when:
  - The payment provider confirms a successful charge
then:
  - The order status becomes "paid"
  - The user sees a success page

observes:
  - orders.status
  - success page UI

failureMeaning: A paid order may be displayed as unpaid, so the user retries and pays twice.

review:
  approvedBy: <name> # filled in after human approval
  approvedAt: "YYYY-MM-DD"
  approvedIn: <PR or commit reference>
```

Required rules:

- **`id` is permanent.** Once an id has been reviewed, never rename it. To replace it, create a new id and set `deprecatedBy` / `supersedes` on the relevant files. History stays readable.
- **`apiVersion` is the Harness protocol version.** Use `apiVersion: 1` for current promise files.
- **Slugs in `id` use lowercase dot notation:** `area.subarea.specific_behavior`. They are not human prose; do not translate them.
- **Machine fields stay untranslated:** `id`, `feature`, `priority`, `boundary`, `lifecycle`, `review`, `observes`.
- **Natural-language fields can be plain strings or bilingual maps.** Plain string = default English. To localize, use `{ en: "...", zh-CN: "..." }`. Bilingual is preferred for promises that will be reviewed by a Chinese-speaking team, but is not required.
- **`given` / `when` / `then` describe behavior, not steps.** "The order status becomes paid" is behavior. "Call `updateOrder({status: 'paid'})`" is implementation — wrong place.
- **`failureMeaning` explains what breaks for a human if the promise fails.** A reviewer should be able to read it and decide whether the priority is right.
- **`observes` lists the things assertions should touch** — UI text, DB fields, files, events, exit codes. Current reports display this as review context; future evidence checks can use it to flag weak proof.

Common mistakes:

- Putting implementation details in `then`. (Promises do not name functions.)
- Listing internal log strings in `observes`. (Logs are not user-visible evidence on their own; pair them with the user-facing outcome.)
- Setting `lifecycle: accepted` without explicit human approval. If the human has already reviewed and approved the promise in the current conversation or PR, include the review metadata.
- Editing an `id` to fix a typo. Make a new file with the correct id; mark the old one `deprecated` with `deprecatedBy`.

## Binding Tests With `scenarioTest`

The current reference adapter is Vitest. Its helper lives under `@test-harness/adapter-vitest`:

```ts
import { scenarioTest } from "@test-harness/adapter-vitest";

scenarioTest(
  "checkout.payment.success_marks_order_paid",
  "marks the order as paid when payment succeeds",
  async () => {
    const order = await placeOrder({ amount: 100 });
    await payOrder(order.id, { method: "card" });

    const stored = await orders.findById(order.id);
    expect(stored.status).toBe("paid");
    expect(screen.getByText("Payment successful")).toBeVisible();
  },
);
```

Rules:

- **`promiseId` is the exact `id`** from the `.promise.yaml`. A typo makes the result fail validation as an unknown promise id.
- **Do not re-state the promise inside the test.** Title, purpose, Given / When / Then, observes, priority — all of that lives in the YAML. The test body is just the executable proof.
- **One promise can have many tests.** A test should bind only to promises it actually proves; do not staple unrelated promise ids onto one test.
- **Plain `test(...)` / `it(...)` is still fine** for helper-function sanity checks. Those run in Vitest but are intentionally invisible to the promise report — they are not evidence for any reviewed promise.

### Observable Evidence

The Harness wants assertions a reviewer would still recognize as the promise:

- Assert on visible outcomes: returned data, DB state, file content, emitted events, UI text, exit codes.
- Match the `observes` list. If `observes` says `orders.status` and `success page UI`, your test should touch both.
- Prefer exact matchers (`toBe("paid")`, `toEqual({...})`) over loose ones (`toBeDefined()`, `toBeTruthy()`).
- When you must mock a downstream service, assert on **what your code did with the response** (state, output, event), not just that the mock was called. `expect(spy).toHaveBeenCalled()` alone is weak authoring evidence outside `boundary: adapter` tests; future evidence checks may flag it.
- Cover the failure mode the promise's `failureMeaning` describes. If failure means "order changes on failed payment," write a test that proves it does **not** change.

| Weak                                            | Why                               | Strong                                                                       |
| ----------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `expect(payOrder()).resolves.toBeDefined()`     | Any value passes.                 | `expect((await payOrder(id)).status).toBe("paid")`                           |
| `expect(processOrder).toHaveBeenCalledWith(id)` | Proves the call, not the outcome. | `expect(await orders.findById(id)).toMatchObject({ status: "paid" })`        |
| `expect(html).toContain("success")`             | Could match unrelated copy.       | `expect(screen.getByRole("status")).toHaveTextContent("Payment successful")` |
| `it.skip(...)` left after a refactor            | Silent loss of evidence.          | Delete or repair the test.                                                   |

### Boundary Discipline

A promise's `boundary` (`unit` / `integration` / `browser` / `e2e` / `adapter`) sets the scope its proof should live in. Do not silently move a test to a weaker boundary to make it cheaper — that is promise drift. If the boundary really should change, edit the `.promise.yaml`, set `lifecycle: changed_requires_review`, and explain in the PR.

## Drift Awareness

Two kinds of drift exist. Both need to surface in the PR, not in a passing-test message:

- **Promise drift** — the promise itself got weaker, narrower, less observable, or lower priority. Signals: `P0 → P1`, `browser → unit`, a `then` line removed, `observes` losing UI/DB/event entries, exact wording becoming vague. Every weakening drift needs a written reason and human acknowledgement.
- **Evidence drift** — the promise did not change, but the tests no longer prove it as strongly. Signals: `toBe("paid") → toBeDefined()`, removed UI / DB / event assertions, a test asserting only that a mock was called, a test becoming `skip` / `todo`, a test moving to a weaker boundary.

The first instinct when a test fails is to weaken the assertion. Resist it. If you find yourself doing that, write down what changed and surface it in the PR — that is the whole point of the system.

## Verifying Your Change

```bash
vp exec harness check    # promise files are well-formed
vp exec harness test     # runs vp test, collects .harness/results.yaml, renders the report
vp exec harness verify   # re-renders the report from existing results (faster)
```

What to look for in the report:

- Every promise you touched lists `Run Status: passing`.
- `Errors: 0` in the summary header.
- The Vitest output above the report shows the promise's tests ran.

Common failure modes:

| What you see                                                     | What it means                                                                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Your promise id is not in the report at all                      | There is no canonical `.promise.yaml` for that id, or the promise file failed to load.                                                   |
| `Run Status: unknown`                                            | The canonical promise exists, but no collected test result matched it. Check that a `scenarioTest` for that id ran under `harness test`. |
| `missing_test_result` warning                                    | An implemented promise has no collected test result. Add or repair the `scenarioTest` evidence before treating it as covered.            |
| `harness test` / `harness verify` flags `unknown_result_binding` | The `promiseId` in `scenarioTest` does not match any `.promise.yaml`. Fix the id or add the promise.                                     |
| `harness check` flags missing review approval                    | A promise is `lifecycle: accepted` but has no `review.approvedBy` / `approvedAt`. Either fill it in or move it back to `proposed`.       |

## Handoff

When you hand work back to a human, report at the promise level, not the test level:

- Which promises were **added**, **changed**, or **deprecated**, and why.
- Which promises still need **review** (anything currently `proposed` or `changed_requires_review`).
- Which tests bind to the changed promises.
- The `harness test` result for those promises (one line each: `id → Run Status`).
- Any **promise drift** or **evidence drift** the human should know about, with the reason and the affected ids.

A passing CI run is not the report. The promise report is.
