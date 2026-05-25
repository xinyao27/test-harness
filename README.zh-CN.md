# Test Harness

一套带语言无关 YAML protocol 的 promise-driven Test Harness。

Seed Harness 会把已 review 的行为承诺存储为 canonical `.promises.yaml` 文件，让 adapters 把可执行测试绑定到 promise ids，把 adapter results 收集到 `.harness/results.yaml`，并渲染成人类可读的 promise status report。

当前仓库提供 Rust core/CLI 实现和一个薄 TypeScript Vitest adapter。稳定层是 `protocol/v1/` 下的 `apiVersion: 1` protocol。

## 当前闭环

```text
tests/harness.yaml
tests/modules/**/*.module.yaml
tests/promises/**/*.promises.yaml
  -> adapter tests
  -> harness test
  -> .harness/results.yaml
  -> readable verification report
```

## Commands

- 运行完整 seed loop：

```bash
cargo run -q -p harness-cli -- test --lang zh-CN
```

- 基于已有 results 验证 promises：

```bash
cargo run -q -p harness-cli -- verify --lang zh-CN
```

- 检查 promise files 和 bindings：

```bash
cargo run -q -p harness-cli -- check
```

- 运行仓库检查：

```bash
vp check
vp run -r test
vp run -r build
```
