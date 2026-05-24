# Rust 重写计划

## 目标

用 Rust 重写 seed Harness core，同时保留当前 TypeScript 参考实现已经验证过的 protocol-first contract。

Rust 重写应该替换 Harness core 和 CLI，不替换 Vitest adapter。Vitest adapter 继续留在 TypeScript，因为它位于 Vitest/Node 测试运行时边界。

## 目标形态

```text
crates/
  harness-protocol/
  harness-core/
  harness-cli/

packages/
  adapter-vitest/
```

迁移期间，现有 TypeScript core 和 CLI 继续作为参考实现保留。Rust 和 TypeScript 应该跑同一批 protocol schemas、fixtures 和 CLI golden outputs，直到 Rust 可以成为默认实现。

## 边界

- `harness.yaml` 拥有外部 test runner command。
- `harness test` 运行 `test.runner.command` 和 `test.runner.args`，并注入 `HARNESS_ROOT_DIR`。
- Rust core 不能知道 Vitest 特定细节。
- Vitest adapter 不能依赖 Rust core 或 TypeScript core。
- Vitest adapter 按照 `protocol/v1/results.schema.yaml` 直接写 `.harness/results.yaml`。
- result 中的 `file` 值应尽可能写成相对 Harness root 的路径。

## 迁移步骤

1. 新增 Rust crates，用于 protocol types 和 fixture conformance。
2. 用 Rust 实现 `harness.yaml`、promises、modules 和 results loaders。
3. 用 Rust 实现 report generation，并对齐 golden report fixtures。
4. 用 Rust 实现 CLI commands：`check`、`report`、`verify` 和 `test`。
5. 更新 Vitest adapter，让它直接拥有 result YAML 写入逻辑。
6. 在 CI 中同时运行 TypeScript 和 Rust 实现。
7. 当 Rust 匹配 protocol fixtures、golden outputs 和 seed Harness promises 后，把默认 `harness` command 切到 Rust。
