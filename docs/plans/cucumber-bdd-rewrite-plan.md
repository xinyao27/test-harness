# Cucumber BDD Rewrite Plan

> Status: Planning draft
> Goal: Rewrite the Harness around Cucumber-style `Feature / Rule / Example` while keeping useful infrastructure and dropping all legacy promise-schema compatibility.

## Decision

Use a **spine-preserving rewrite**.

Keep the useful engineering spine:

- Rust workspace, CLI command structure, and validation/reporting patterns
- adapter runtime pattern for event shards and `.harness/results.yaml`
- localized text helpers
- daemon pairing, project access, file opening, and agent PTY plumbing
- Studio app shell and reusable UI components

Rewrite the semantic core:

- protocol schemas
- registries
- report model
- self-harness artifacts
- agent skills
- adapter binding model
- Studio data model

## Compatibility Policy

No compatibility layer.

The rewrite must not support old canonical shapes:

- no `.promises.yaml` reader
- no `PromiseRecord`
- no `promiseId` result binding
- no `scenarioTest(promiseId, ...)` as the canonical adapter API
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

## Cucumber Ecosystem First

Reuse the Cucumber ecosystem wherever it already solves the problem.

Prefer:

- Gherkin syntax and official parsing instead of a custom `.feature` parser
- the Rust `gherkin` crate for core-side `.feature` scanning and validation
- Cucumber runner behavior for matching steps to step definitions
- Cucumber Messages or supported formatter output as the raw execution event source
- Cucumber tag expressions for selecting packages, modules, features, rules, or review slices
- Cucumber hooks for test setup and environment preparation
- Cucumber's undefined, pending, skipped, failed, and passed semantics for Example status
- Cucumber HTML/JSON/reporting outputs as optional human-facing or debugging artifacts

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
features/**/*.feature
tests/harness.behavior.yaml
tests/harness.review-log.yaml
.harness/results.yaml
```

Expected tag anchors:

```gherkin
@package:mobile-client
@module:chat-composer
@feature:voice-message.send
Feature: Send voice message

  @rule:voice-message.progressive-upload
  Rule: Recording transfers audio chunks before release
```

## Canonical Rules To Lock

Before implementation starts, lock these small protocol rules:

- lifecycle values: `draft`, `proposed`, `accepted`, `deprecated`, `superseded`
- review states: `pending`, `approved`, `changes_requested`, `rejected`
- run status stays separate from lifecycle: `accepted` and `failing` is valid
- feature tags use `@feature:<stable-id>`
- rule tags use `@rule:<stable-id>`
- package and module tags must point to manifest ids
- Example result identity is `featureTag + ruleTag + exampleName + file`, with line number as helpful debug metadata

Result records should include:

- feature tag
- rule tag
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

`harness test` should:

1. run the configured Cucumber adapter
2. collect Example results
3. merge results into `.harness/results.yaml`
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

## Rewrite Phases

### Phase 0: Cucumber Ecosystem Spike

Before deleting protocol code, create one tiny fixture feature and confirm the ecosystem path:

- parse `.feature` files with the Rust `gherkin` crate
- inspect how Rule, Example, tags, line numbers, doc strings, and data tables appear in the AST
- run one example through either Rust `cucumber` or `cucumber-js`
- confirm whether Cucumber Messages or another supported formatter gives enough result data
- decide the first adapter output shape from real Cucumber output, not guesses

### Phase 1: Protocol Reset

Replace the old protocol schemas with the new canonical artifacts:

- package manifest schema
- module manifest schema
- behavior lifecycle schema
- review-log event schema
- Cucumber result schema
- report schema

Delete old promise schemas instead of keeping them beside the new ones.

### Phase 2: Registry Rewrite

Replace `promise_registry` and old `module_registry` loading with:

- package registry
- module registry
- feature file scanner backed by the Rust `gherkin` crate
- tag index
- behavior lifecycle registry
- review-log loader

The registry output should be a single project model shaped around `Package -> Module -> Feature -> Rule -> Example`.

### Phase 3: Checker First

Build `harness check` before the new UI.

The first useful milestone is a command that can reject invalid organization and lifecycle state without running tests.

### Phase 4: Cucumber Adapter

Add the Cucumber adapter as the first canonical adapter.

The adapter should consume Cucumber-native execution output where possible, preferably Cucumber Messages or a supported formatter stream. Harness event shards should be a normalized projection of Cucumber data, not a replacement runner.

Rust projects can use the Rust `cucumber` crate as an execution adapter. JavaScript/TypeScript projects can use `cucumber-js`. The Harness core should stay runner-agnostic: it parses `.feature` files for validation with `gherkin`, then consumes normalized Cucumber execution output from whichever adapter ran the examples.

The adapter should emit normalized event shards for Examples with:

- feature tag
- rule tag
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

### Phase 6: Self-Harness Rewrite

Rewrite this repository's own Harness artifacts into the new model:

- start with one minimal self-feature that proves the new check/test/report loop
- convert old self-promises into `.feature` files and Rule lifecycle records
- replace old modules with new module manifests
- replace old review metadata with behavior/review-log records
- update root `tests/harness.yaml` to run the Cucumber adapter
- remove old promise files once the new check/test/report loop passes

### Phase 7: Agent Skill Rewrite

Replace old promise-authoring skills with the new Harness-aware authoring skill.

The skill must teach Agents to:

- create or update package/module manifests
- write `.feature` files with stable tags
- draft Rules as `draft` or `proposed`
- mark Rules `accepted` only after explicit human approval
- append review-log events for accepted behavior changes
- write real step definitions and avoid placeholder assertions
- report lifecycle, run status, undefined steps, and behavior coverage

### Phase 8: Studio Rewrite

Keep the Studio shell, but replace promise-oriented data and pages with:

- package overview
- module detail
- feature detail
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
8. the new Agent skill can drive a feature change end to end

## Risk

The main risk is trying to preserve old concepts while introducing the new model. That would leave the project with two competing mental models.

The mitigation is simple: delete old protocol shapes as soon as each new slice lands, and let failing self-harness checks reveal the next missing piece.
