# Rust Rewrite Plan

## Goal

Rewrite the seed Harness core in Rust while preserving the protocol-first contract already exercised by the TypeScript reference implementation.

The Rust rewrite should replace the Harness core and CLI, not the Vitest adapter. The adapter remains in TypeScript because it lives at the Vitest/Node test-runtime boundary.

## Target Shape

```text
crates/
  harness-protocol/
  harness-core/
  harness-cli/

packages/
  adapter-vitest/
```

During migration, the existing TypeScript core and CLI stay available as the reference implementation. Rust and TypeScript should run against the same protocol schemas, fixtures, and CLI golden outputs until Rust is ready to become the default.

## Boundaries

- `harness.yaml` owns the external test runner command.
- `harness test` runs `test.runner.command` with `test.runner.args` and injects `HARNESS_ROOT_DIR`.
- Rust core must not know Vitest-specific details.
- The Vitest adapter must not depend on the Rust core or TypeScript core.
- The Vitest adapter writes `.harness/results.yaml` directly according to `protocol/v1/results.schema.yaml`.
- Result `file` values should be relative to the Harness root whenever possible.

## Migration Steps

1. Add Rust crates for protocol types and fixture conformance.
2. Implement Rust loaders for `harness.yaml`, promises, modules, and results.
3. Implement Rust report generation against the golden report fixtures.
4. Implement Rust CLI commands: `check`, `report`, `verify`, and `test`.
5. Update the Vitest adapter to own result YAML writing directly.
6. Run TypeScript and Rust implementations side by side in CI.
7. Switch the default `harness` command to Rust after matching protocol fixtures, golden outputs, and seed Harness promises.
