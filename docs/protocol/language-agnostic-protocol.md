# Language-Agnostic Harness Protocol

> Status: v1 protocol note
> Goal: Keep promises and result files stable across implementations, including a future Rust rewrite.

## Core Idea

The Harness is a protocol first, not a TypeScript or Vitest feature.

The stable layer is:

```text
promises/**/*.promises.yaml
  -> adapter execution
  -> .harness/results.yaml
  -> Harness report
```

Any implementation can participate if it can read canonical promise YAML and write Harness result YAML for `apiVersion: 1`.

## Protocol Files

Protocol contracts live under `protocol/v1/`:

- `promise.schema.yaml`: canonical promise file shape.
- `promises-file.schema.yaml`: canonical grouped promises wrapper shape.
- `module.schema.yaml`: canonical module ownership file shape.
- `results.schema.yaml`: adapter-produced result file shape.
- `report.schema.yaml`: structured report shape.
- `cli.yaml`: command, path, environment, and exit-code contract.

Portable conformance samples live under `protocol/fixtures/`. A reference implementation should accept every valid fixture and reject every invalid fixture in the same way as the protocol schemas. CLI golden output fixtures under `protocol/fixtures/cli/golden/` pin representative human-facing report output.

These files are the cross-language contract. The current Effect Schemas in `@test-harness/core` are the TypeScript reference implementation of that contract, not the only valid implementation.

## Implementation Roles

- **Protocol**: YAML shapes, stable ids, lifecycle, review metadata, result status, CLI semantics.
- **Reference implementation**: current TypeScript packages that load, validate, report, and test the protocol.
- **Adapter**: a test-framework bridge that turns executable checks into `.harness/results.yaml`.
- **Vitest adapter**: the current adapter using `scenarioTest(...)` and a Vitest reporter.

The protocol must not require Vitest task metadata, TypeScript imports, or Node process details. Those belong to adapter promises under `promises/adapters/vitest/`.

## Rewrite Rule

A Rust rewrite is successful when it can satisfy the same protocol promises and conformance fixtures:

1. Load the same `.promises.yaml` files.
2. Load the same module ownership files.
3. Reject the same invalid module, promise, result, and report fixtures.
4. Read or write the same `.harness/results.yaml` shape.
5. Render equivalent promise status and match the golden CLI report fixtures for the pinned cases.
6. Preserve CLI behavior and exit codes.

The rewrite does not need to mimic the TypeScript internals. It needs to preserve the protocol.

## Versioning

All persisted Harness-owned YAML artifacts include:

```yaml
apiVersion: 1
```

Breaking protocol changes require a new integer version and migration notes. Non-breaking checker improvements can stay on the same version if existing valid files remain valid.
