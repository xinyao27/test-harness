# 语言无关 Harness Protocol

> 状态：v1 protocol note
> 目标：让 promise 和 result 文件在不同实现之间保持稳定。

## 核心想法

Harness 首先是一套 protocol，而不是 TypeScript 或 Vitest 的功能。

稳定层是：

```text
harness.yaml
  -> configured adapter runner
promises/**/*.promises.yaml
  -> adapter execution
  -> .harness/runs/<run-id>/events/*.ndjson
  -> adapter runtime merge
  -> .harness/results.yaml
  -> Harness report
```

任何实现只要能读取 canonical promise YAML，并为 `apiVersion: 1` 写出 adapter events 或 Harness result YAML，就可以参与这套系统。

## Protocol Files

Protocol contracts 放在 `protocol/v1/`：

- `promise.schema.yaml`：canonical promise file shape。
- `harness-config.schema.yaml`：project-level runner config shape。
- `promises-file.schema.yaml`：canonical grouped promises wrapper shape。
- `module.schema.yaml`：canonical module ownership file shape。
- `adapter-event.schema.yaml`：adapter 发出并由 runtime 合并的 stream record shape。
- `results.schema.yaml`：adapter 产出的 result file shape。
- `report.schema.yaml`：structured report shape。
- `cli.yaml`：command、path、environment 和 exit-code contract。

可移植 conformance samples 放在 `protocol/fixtures/` 下。参考实现应该像 protocol schemas 一样接受所有 valid fixtures，并拒绝所有 invalid fixtures。`protocol/fixtures/cli/golden/` 下的 CLI golden output fixtures 会固定代表性的面向人类 report output。

这些文件是跨语言 contract。当前 Rust protocol crate 是这套 contract 的参考实现，而 Vitest adapter 这类薄 adapter 只负责发出符合 protocol 的事件。

## Implementation Roles

- **Protocol**：YAML shapes、stable ids、lifecycle、review metadata、result status、CLI semantics。
- **Reference implementation**：Rust crates，负责加载、校验、报告和测试 protocol。
- **Adapter**：测试框架桥接层，把可执行检查转换成 adapter events。
- **Vitest adapter**：当前 adapter，使用 `scenarioTest(...)` 和 Vitest reporter。

Protocol 不能要求 Vitest task metadata、TypeScript imports 或 Node process details。这些属于 `promises/adapters/vitest/` 下的 adapter promises。

## Replacement Rule

替代实现成功的判断标准是：它能满足同一批 protocol promises 和 conformance fixtures：

1. 加载同一批 `.promises.yaml` 文件。
2. 加载同一批 module ownership files。
3. 加载同一类 `harness.yaml` runner config shape。
4. 拒绝同一批无效 config、module、promise、result 和 report fixtures。
5. 发出同样的 adapter event records，或读取/写出同样的 `.harness/results.yaml` shape。
6. 渲染等价的 promise status，并在已固定的场景中匹配 CLI report golden fixtures。
7. 保持 CLI 行为和 exit codes。

实现不需要模仿另一种实现的内部结构。它需要保持 protocol。

## Versioning

所有 Harness 自己拥有的持久化 YAML artifacts 都包含：

```yaml
apiVersion: 1
```

破坏性 protocol 变更需要新的整数版本和 migration notes。非破坏性的 checker 改进可以留在同一版本，只要已有有效文件仍然有效。
