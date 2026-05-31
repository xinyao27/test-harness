# Cucumber BDD Rewrite Plan

> Status: Planning draft
> Goal: Rewrite the Harness around Cucumber-style `Feature / Rule / Example` while keeping useful infrastructure and dropping all legacy promise-schema compatibility.

## Decision

Use a **spine-preserving rewrite**.

Keep the useful engineering spine:

- Rust workspace, CLI command structure, and validation/reporting patterns
- normalized result collection into `tests/harness.results.yaml`
- localized text helpers
- daemon pairing, project access, file opening, and agent PTY plumbing
- Studio app shell and reusable UI components

Rewrite the semantic core:

- protocol schemas
- registries
- report model
- self-harness artifacts
- agent skills
- Cucumber runner and language bridge model
- Studio data model

## Compatibility Policy

No compatibility layer.

The rewrite must not support old canonical shapes:

- no `.promises.yaml` reader
- no `PromiseRecord`
- no `promiseId` result binding
- no `scenarioTest(promiseId, ...)` as the canonical bridge API
- no promise-oriented report schema
- no legacy Promise pages in Studio
- no hidden migration mode that accepts both old and new files

Old files can be used as reference material while rewriting, but the new Harness should accept only the new protocol artifacts.

## Target Model

```text
Package
  Module
    Feature
      Rule
        Example
          Given / When / Then
```

Cucumber owns the behavior-description layer from `Feature` down. Test Harness owns the organization, review, lifecycle, coverage, and reporting layer above and around Cucumber.

## Target Workspace Layout

Keep Harness core crates separate from language-specific Cucumber bridges.

Core Harness crates:

```text
crates/
  harness-protocol/
  harness-project/
  harness-runner/
  harness-cli/
  harness-daemon/
```

Language bridges:

```text
bridges/
  rust/
    cucumber-rs/
  typescript/
    cucumber-js/
```

Long-term responsibilities:

- `harness-protocol` owns stable cross-language schemas, manifests, runner contracts, and normalized result types.
- `harness-project` owns project loading, `.feature` scanning, package/module/locale manifests, lifecycle, review logs, validation, coverage, reporting snapshots, and Studio-facing project data.
- `harness-runner` owns execution orchestration. It selects package/module/feature/rule/example/locale slices, generates Cucumber tag expressions, invokes language bridges, and merges normalized results.
- `harness-cli` stays thin over `harness-project` and `harness-runner`.
- `harness-daemon` stays thin over `harness-project` and `harness-runner` for Studio and local API workflows.
- `bridges/rust/cucumber-rs` converts cucumber-rs typed events from a custom Writer into Harness protocol results.
- `bridges/typescript/cucumber-js` converts Cucumber.js Messages or formatter events into Harness protocol results.

Do not keep or recreate the old adapter crates as canonical evidence producers. New Harness behavior must be proven by corresponding Cucumber `.feature` files and Cucumber execution through a language bridge. Framework-specific tools such as Vitest, Jest, Playwright, or Cargo tests may be called from step definitions or reused as fixtures/assertion helpers, but they must not become separate outer test entrypoints for Harness behavior.

## Cucumber Ecosystem First

Reuse the Cucumber ecosystem wherever it already solves the problem.

Prefer:

- Gherkin syntax and official parsing instead of a custom `.feature` parser
- the Rust `gherkin` crate for core-side `.feature` scanning and validation
- Cucumber runner behavior for matching steps to step definitions
- Cucumber Messages or supported formatter output as the raw execution event source
- Cucumber tag expressions for selecting packages, modules, features, rules, examples, locales, or review slices
- Cucumber hooks for test setup and environment preparation
- Cucumber's undefined, pending, skipped, failed, and passed semantics for Example status
- Cucumber HTML/JSON/reporting outputs as optional human-facing or debugging artifacts

Rust execution should start from [`cucumber-rs`](https://cucumber-rs.github.io/cucumber/current/introduction.html). The Cucumber Rust book describes the `cucumber` crate as the Rust implementation that hooks Gherkin steps to executable Rust logic, and it is especially relevant because many Harness features will be Rust-backed.

The balance for CLI design:

- `harness` remains the governance CLI for `check`, `test`, `report`, lifecycle, locale, coverage, and evidence aggregation.
- `cucumber-rs` remains the Rust execution engine for running `.feature` examples, matching step definitions, handling tag/name/input filters, concurrency, retry, and terminal debugging output.
- Harness should wrap, configure, or invoke cucumber-rs instead of reimplementing its terminal app.
- Harness selection should stay in Harness terms (`package`, `module`, `feature`, `rule`, `example`, `locale`) and be rendered to Cucumber tag expressions only at the runner/bridge boundary, currently exposed as `HARNESS_CUCUMBER_TAG_EXPRESSION`.
- Language bridges consume that Harness expression by mapping it to native Cucumber filters: cucumber-rs `CUCUMBER_FILTER_TAGS`, `--tags`, or `TagOperation`; Cucumber.js `tags`, CLI `--tags`, or `sources.tagExpression`.
- Bridge entrypoints must apply the mapped filter before real Cucumber execution, such as cucumber-rs `World::run` or Cucumber.js `runCucumber`; a helper that only returns configuration is not sufficient evidence.
- For machine evidence, prefer cucumber-rs writers such as JSON/JUnit or a small custom Writer that projects cucumber events into Harness result YAML.
- For human terminal output, keep cucumber-rs terminal output available; if both human output and Harness evidence are needed, use a Tee-style writer pipeline.
- Only add Harness-specific CLI options around execution when they express Harness concepts such as package/module/rule/locale/lifecycle slices.

Harness should add only the missing governance layer:

- package and module manifests
- stable feature/rule tag taxonomy
- lifecycle and human review records
- review-log drift protection
- behavior coverage across declared, described, automated, executed, and passing behavior
- aggregation from Example results to Rule, Feature, Module, and Package

Do not fork Gherkin syntax, invent a parallel step runner, or build a custom parser unless the Cucumber ecosystem cannot provide the needed data.

## Target Artifacts

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

Expected tag anchors:

```gherkin
@package:mobile-client
@module:chat-composer
@feature:voice-message.send
@locale:en
Feature: Send voice message

  @rule:voice-message.progressive-upload
  Rule: Recording transfers audio chunks before release

    @example:chunks-upload-before-release
    Example: Chunks start uploading while the sender is still recording
```

Localized feature files may repeat the same `@feature`, `@rule`, and `@example` tags when they represent the same behavior in another language. They must differ by `@locale:<code>`.

## Canonical Rules To Lock

Before implementation starts, lock these small protocol rules:

- lifecycle values: `draft`, `proposed`, `accepted`, `deprecated`, `superseded`
- review states: `pending`, `approved`, `changes_requested`, `rejected`
- run status stays separate from lifecycle: `accepted` and `failing` is valid
- `.feature` behavior is an implementation gate: agents must not write step definitions, executable tests, or implementation logic until every touched Rule in the `.feature` is human-approved as `accepted` with review state `approved`
- feature tags use `@feature:<stable-id>`
- rule tags use `@rule:<stable-id>`
- example tags use `@example:<stable-id>`
- localized feature files use `@locale:<code>`
- package and module tags must point to manifest ids
- Example result identity is `featureTag + ruleTag + exampleTag`; locale, file path, and line number are helpful debug metadata
- `tests/harness.locales.yaml` stores `sourceLocale`, `requiredLocales`, and `executionLocale`
- natural-language titles and step body text can differ across locales, while Gherkin keywords stay English and Feature/Rule/Example tag sets stay equivalent
- Harness-owned YAML artifacts use `LocalizedText` for natural-language fields: a string means default English, and a language map such as `{ en, zh-CN }` carries translations
- YAML machine fields such as ids, tags, package/module references, lifecycle values, review states, and result identifiers are never localized

Result records should include:

- feature tag
- rule tag
- example tag
- locale
- example name
- file path
- optional line
- status
- step status summary
- failure message

## New Responsibilities

`harness check` should validate:

1. package/module/feature tag consistency
2. every `.feature` file has one package, one module, and one stable feature tag
3. every reviewed Rule has a stable `@rule:*` tag
4. manifest-declared features exist in `.feature` files
5. `.feature` files do not introduce orphan package/module/feature tags
6. lifecycle state is stored outside `.feature` files
7. accepted Rule changes require review-log coverage
8. localized `.feature` files for the same Feature have matching Rule and Example tags
9. required locales exist according to `tests/harness.locales.yaml`
10. translated examples preserve step order and intent while keeping English `Given / When / Then` keywords, so behavior does not silently become a different contract
11. Harness-owned YAML manifests provide required `LocalizedText` entries for human-facing titles and descriptions

`harness test` should:

1. run the configured Cucumber bridge through `harness-runner`
2. collect Example results
3. merge results into `tests/harness.results.yaml`
4. aggregate Example status up to Rule, Feature, Module, and Package
5. render behavior coverage

`harness report` / `harness verify` should show:

- package/module/feature hierarchy
- Rule lifecycle and run status
- Example execution status
- undefined or pending steps
- behavior coverage
- accepted behavior without executable evidence
- accepted behavior whose reviewed content changed
- locale coverage and stale translations

## Rewrite Phases

### Phase 0: Cucumber Ecosystem Spike

Before deleting protocol code, create one tiny fixture feature and confirm the ecosystem path:

- parse `.feature` files with the Rust `gherkin` crate
- inspect how Rule, Example, tags, line numbers, doc strings, and data tables appear in the AST
- run one example through either Rust `cucumber` or `cucumber-js`
- confirm whether Cucumber Messages or another supported formatter gives enough result data
- decide the first bridge output shape from real Cucumber output, not guesses

### Phase 1: Protocol Reset

Replace the old protocol schemas with the new canonical artifacts:

- package manifest schema
- module manifest schema
- locale manifest schema
- behavior lifecycle schema
- review-log event schema
- Cucumber result schema
- report schema

Delete old promise schemas instead of keeping them beside the new ones.

### Phase 2: Registry Rewrite

Replace `promise_registry` and old `module_registry` loading with:

- package registry
- module registry
- locale registry
- feature file scanner backed by the Rust `gherkin` crate
- tag index
- behavior lifecycle registry
- review-log loader

The registry output should be a single project model shaped around `Package -> Module -> Feature -> Rule -> Example`.

### Phase 3: Checker First

Build `harness check` before the new UI.

The first useful milestone is a command that can reject invalid organization and lifecycle state without running tests.

### Phase 4: Harness Runner And Cucumber Bridges

Add the Harness runner and the first Cucumber bridges.

The runner should orchestrate Cucumber-native execution output where possible, preferably Cucumber Messages, cucumber-rs typed events, or a supported formatter stream. Harness results should be a normalized projection of Cucumber data, not a replacement runner.

Rust projects should use the Rust `cucumber` crate through `bridges/rust/cucumber-rs`. JavaScript/TypeScript projects should use `cucumber-js` through `bridges/typescript/cucumber-js`. The Harness project model should stay runner-agnostic: it parses `.feature` files for validation with `gherkin`, then consumes normalized Harness protocol results from whichever bridge ran the examples.

For Rust, do not build a competing runner or terminal CLI first. Start by letting cucumber-rs run Examples through its own CLI/options and output pipeline. Harness should add:

- a thin `harness test` orchestration layer that selects Harness slices and delegates execution to cucumber-rs
- a normalized result collector keyed by `featureTag + ruleTag + exampleTag`
- an optional custom Writer if existing JSON/JUnit output does not preserve enough tag/rule/example metadata
- a later CLI integration using cucumber-rs CLI composition only when Harness-specific options need to live beside cucumber-rs options

For TypeScript, do not build Vitest/Jest bridges as canonical Harness evidence. Use Cucumber.js as the execution entry point, consume Cucumber Messages through its JavaScript API or a formatter, and let Vitest/Jest/Playwright remain optional step-definition internals. Do not add a separate Vitest/Jest test as the primary proof for new Harness bridge behavior; add or update the matching Cucumber Example and step definitions instead.

Each bridge should emit normalized Harness results for Examples with:

- feature tag
- rule tag
- example tag
- locale
- example name
- step status summary
- file path
- run status
- failure message

The result file should no longer use `promiseId`.

### Phase 5: Report And Coverage

Implement behavior reports:

```text
Package -> Module -> Feature -> Rule -> Example
```

Coverage should include:

- declared features
- described rules
- automated examples
- executed examples
- passing behavior
- undefined steps
- required locale coverage
- stale or structurally mismatched translations
- missing localized YAML labels for required locales

### Phase 6: Self-Harness Rewrite

Rewrite this repository's own Harness artifacts into the new model:

- start with one minimal self-feature that proves the new check/test/report loop
- convert old self-promises into `.feature` files and Rule lifecycle records
- add localized `.feature` files for required review languages
- replace old modules with new module manifests
- convert manifest titles and descriptions to `LocalizedText`
- replace old review metadata with behavior/review-log records
- update root `tests/harness.yaml` to run Cucumber through `harness-runner` and the relevant bridge
- remove old promise files once the new check/test/report loop passes

### Phase 7: Agent Skill Rewrite

Replace old promise-authoring skills with the new Harness-aware authoring skill.

The skill must teach Agents to:

- create or update package/module manifests
- write manifest titles and descriptions as `LocalizedText`
- write `.feature` files with stable tags
- write localized `.feature` files with matching stable tags and `@locale`
- assign stable `@example` tags instead of using translated Example titles as identity
- draft Rules as `draft` or `proposed`
- mark Rules `accepted` only after explicit human approval
- treat `.feature` approval as a hard gate before writing step definitions, executable tests, or implementation logic
- append review-log events for accepted behavior changes
- write real step definitions and avoid placeholder assertions
- report lifecycle, run status, undefined steps, and behavior coverage

### Phase 8: Studio Rewrite

Keep the Studio shell, but replace promise-oriented data and pages with:

- package overview
- module detail
- feature detail
- locale switcher for Feature, Rule, Example, and step text
- Rule review panel
- Example evidence panel
- behavior coverage view
- review-log/drift view

Delete old Promise pages rather than adapting them.

## Done Looks Like

The rewrite is done when:

1. the repository contains no canonical `.promises.yaml` files
2. the Rust protocol no longer exposes `PromiseRecord`
3. result files no longer use `promiseId`
4. `harness check` validates package/module/feature/rule consistency
5. `harness test` runs Cucumber and writes new result YAML
6. `harness report --summary` shows behavior status by Package, Module, Feature, and Rule
7. accepted Rule drift is detected through lifecycle/review-log checks
8. localized `.feature` files can be checked for required locale coverage and structural parity
9. the new Agent skill can drive a feature change end to end

## Risk

The main risk is trying to preserve old concepts while introducing the new model. That would leave the project with two competing mental models.

The mitigation is simple: delete old protocol shapes as soon as each new slice lands, and let failing self-harness checks reveal the next missing piece.
