# @test-harness/adapter-vitest

Vitest adapter for the Harness protocol.

It provides:

- `scenarioTest(...)` for binding Vitest tests to canonical promise ids
- a Vitest reporter that writes adapter event shards for the shared runtime

The adapter is intentionally thin: it does not depend on the Harness core implementation, and it does not merge final result YAML itself.
