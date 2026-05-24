# 语言无关 Harness Protocol

> 状态：v1 protocol note
> 目标：让 promise 和 result 文件在不同实现之间保持稳定，包括未来的 Rust 重写。

## 核心想法

Harness 首先是一套 protocol，而不是 TypeScript 或 Vitest 的功能。

稳定层是：

```text
promises/**/*.promise.yaml
  -> adapter execution
  -> .harness/results.yaml
  -> Harness report
```

任何实现只要能读取 canonical promise YAML，并为 `apiVersion: 1` 写出 Harness result YAML，就可以参与这套系统。

## Protocol Files

Protocol contracts 放在 `protocol/v1/`：

- `promise.schema.yaml`：canonical promise file shape。
- `results.schema.yaml`：adapter 产出的 result file shape。
- `report.schema.yaml`：structured report shape。
- `cli.yaml`：command、path、environment 和 exit-code contract。

可移植 conformance samples 放在 `protocol/fixtures/` 下。参考实现应该像 protocol schemas 一样接受所有 valid fixtures，并拒绝所有 invalid fixtures。

这些文件是跨语言 contract。当前 `@test-harness/core` 里的 Effect Schemas 是这套 contract 的 TypeScript 参考实现，不是唯一合法实现。

## Implementation Roles

- **Protocol**：YAML shapes、stable ids、lifecycle、review metadata、result status、CLI semantics。
- **Reference implementation**：当前 TypeScript packages，负责加载、校验、报告和测试 protocol。
- **Adapter**：测试框架桥接层，把可执行检查转换成 `.harness/results.yaml`。
- **Vitest adapter**：当前 adapter，使用 `scenarioTest(...)` 和 Vitest reporter。

Protocol 不能要求 Vitest task metadata、TypeScript imports 或 Node process details。这些属于 `promises/adapters/vitest/` 下的 adapter promises。

## Rewrite Rule

Rust 重写成功的判断标准是：它能满足同一批 protocol promises 和 conformance fixtures：

1. 加载同一批 `.promise.yaml` 文件。
2. 拒绝同一批无效 promise 和 result fixtures。
3. 读取或写出同样的 `.harness/results.yaml` shape。
4. 渲染等价的 promise status。
5. 保持 CLI 行为和 exit codes。

重写不需要模仿 TypeScript 内部实现。它需要保持 protocol。

## Versioning

所有 Harness 自己拥有的持久化 YAML artifacts 都包含：

```yaml
apiVersion: 1
```

破坏性 protocol 变更需要新的整数版本和 migration notes。非破坏性的 checker 改进可以留在同一版本，只要已有有效文件仍然有效。
