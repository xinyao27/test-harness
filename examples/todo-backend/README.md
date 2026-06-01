# Todo-Backend Example

This example is being rewritten onto the new Cucumber-based Harness model.

The first migrated slice is the Rust Axum Todo Backend. Its behavior is described by localized Cucumber feature files and executed by cucumber-rs against the real in-memory Axum application.

## Feature Files

```text
features/implementations/rust-axum/todo-api.feature
features/implementations/rust-axum/todo-api.zh-CN.feature
```

Both locale files reuse the same stable tags:

```text
@package:todo-backend-rust-axum
@module:todo-api
@feature:todo-backend.rust-axum.todo-api
@rule:todo-backend.rust-axum.todo-lifecycle
@example:create-list-patch-clear
```

The English and Chinese descriptions are review text. The tags are the stable identity Harness uses to connect Package, Module, Feature, Rule, Example, Rule state, and execution evidence.

## Run The Cucumber Example

```bash
pnpm example:todo:test
```

or run the Rust test directly:

```bash
cargo test -p todo-backend-rust-axum --test rust_axum_cucumber
```

The Cucumber runner loads both localized feature files and verifies the create, list, patch, and clear flow through the Rust Axum implementation.

`harness test` can invoke the configured runner, but Cucumber Example result normalization into `tests/harness.results.yaml` is still the next harness-runner step.

## Harness Metadata

```text
tests/harness.locales.yaml
tests/harness.packages.yaml
tests/harness.modules.yaml
tests/harness.behavior.yaml
tests/harness.review-log.yaml
```

These files describe the example's review languages, package/module ownership, Rule state, and review history. They are intentionally separate from the `.feature` files so human Rule state does not get mixed into Cucumber syntax.

## Current Rewrite Boundary

The TypeScript implementation and TodoMVC client are still useful example application code, but their pre-rewrite Vitest and browser harnesses are no longer the canonical path. New example behavior should be added as Cucumber features first, then bound to executable Cucumber evidence.

## Attribution

The UI is based on the React example from TasteJS TodoMVC:

```text
https://github.com/tastejs/todomvc/tree/master/examples/react
```

The source has been refactored into a Vite app and changed from local reducer state to a Todo-Backend HTTP API client.
