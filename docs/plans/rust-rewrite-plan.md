# Rust Rewrite Plan

> Status: Completed implementation plan

## Goal

Rewrite the seed Harness core in Rust while preserving the protocol-first contract.

The Rust rewrite replaces the Harness core and CLI, not the Vitest adapter. The adapter remains in TypeScript because it lives at the Vitest/Node test-runtime boundary.

## Target Shape

```text
crates/
  harness-protocol/
  harness-core/
  harness-cli/
  harness-adapter-runtime/
  harness-adapter-rust/

packages/
  adapter-vitest/
```

The TypeScript core and CLI were removed after the Rust implementation matched the protocol schemas, fixtures, CLI golden outputs, and seed Harness promises.

## Boundaries

- `tests/harness.yaml` owns the external test runner command.
- `harness test` runs `test.runner.command` with `test.runner.args` and injects `HARNESS_ROOT_DIR`.
- Rust core must not know Vitest-specific details.
- The Vitest adapter must not depend on the Rust core.
- The Vitest adapter writes adapter event shards; the Rust adapter runtime merges them into `.harness/results.yaml`.
- Result `file` values should be relative to the Harness root whenever possible.

## Migration Steps

1. Add Rust crates for protocol types and fixture conformance.
2. Implement Rust loaders for `tests/harness.yaml`, promises, modules, and results.
3. Implement Rust report generation against the golden report fixtures.
4. Implement Rust CLI commands: `check`, `report`, `verify`, and `test`.
5. Add a shared Rust adapter runtime that can wrap arbitrary test commands and merge adapter event shards into `.harness/results.yaml`.
6. Add the Rust adapter helper/runner so Rust tests can bind directly to canonical promises.
7. Update the Vitest adapter to emit adapter event shards.
8. Run Rust implementation checks and the thin TypeScript Vitest adapter tests in CI.
9. Keep the default `harness` behavior on the Rust CLI after matching protocol fixtures, golden outputs, and seed Harness promises.
