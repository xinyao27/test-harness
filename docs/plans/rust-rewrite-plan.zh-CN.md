# Rust 重写计划

> 状态：已完成的实现计划

## 目标

用 Rust 重写 seed Harness core，同时保留 protocol-first contract。

Rust 重写替换 Harness core 和 CLI，不替换 Vitest adapter。Vitest adapter 继续留在 TypeScript，因为它位于 Vitest/Node 测试运行时边界。

## 目标形态

```text
crates/
  harness-protocol/
  harness-core/
  harness-cli/
  harness-adapter-runtime/
  harness-adapter-rust/

packages/
  adapter-vitest/
```

Rust 实现匹配 protocol schemas、fixtures、CLI golden outputs 和 seed Harness promises 后，TypeScript core 和 CLI 已经删除。

## 边界

- `tests/harness.yaml` 拥有外部 test runner command。
- `harness test` 运行 `test.runner.command` 和 `test.runner.args`，并注入 `HARNESS_ROOT_DIR`。
- Rust core 不能知道 Vitest 特定细节。
- Vitest adapter 不能依赖 Rust core。
- Vitest adapter 写出 adapter event shards；Rust adapter runtime 会把它们合并进 `.harness/results.yaml`。
- result 中的 `file` 值应尽可能写成相对 Harness root 的路径。

## 迁移步骤

1. 新增 Rust crates，用于 protocol types 和 fixture conformance。
2. 用 Rust 实现 `tests/harness.yaml`、promises、modules 和 results loaders。
3. 用 Rust 实现 report generation，并对齐 golden report fixtures。
4. 用 Rust 实现 CLI commands：`check`、`report`、`verify` 和 `test`。
5. 增加共享 Rust adapter runtime，用它包装任意 test command，并把 adapter event shards 合并到 `.harness/results.yaml`。
6. 增加 Rust adapter helper/runner，让 Rust tests 可以直接绑定 canonical promises。
7. 更新 Vitest adapter，让它写出 adapter event shards。
8. 在 CI 中运行 Rust 实现检查和薄 TypeScript Vitest adapter 测试。
9. 当 Rust 匹配 protocol fixtures、golden outputs 和 seed Harness promises 后，默认 `harness` 行为保持在 Rust CLI 上。
