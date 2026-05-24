# @test-harness/adapter-vitest

Harness protocol 的 Vitest adapter。

它提供：

- `scenarioTest(...)`：把 Vitest tests 绑定到 canonical promise ids
- Vitest reporter：写出 `.harness/results.yaml`

Adapter 依赖 `@test-harness/core` 来写 protocol results。Core 不依赖这个 adapter。
