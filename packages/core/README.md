# @test-harness/core

Core seed Harness primitives:

- canonical `.promise.yaml` loading
- `apiVersion: 1` protocol validation
- Effect Schema validation
- localized promise text resolution
- scenario binding helpers
- YAML result loading and writing
- promise status report generation

The package is the TypeScript reference implementation of the language-agnostic protocol under `protocol/v1/`. It keeps Harness-owned artifacts in YAML by default, including `.harness/results.yaml`.
