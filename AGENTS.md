# AGENTS.md

## Project Overview

This project is a foundation for a **Cucumber/Gherkin-based Test Harness**.

Its goal is not simply to run tests or increase coverage. The goal is to make behavior descriptions, Rule state metadata, and test evidence become a readable model of a software system, so humans can understand, review, and manage system behavior without reading every implementation detail.

The latest Harness model uses Cucumber's `Feature / Rule / Example / Given / When / Then` vocabulary as the behavior-description layer, then adds Harness-owned governance around it:

```text
Package
  Module
    Feature
      Rule
        Example
          Given / When / Then
```

`Feature`, `Rule`, `Example`, and steps are written as `.feature` files and parsed with the Cucumber/Gherkin ecosystem. `Package`, `Module`, Rule state, review history, locale policy, result normalization, and coverage are Harness responsibilities.

Feature files should follow the code tree so coverage spreads across packages, crates, skills, and other boundaries. The directory layout makes missing coverage easy to spot, while tags and YAML keep the identity and coverage counts trustworthy.

The central design principle is that humans should mainly review **behavior rules and examples**, not implementation code. If the reviewed behavior model is precise and the implementation satisfies it with executable evidence, the system can evolve with less line-by-line code review.

The project must become self-bootstrapping. Build a small seed Harness first, then use Harness behavior specs about this Harness project itself to drive the rest of the implementation.

## Current Rewrite Stage

This repository is currently in a semantic rewrite from the old promise-driven model to the Cucumber BDD model.

All new or touched Harness artifacts should follow the new model. Do not extend, polish, or preserve old promise-oriented workflows while implementing new behavior.

Use these canonical artifacts for new work:

```text
tests/harness.yaml
tests/harness.packages.yaml
tests/harness.modules.yaml
tests/harness.locales.yaml
features/**/*.feature
tests/harness.behavior.yaml
tests/harness.review-log.yaml
tests/harness.results.yaml
```

Old `.promises.yaml` files, `promiseId` bindings, promise report schemas, and promise-oriented UI concepts are legacy reference material only. Convert or delete them as the new Harness slices land.

After the rewrite is fully complete, all remaining Promise-era references should be removed so the repository reads as if the Promise model never existed.

## Compatibility Decision

Do **not** write compatibility code for old Harness shapes.

Unless the user explicitly asks for compatibility, new code must not support:

- `.promises.yaml` as a canonical behavior source
- `PromiseRecord` or `BehaviorPromise` as public protocol concepts
- `promiseId` as the canonical result or test binding
- `scenarioTest(promiseId, ...)` as the canonical bridge API
- old promise-oriented report schemas or fixtures
- old Promise pages in Studio
- hidden migration modes that accept both old and new formats

Old code and fixtures may be read as source material during direct rewrite work. They should not become a second supported protocol.

## Behavior Identity

Stable identity lives in tags, not natural-language titles.

Required tags:

```gherkin
@package:harness-project
@module:feature-registry
@feature:harness.feature-registry.scan-cucumber-features
@locale:en
Feature: Cucumber feature registry

  @rule:harness.feature-registry.hierarchy-tags
  Rule: Feature files declare Harness hierarchy tags

    @example:valid-feature-maps-to-hierarchy
    Example: A valid feature file maps to Harness hierarchy records
```

Rules:

- `@package:<id>` must point to a package manifest entry.
- `@module:<id>` must point to a module manifest entry.
- `@feature:<stable-id>` identifies the behavior feature.
- `@rule:<stable-id>` identifies the reviewable behavior rule.
- `@example:<stable-id>` identifies executable example evidence.
- `@locale:<code>` identifies the language of this `.feature` file.
- Example result identity is `featureTag + ruleTag + exampleTag`.
- Locale, file path, and line number are useful metadata, but not stable identity.

## Multilingual Policy

The Harness must support multilingual review.

For `.feature` files, use one file per review language because the whole Gherkin document is natural language:

```text
features/harness/crates/harness-project/feature-registry/cucumber-feature-registry.feature
features/harness/crates/harness-project/feature-registry/cucumber-feature-registry.zh-CN.feature
```

Localized `.feature` files for the same behavior reuse the same `@package`, `@module`, `@feature`, `@rule`, and `@example` tags. They differ by `@locale` and human-readable names or step body text.

Keep Gherkin structural keywords in English for every locale: `Feature`, `Rule`, `Example`, `Given`, `When`, `Then`, `And`, and `But`. Do not add `# language: zh-CN` just to switch keywords. Use `@locale:<code>` for language identity, and do not translate tags, ids, Rule state values, or result identifiers.

Harness-owned YAML files do **not** get duplicated per locale. Human-facing YAML fields use `LocalizedText`:

```yaml
apiVersion: 1
modules:
  - id: feature-registry
    title:
      en: Feature registry
      zh-CN: Feature 注册表
    description:
      en: Loads Cucumber feature files into the Harness project model.
      zh-CN: 将 Cucumber feature 文件加载为 Harness 项目模型。
    package: harness-project
```

A plain string is treated as default English. A language map such as `{ en, zh-CN }` carries translations. Stable machine fields such as `id`, `tag`, `package`, `module`, `state`, result identifiers, and file paths are never localized.

`tests/harness.locales.yaml` defines the locale policy:

```yaml
apiVersion: 1
sourceLocale: zh-CN
requiredLocales:
  - zh-CN
  - en
executionLocale: zh-CN
```

`harness check` should verify required locale coverage and structural parity: the same Feature, Rule, Example, and step order/intent must exist across required locales while Gherkin keywords remain English.

## Rule State And Review

Rule state is human governance, not run status.

A Rule can be `accepted` and currently failing, or `draft` and already passing. Persisted Rule state and computed run status must stay separate.

Allowed Rule state values:

- `draft`
- `proposed`
- `accepted`
- `changes_requested`
- `rejected`
- `deprecated`
- `superseded`

Do not introduce synonyms for the same Rule state. In particular, do not use `approved` as a stored state; human approval maps to `accepted`. Do not use `pending`; reviewable behavior is `proposed` or `changes_requested`.

Store Rule state outside `.feature` files, in `tests/harness.behavior.yaml`. Store accepted behavior changes, weakening, split, merge, deprecation, or supersession in `tests/harness.review-log.yaml`.

Agents can create `draft` or `proposed` Rules. Agents can mark a Rule `accepted` only when the human explicitly accepts it in the current conversation or review surface.

`.feature` acceptance is a hard gate. Do not write step definitions, executable tests, or implementation logic for a `.feature` until every touched Rule in that `.feature` is `accepted`, or until the current review surface gives explicit human acceptance.

Do not weaken, remove, or blur accepted high-priority behavior without explicit human acceptance and review-log history.

## Cucumber Ecosystem Policy

Reuse the Cucumber ecosystem wherever it already solves the problem.

Prefer:

- Gherkin syntax and official parsing instead of a custom `.feature` parser
- the Rust `gherkin` crate for core-side `.feature` scanning and validation
- the Rust `cucumber` crate ([cucumber-rs](https://cucumber-rs.github.io/cucumber/current/introduction.html)) as the first Rust execution engine behind a Harness bridge
- Cucumber runner behavior for matching steps to step definitions
- Cucumber Messages or supported formatter output as the raw execution event source
- Cucumber tag expressions for selecting packages, modules, features, rules, examples, locales, or review slices
- Cucumber hooks for setup and environment preparation
- Cucumber's undefined, pending, skipped, failed, and passed semantics for Example status

Do not fork Gherkin syntax, invent a parallel step runner, or build a custom parser unless the Cucumber ecosystem cannot provide the needed data.

Rust execution policy:

- Let cucumber-rs run `.feature` Examples and own its terminal/debugging output.
- Let `harness` own governance commands such as `check`, `test`, `report`, Rule state, locale, coverage, and evidence aggregation.
- Implement `harness test` as a thin orchestration layer over Cucumber execution, not as a replacement terminal runner.
- Express Harness execution selection as package/module/feature/rule/example/locale fields, then render those fields into `HARNESS_CUCUMBER_TAG_EXPRESSION` for language bridges and Cucumber engines.
- Rust bridges map `HARNESS_CUCUMBER_TAG_EXPRESSION` to cucumber-rs native `CUCUMBER_FILTER_TAGS`, `--tags`, or `TagOperation`.
- TypeScript bridges map `HARNESS_CUCUMBER_TAG_EXPRESSION` to Cucumber.js native `tags`, CLI `--tags`, or run configuration `sources.tagExpression`.
- Bridge entrypoints must apply the Harness tag expression before invoking real Cucumber execution such as cucumber-rs `World::run` or Cucumber.js `runCucumber`; helper-only mappings are not enough.
- Prefer cucumber-rs JSON/JUnit writers or a small custom Writer for machine evidence, then normalize into `tests/harness.results.yaml`.
- Use cucumber-rs CLI composition only when Harness-specific options must live beside Cucumber options.

## Long-Term Crate And Bridge Layout

Keep Harness core code separate from language-specific Cucumber bridges.

Core Harness crates live under `crates/`:

```text
crates/
  harness-protocol/
  harness-project/
  harness-runner/
  harness-cli/
  harness-daemon/
```

Language bridges live under `bridges/`:

```text
bridges/
  rust/
    cucumber-rs/
  typescript/
    cucumber-js/
```

The intended boundary is:

- `harness-protocol` owns stable cross-language schemas and result contracts.
- `harness-project` owns project loading, `.feature` scanning, manifests, Rule state, review logs, validation, coverage, and Studio snapshots.
- `harness-runner` owns orchestration across packages, modules, features, rules, examples, locales, and language bridges.
- `harness-cli` is a thin command-line surface over project and runner behavior.
- `harness-daemon` is the Studio/local API surface over project and runner behavior.
- `bridges/rust/cucumber-rs` converts cucumber-rs typed events into Harness protocol results.
- `bridges/typescript/cucumber-js` converts Cucumber.js Messages or formatter events into Harness protocol results.

Do not reintroduce old generic adapter crates or framework-specific Harness adapters such as Vitest/Jest/Rust-unit-test adapters as canonical evidence producers. New Harness behavior must be proven by corresponding Cucumber `.feature` files and Cucumber execution through a language bridge. Vitest, Jest, Cargo tests, Playwright, or other tools may be implementation details inside Cucumber step definitions, but they must not become separate outer test entrypoints for Harness behavior.

## What This Project Is Building

The project should evolve into a small but structured toolkit with these parts:

- **Feature Registry**: scans localized `.feature` files, extracts stable tags, and builds the behavior model.
- **Package/Module Registry**: stores architecture grouping above Cucumber `Feature`.
- **Locale Registry**: stores source locale, required locales, and execution locale.
- **Behavior State Registry**: stores canonical Rule state and review metadata.
- **Review Log**: stores append-only human acceptance and behavior drift history.
- **Protocol Schemas**: versioned YAML contracts for Harness-owned artifacts with `apiVersion: 1`.
- **Harness Runner**: orchestrates Cucumber execution across package, module, feature, rule, example, and locale slices.
- **Language Bridges**: convert language-specific Cucumber outputs into Harness results, such as cucumber-rs typed events or Cucumber.js Messages.
- **Result Collector**: writes unified YAML such as `tests/harness.results.yaml`.
- **Analyzer**: builds Package, Module, Feature, Rule, Example, Rule state, locale, risk, and failure-impact summaries.
- **Studio UX**: eventually exposes package overview, module detail, feature review, locale switching, Rule state, example evidence, run history, failures, and behavior coverage.
- **Agent Skill**: teaches Agents to author Harness-friendly Cucumber behavior, manifests, Rule state records, review-log entries, and executable evidence.

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

- Treat behavior Rules and Examples as first-class project artifacts.
- Treat Modules as reviewable architecture boundaries, not loose tags, folder mirrors, or UI groupings.
- Group Modules under Packages. A Package is organizational; Modules remain the reviewable architecture boundary inside it.
- Treat `.feature` files as the canonical source of reviewed behavior description.
- Treat `tests/harness.behavior.yaml` as the canonical source of Rule state and review metadata.
- Treat `tests/harness.review-log.yaml` as the canonical source of accepted behavior change history.
- Treat `protocol/v1/` as the cross-language contract. TypeScript Effect Schemas should match the protocol; they should not become the only source of truth.
- Prefer YAML for Harness-owned artifacts, including result files such as `tests/harness.results.yaml`. Use JSON only when an external tool or protocol makes it necessary.
- Persist `apiVersion: 1` in Harness-owned protocol YAML artifacts.
- Prefer self-bootstrapping steps. The first implementation should validate this Harness project itself before supporting external projects broadly.
- When adding a Harness capability, write or update `.feature` behavior, manifest entries, Rule state records, and review-log records first.
- Wait for explicit human acceptance of the touched `.feature` Rules before writing step definitions, executable tests, or implementation logic.
- Do not assume a passing test still proves a Rule. Track example evidence and preserve evidence deltas when tests are generated or edited.
- Prefer changes that improve human readability and reviewability.
- Keep implementation details subordinate to the reviewed behavior commitments.
- When adding Examples, make them concrete enough that a human can understand the behavior without reading implementation code.
- Before handoff, run the relevant Harness checks when available, especially `harness check` or `cargo run -p harness-cli -- check`.
