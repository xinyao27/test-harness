# @test-harness/adapter-vitest

Vitest adapter for the Harness protocol.

It provides:

- `scenarioTest(...)` for binding Vitest tests to canonical promise ids
- a Vitest reporter that writes `.harness/results.yaml`

The adapter depends on `@test-harness/core` for protocol result writing. Core does not depend on this adapter.
