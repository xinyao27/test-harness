# @test-harness/core

Seed Harness 的核心 primitives：

- canonical `.promise.yaml` loading
- Effect Schema validation
- localized promise text resolution
- scenario binding helpers
- YAML result loading and writing
- promise status report generation
- Vitest `scenarioTest(...)` helper and reporter

Harness 自己拥有的 artifacts 默认使用 YAML，包括 `.harness/results.yaml`。
