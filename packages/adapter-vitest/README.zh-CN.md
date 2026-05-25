# @test-harness/adapter-vitest

Harness protocol 的 Vitest adapter。

它提供：

- `scenarioTest(...)`：把 Vitest tests 绑定到 canonical promise ids
- Vitest reporter：写出给共享 runtime 使用的 adapter event shards

Adapter 刻意保持很薄：它不依赖 Harness core 实现，也不自己合并最终 result YAML。
