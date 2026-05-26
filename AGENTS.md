# AGENTS.md

## Project Overview

This project is a foundation for a **promise-driven Test Harness**.

Its goal is not simply to run tests or increase coverage. The goal is to make tests and test metadata become a readable model of a software system, so humans can understand, review, and manage system behavior without reading every implementation detail.

The Harness should be **protocol-first and language-agnostic**. Canonical promises and result files are stable YAML artifacts with `apiVersion: 1`. The current repository provides a TypeScript reference implementation and a Vitest adapter; future implementations, including a Rust rewrite, should be judged by whether they satisfy the same protocol promises and fixtures.

In this project, a test represents a **promise**: a human-readable behavior commitment that describes what a feature must guarantee, why that guarantee matters, what boundary it belongs to, and what observable evidence proves that it still works.

The intended workflow is:

1. A human and an Agent discuss a new feature.
2. They identify the promises behind that feature.
3. The Agent drafts promise metadata and test intent before writing implementation code.
4. The human reviews and approves the promise.
5. The Agent writes tests and implementation logic until the application satisfies the approved promise.
6. The Harness runs the application and automated tests, collects evidence, and maps results back to promise ids.
7. Future changes update, split, merge, or deprecate promises through the same review flow.

The central design principle is that humans should mainly review **promises**, not implementation code. If the approved promises are precise and the implementation satisfies them, the system can evolve with less line-by-line code review.

The project must become self-bootstrapping. Build a small seed Harness first, then use promises about this Harness project itself to drive the rest of the implementation.

## What This Project Is Building

The project is expected to evolve into a small but structured toolkit with these parts:

- **Seed Harness**: the smallest self-hosting loop for storing this project's promises, collecting adapter results by promise id, and reporting readable promise status.
- **Agent Skill**: guidance for Agents writing Harness-friendly tests.
- **Promise Registry**: persistent metadata for promises, review state, lifecycle status, and change history.
- **Protocol Schemas**: versioned YAML contracts for promise files, result files, reports, and CLI behavior.
- **Vitest Adapter**: `scenarioTest(...)` and reporter support for turning Vitest test outcomes into Harness result YAML.
- **Quality Checker**: static checks for readable test structure, stable metadata, Chinese test purpose, boundary, priority, and observable assertions.
- **Application Test Orchestration**: run or connect to an application, execute the configured adapter, and collect evidence.
- **Result Collector**: convert adapter output into unified YAML keyed by promise id.
- **Analyzer**: build feature maps, promise review maps, risk maps, and failure impact summaries.
- **UX**: eventually expose feature discussion, promise review, run history, failures, and behavior maps as a human-facing workflow.

## Documentation Rules

Project documentation defaults to English.

Every English Markdown document should have a corresponding Chinese translation using the same base filename with a `.zh-CN.md` suffix.

Examples:

```text
docs/design/test-harness-design.md
docs/design/test-harness-design.zh-CN.md
```

Design and planning documents should live under `docs/`, grouped by purpose. Keep root `AGENTS.md` and root `README.md` in place because tools and repository hosts expect those entry files there.

When updating documentation, keep the English and Chinese versions aligned.

## Agent Working Notes

- Treat promises as first-class project artifacts.
- Treat modules as the first visible layer of project architecture. A module is a reviewable architecture boundary, not a loose tag, folder mirror, or UI grouping. Agent-authored modules must start from the project's architecture and ownership model.
- Treat `.promises.yaml` files as the canonical source of reviewed behavior promise meaning. `scenario(...)` in tests should bind to a promise id, not redefine the promise.
- Treat `protocol/v1/` as the cross-language contract. TypeScript Effect Schemas should match the protocol; they should not become the only source of truth.
- Prefer YAML for Harness-owned artifacts, including result files such as `.harness/results.yaml`. Use JSON only when an external tool or protocol makes it necessary.
- Persist `apiVersion: 1` in Harness-owned protocol YAML artifacts.
- Natural-language promise fields use `LocalizedText`: a plain string is treated as default English, while a language map such as `{ en, zh-CN }` can provide optional translations. Prefer bilingual `en` and `zh-CN` text for seed self-promises, but do not localize stable machine fields such as `id`, `priority`, `boundary`, `lifecycle`, `review`, or `observes`.
- Split persisted lifecycle from computed run status. A promise can be `accepted` and currently `failing` at the same time.
- Avoid bare `Promise` in code because it conflicts with JavaScript `Promise`; prefer `BehaviorPromise`, `PromiseRecord`, and `promiseId`.
- When defining data contracts or public shapes, prefer Effect Schema over TypeScript interfaces so runtime validation and static types stay aligned. Use plain interfaces only when a schema would add no value or is technically impractical.
- Preserve promise id history. Renaming a promise means creating a new id and deprecating or superseding the old id.
- Prefer self-bootstrapping steps. The first implementation should validate this Harness project itself before trying to support external projects broadly.
- When adding a Harness capability, write or update promises for that capability first.
- Treat promise drift as a first-class review object. If a promise becomes weaker, narrower, less observable, or lower priority, preserve the old text, new text, initiator, reason, timestamp, and human acknowledgement state.
- Do not assume a passing adapter test still proves a promise. Track N:M promise-to-test evidence mappings, capture assertion fingerprints, and preserve evidence deltas when tests are generated or edited.
- For the seed Harness, use PR-based review metadata and allow checker warnings until the checker itself is accepted.
- Keep adapter details under adapter-specific code and promises, such as `tests/promises/adapters/vitest/`.
- Prefer `vitest run` for the current Vitest adapter and CI execution so test commands exit deterministically.
- Use Vitest reporters, projects, annotations, browser mode, and Node API when working specifically on the Vitest adapter.
- Do not weaken, remove, or blur high-priority promises without explicit human approval.
- Prefer changes that improve human readability and reviewability.
- Keep implementation details subordinate to the approved behavior commitments.
- Preserve lifecycle and review history whenever possible.
- When adding examples, make them concrete enough that a human can understand the behavior without reading implementation code.
