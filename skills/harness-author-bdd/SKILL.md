---
name: harness-author-bdd
description: Author or change Test Harness behavior using the Cucumber BDD rewrite model. Use when adding Harness features, onboarding behavior into the new Package/Module/Feature/Rule/Example hierarchy, writing or updating multilingual .feature files, locale records, Rule state records, review-log records, Cucumber result bindings, or self-bootstrapping Harness specs. Do not use old promise-driven .promises.yaml workflows.
---

# Harness BDD Authoring

Use this skill whenever an agent changes behavior in a Harness project after the Cucumber rewrite.

The agent's job is to make the human review and accept **behavior shape and Rule state**, then make code satisfy that reviewed behavior. Do not start from implementation code.

Hard gate: all `.feature` behavior that an agent will implement must be human-accepted first. In Harness terms, every touched Rule in those `.feature` files must have state `accepted`, or must receive explicit acceptance in the current review surface, before the agent writes step definitions, executable tests, or implementation logic. This exists to guarantee that a human reviews the feature behavior before work begins.

## Mental Model

```text
Package manifest
  Module manifest
    .feature file
      Feature tag
        Rule tag + Rule state record
          Example + executable result evidence
```

Cucumber owns `Feature / Rule / Example / Given / When / Then`.
Harness owns the user's project organization, stable tags, Rule state, review history, result normalization, and coverage.

Put feature files in a tree that mirrors the user's code and package boundaries. That makes coverage spread out across the real project shape, while tags and YAML keep the coverage identity trustworthy.

## Canonical Artifacts

Use these files as the target shape:

- `tests/harness.yaml` — runner config.
- `tests/harness.packages.yaml` — package list and package-to-module grouping.
- `tests/harness.modules.yaml` — module ownership, purpose, and covered paths.
- `tests/harness.locales.yaml` — source locale, required review locales, and execution locale.
- `features/**/*.feature` — Cucumber behavior descriptions.
- `tests/harness.behavior.yaml` — canonical Rule state and review metadata for Rule tags.
- `tests/harness.review-log.yaml` — append-only human review and drift history.
- `tests/harness.results.yaml` — normalized Cucumber Example results.

Do not create new `.promises.yaml` files. Do not bind new tests by `promiseId`.

## Rust Cucumber Execution

For Rust-backed Harness behavior, prefer the official Rust `cucumber` crate ([cucumber-rs](https://cucumber-rs.github.io/cucumber/current/introduction.html)) as the execution engine.

Do not reimplement cucumber-rs as a Harness runner. The best split is:

- cucumber-rs runs `.feature` Examples, matches step definitions, applies tag/name/input filters, handles concurrency/retry, and provides terminal output.
- `harness` validates manifests, Rule state, locales, and tag identity, then aggregates Cucumber execution into Harness evidence.
- `harness test` should start as a thin orchestration layer over cucumber-rs execution.
- Harness execution selection should be authored as package/module/feature/rule/example/locale fields and rendered to Cucumber tag expressions at the runner or bridge boundary. Use `HARNESS_CUCUMBER_TAG_EXPRESSION` when a bridge command needs the selected Cucumber tags.
- Rust bridges should map that value to cucumber-rs native `CUCUMBER_FILTER_TAGS`, `--tags`, or `TagOperation`; TypeScript bridges should map it to Cucumber.js `tags`, CLI `--tags`, or `sources.tagExpression`.
- Bridge entrypoints must apply that value before calling real Cucumber execution, for example before cucumber-rs `World::run` or Cucumber.js `runCucumber`. Do not stop at helper-only mappings.
- Use cucumber-rs JSON/JUnit writers, Tee-style multiple outputs, or a small custom Writer to collect machine-readable evidence.
- Add Harness-specific CLI options only for Harness concepts such as package, module, feature, rule, example, locale, Rule state, or review slice selection.

## Language Bridge Boundaries

When a Harness project needs to connect executable `.feature` files to a programming language, keep that integration in a language bridge boundary. The bridge converts that language's Cucumber execution output into Harness protocol results.

For this repository's rewrite, the long-term shape is:

```text
crates/
  harness-protocol/
  harness-project/
  harness-runner/
  harness-cli/
  harness-daemon/

bridges/
  rust/
    cucumber-rs/
  typescript/
    cucumber-js/
```

Apply the same principle in other projects: core Harness code owns protocol, project loading, validation, Rule state, review, runner orchestration, reports, and Studio data; bridges own language-specific Cucumber result conversion.

Do not create framework-specific Harness adapters as canonical evidence producers. New Harness behavior must be proven by corresponding Cucumber `.feature` files and Cucumber execution through a language bridge. Vitest, Jest, Playwright, Cargo tests, or other test tools may be reused inside step definitions as assertion libraries, fixtures, helpers, or temporary subprocesses, but they must not become separate outer test entrypoints for Harness behavior.

## Review Workflow

When the user asks to review Harness behavior, treat review as an interactive human decision loop, not as a one-shot summary.

Review one package at a time. Inside each package, walk module by module, then feature by feature, then Rule by Rule. For each item:

1. Read the relevant `.feature` file and required locale variant before asking for a decision.
2. Show the user the package, module, feature tag, locale, Rule state, and any existing evidence status.
3. Show the actual Gherkin review surface, not only a summary: Feature title, Background, each Rule tag and Rule title, every Example tag and Example title, and the exact Given/When/Then/And/But steps.
4. Relay the behavior text clearly enough that the user can accept or reject it without opening the file.
5. Ask for a decision before moving on to the next feature or Rule. Prefer an interactive ask-user tool when one is available, such as `request_user_input` in Plan mode. If no such tool is available, ask a concise plain-text question and wait for the user's reply.
6. Offer clear choices: accept, request changes, reject, deprecate, supersede, or update the feature text before review.
7. Do not infer acceptance from silence, a general positive reaction, or a broad statement like "looks good" unless it clearly names the feature/Rule or the current review batch.

If the user accepts a Rule, update `tests/harness.behavior.yaml` to state `accepted`, preserve review metadata such as reviewer, time, and note, and append a review-log event with action `accepted`. If the user requests changes or rejects it, set the Rule state to `changes_requested` or `rejected` and record the decision. If the user asks to update the feature text, edit the `.feature` files and locale variants first, then present the changed behavior for review again.

## Feature Intake Modes

A `.feature` is normally generated through one of two paths: either the human and agent discuss a need and the agent writes the corresponding feature from that discussion, or the agent reads existing code and derives a proposed feature from behavior that already exists.

Agents can create proposed `.feature` behavior through these two normal paths:

- **Discussion-first intake.** After the human and agent discuss a new need, the agent turns the agreed behavior shape into package, module, feature, Rule, Example, Rule state, and review-log artifacts before any implementation work.
- **Code-discovery intake.** When behavior already exists in code, the agent reads the relevant implementation, configuration, routes, UI, and existing executable paths, then drafts `.feature` files that describe the observed behavior for human review.

Both paths produce the same Harness artifacts and the same review gate. Code-discovery intake must not treat existing code as automatically correct. Mark inferred behavior as proposed, call out uncertainty or surprising behavior, and ask the human whether the observed behavior should be accepted, changed, deprecated, or rejected. Only accepted Rules become implementation-ready.

## Authoring Workflow

1. **Orient at the hierarchy level.** Find the owning package and module from the user's manifest files, existing `features/**/*.feature`, and the code paths being changed. Default to placing new feature files under a directory tree that mirrors the user's project tree and boundaries. If the boundary is unclear, propose the package/module change before writing behavior.

2. **Write or update the `.feature` first.** Every feature file must declare exactly one package tag, one module tag, one feature tag, and one locale tag at Feature level:

```gherkin
@package:harness-project
@module:feature-registry
@feature:harness.feature-registry.scan-cucumber-features
@locale:en
Feature: Cucumber feature registry
```

3. **Write Background as the feature's reason to exist.** Harness-authored `.feature` files should include a `Background` before the Rules. In this Harness convention, Background is the shared review context: why the feature exists, what human problem it protects, and what stable assumptions make every Rule meaningful. Keep it short, concrete, and written as executable-shaped `Given`/`And` steps. Do not use Background for implementation details.

4. **Use Rules as review units.** Every reviewed behavior commitment is a `Rule` with one stable `@rule:<id>` tag. Use `Example`, not `Scenario`, for human readability. Each Example must include one stable `@example:<id>` tag and Given, When, and Then.

```gherkin
  @rule:harness.feature-registry.hierarchy-tags
  Rule: Feature files declare Harness hierarchy tags

    @example:valid-feature-maps-to-hierarchy
    Example: A valid feature file maps to Harness hierarchy records
      Given a .feature file exists under the features directory
      When the Harness scans feature files
      Then it records the package, module, feature, rule, and example names
```

5. **Keep Rule state outside `.feature`.** Add or update `tests/harness.behavior.yaml` for every Rule tag. New rules start as `draft` while being shaped, or `proposed` when ready for human review. Only move a rule to `accepted` after explicit human acceptance in the current conversation or review surface. A `.feature` is implementation-ready only when every touched Rule in it has state `accepted`.

6. **Append review history.** Any accepted behavior change, weakening, split, merge, deprecation, or supersession needs an event in `tests/harness.review-log.yaml`. Preserve old and new meaning when behavior narrows or weakens.

7. **Write executable evidence only after acceptance.** Bind executable evidence to Cucumber Example identity, not a promise id. Do not add step definitions, separate unit tests, integration tests, Vitest, Jest, Cargo tests, or implementation logic for a `.feature` until its touched Rules are human-accepted. If those tools are useful after acceptance, invoke them from step definitions or supporting helpers behind the corresponding Cucumber Example. The canonical identity is:

```text
featureTag + ruleTag + exampleTag
```

Locale, file path, and line number are useful debug metadata but not the stable identity.

8. **Implement only after feature acceptance.** Code changes should satisfy accepted Rules. If a `.feature` or Rule is still `draft`, `proposed`, `changes_requested`, or `rejected`, stop before writing tests or implementation logic and hand it back for human review. Avoid placeholder assertions such as `toBeDefined()` or "mock was called" unless the Rule explicitly observes that bridge boundary.

9. **Verify through Harness commands.**

```bash
harness check
harness test
harness report --summary
```

Use the repository's wrapper if `harness` is not on PATH, for example `cargo run -p harness-cli -- check`.

## Language Rules

Stable tags are never localized. Gherkin structural keywords stay English in every locale: `Feature`, `Rule`, `Example`, `Given`, `When`, `Then`, `And`, and `But`. Human-readable names and step body text may be translated.

Harness-owned YAML files do not get duplicated per locale. Use `LocalizedText` for human-facing strings:

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
    features:
      - tag: "@feature:harness.feature-registry.scan-cucumber-features"
        title:
          en: Scan Cucumber feature files
          zh-CN: 扫描 Cucumber feature 文件
```

Use `LocalizedText` for titles, descriptions, notes, and other human-facing text. Keep ids, tags, package/module references, Rule state values, result identifiers, and file paths language-neutral.

Use one `.feature` file per review language when the behavior needs to be available in multiple languages:

```text
features/harness/crates/harness-project/feature-registry/cucumber-feature-registry.feature
features/harness/crates/harness-project/feature-registry/cucumber-feature-registry.zh-CN.feature
```

Localized files for the same behavior reuse the same machine tags:

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
      Given a .feature file exists under the features directory
      When the Harness scans feature files
      Then it records the package, module, feature, rule, and example names
```

```gherkin
@package:harness-project
@module:feature-registry
@feature:harness.feature-registry.scan-cucumber-features
@locale:zh-CN
Feature: Cucumber feature registry

  @rule:harness.feature-registry.hierarchy-tags
  Rule: Feature 文件声明 Harness 层级 tags

    @example:valid-feature-maps-to-hierarchy
    Example: 有效 feature 文件会映射成 Harness 层级记录
      Given features 目录下存在一个 .feature 文件
      When Harness 扫描 feature 文件
      Then 它会记录 package、module、feature、rule 和 example 名称
```

`tests/harness.locales.yaml` should define:

```yaml
apiVersion: 1
sourceLocale: zh-CN
requiredLocales:
  - zh-CN
  - en
executionLocale: zh-CN
```

Do not add `# language: zh-CN` just to switch Gherkin keywords. Use `@locale:<code>` to identify the review language, keep Gherkin keywords in English, and translate only names and step body text. Reusing the same `@feature`, `@rule`, and `@example` tags across locale files is expected. Do not translate tags, ids, Rule state values, or bridge result identifiers.

When updating one locale, update the other required locales in the same change or leave a visible stale-translation note. The source locale is the version humans use to accept meaning when translations disagree.

## Rule State Rules

Allowed Rule state values:

- `draft` — not ready for review.
- `proposed` — ready for human review.
- `accepted` — human accepted; may pass or fail at runtime.
- `changes_requested` — human requested changes before implementation.
- `rejected` — human rejected this behavior.
- `deprecated` — no longer canonical.
- `superseded` — replaced by another Rule.

Do not introduce synonyms for the same state. In particular, do not use `approved` as a stored state; human approval maps to `accepted`. Do not use `pending`; reviewable behavior is `proposed` or `changes_requested`.

Run status is computed from results and never stored as Rule state.

## Check Before Handoff

Before handing work back:

- `harness check` should show zero errors.
- Every touched `.feature` file has package/module/feature/locale tags.
- Every touched Harness YAML title/description/note that a human will read uses `LocalizedText` when multiple review languages are configured.
- Every touched Rule has an `@rule` tag and Rule state record.
- Every touched Rule that has step definitions, executable evidence, or implementation code has state `accepted`.
- Every touched Example has an `@example` tag.
- Required locale files are present or explicitly marked as stale/missing.
- Every accepted Rule change has a review-log event.
- New tests bind to `featureTag + ruleTag + exampleTag`, not `promiseId`.

## Handoff

Report in this order:

1. Packages/modules touched.
2. Features, Rules, Examples, and locales added or changed.
3. Rule state for each Rule.
4. Examples that now provide or need executable evidence.
5. `harness check`, `harness test`, and `harness report --summary` results.
6. Remaining draft/proposed Rules needing human review.
