# @test-harness/core

Seed Harness 的核心 primitives：

- canonical `.promise.yaml` loading
- `apiVersion: 1` protocol validation
- Effect Schema validation
- localized promise text resolution
- scenario binding helpers
- YAML result loading and writing
- promise status report generation

这个 package 是 `protocol/v1/` 下语言无关 protocol 的 TypeScript 参考实现。Harness 自己拥有的 artifacts 默认使用 YAML，包括 `.harness/results.yaml`。
