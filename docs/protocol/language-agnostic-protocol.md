# Language-Agnostic Harness Protocol

> Status: v1 protocol note
> Goal: Keep promises and result files stable across implementations.

## Core Idea

The Harness is a protocol first, not a TypeScript or Vitest feature.

The stable layer is:

```text
tests/harness.yaml
  -> configured adapter runner
tests/modules/**/*.module.yaml
tests/promises/**/*.promises.yaml
  -> adapter execution
  -> .harness/runs/<run-id>/events/*.ndjson
  -> adapter runtime merge
  -> .harness/results.yaml
  -> Harness report
```

Any implementation can participate if it can read canonical promise YAML and either emit adapter events or write Harness result YAML for `apiVersion: 1`.

## Protocol Files

Protocol contracts live under `protocol/v1/`:

- `promise.schema.yaml`: canonical promise file shape.
- `harness-config.schema.yaml`: project-level runner config shape.
- `promises-file.schema.yaml`: canonical grouped promises wrapper shape.
- `module.schema.yaml`: canonical architecture-boundary ownership file shape.
- `adapter-event.schema.yaml`: stream record shape emitted by adapters and merged by the runtime.
- `results.schema.yaml`: adapter-produced result file shape.
- `report.schema.yaml`: structured report shape.
- `cli.yaml`: command, path, environment, and exit-code contract.

Portable conformance samples live under `protocol/fixtures/`. A reference implementation should accept every valid fixture and reject every invalid fixture in the same way as the protocol schemas. CLI golden output fixtures under `protocol/fixtures/cli/golden/` pin representative human-facing report output.

These files are the cross-language contract. The Rust protocol crate is the current reference implementation of that contract, while thin adapters such as the Vitest adapter only emit protocol-shaped events.

## Implementation Roles

- **Protocol**: YAML shapes, stable ids, lifecycle, review metadata, result status, CLI semantics.
- **Reference implementation**: Rust crates that load, validate, report, and test the protocol.
- **Adapter**: a test-framework bridge that turns executable checks into adapter events.
- **Vitest adapter**: the current adapter using `scenarioTest(...)` and a Vitest reporter.

The protocol must not require Vitest task metadata, TypeScript imports, or Node process details. Those belong to adapter promises under `tests/promises/adapters/vitest/`.

## Replacement Rule

A replacement implementation is successful when it can satisfy the same protocol promises and conformance fixtures:

1. Load the same `.promises.yaml` files.
2. Load the same architecture-boundary module files.
3. Load the same `tests/harness.yaml` runner config shape.
4. Reject the same invalid config, module, promise, result, and report fixtures.
5. Emit the same adapter event records or read/write the same `.harness/results.yaml` shape.
6. Render equivalent promise status and match the golden CLI report fixtures for the pinned cases.
7. Preserve CLI behavior and exit codes.

An implementation does not need to mimic another implementation's internals. It needs to preserve the protocol.

## Versioning

All persisted Harness-owned YAML artifacts include:

```yaml
apiVersion: 1
```

Breaking protocol changes require a new integer version and migration notes. Non-breaking checker improvements can stay on the same version if existing valid files remain valid.
