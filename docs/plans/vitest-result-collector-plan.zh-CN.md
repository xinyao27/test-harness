# Vitest Result Collector 切片计划

## Summary

下一个切片的目标，是把 `Run Status: unknown` 推进成真实的 `passing`、`failing` 或 `skipped`，也就是收集 Vitest 结果，并把结果映射回 canonical promise ids。

Claude review 了第一版计划，指出两个架构问题：

- 当前 `scenario({ id })` 写入的是内存 registry，但 Vitest 测试文件运行在隔离 worker 中。main process 里的 reporter 读不到 worker-local registry。
- `harness verify` 需要一个持久化结果来源。Vitest 退出后，reporter 的进程内状态就消失了。

所以这个切片必须使用跨进程机制：

```text
scenarioTest(...)
  -> sets Vitest task.meta.promiseId
  -> Vitest reporter reads task.meta and test status
  -> reporter writes .harness/results.yaml
  -> harness verify reads promises + results
  -> report shows promise run status
```

## Goal

这个切片完成后：

```bash
vp run -r test
vp exec harness verify --lang zh-CN
```

应该可以把已收集到结果的 promises 显示为 `passing`、`failing` 或 `skipped`，而不是永远显示 `unknown`。

如果某条 promise 没有任何测试结果，它仍然显示 `unknown`。

## Design Decisions

### 使用 Vitest Metadata，而不是内存 Registry

当前 `scenario()` registry 对 same-process validation 有用，但不能直接用于 Vitest result collection，因为 worker-local state 对 main process 不可见。

这个切片里的测试绑定 API 应该是一个很薄的 Vitest helper，暂定为：

```ts
scenarioTest(
  "harness.promise_registry.load_canonical_yaml_promises",
  "loads canonical YAML promises",
  () => {
    // test body
  },
);
```

这个 helper 应该把 promise id 挂到 Vitest task metadata 上，让 reporter 后续能读到。

### 把结果持久化到文件

Reporter 应该写一个 YAML 结果文件：

```text
.harness/results.yaml
```

`harness verify` 读取这个文件，并和 canonical YAML promises 合并。

这样整个流程是显式、可 debug 的，也不依赖某个进程的生命周期。

Harness 自己拥有的 artifact 默认应该使用 YAML。只有外部工具或协议明确需要时，才使用 JSON。

### 保持 MVP 范围很窄

这个切片暂时不做：

- assertion fingerprints
- evidence drift detection
- browser/app orchestration
- visual UI
- AI-based analysis

这些都应该放在基本的 promise-to-test result loop 跑通之后。

## Data Shape

结果文件使用 YAML parse 加 Effect Schema decode。

```ts
const TestResultSchema = Schema.Struct({
  failureMessage: Schema.optionalKey(Schema.String),
  file: Schema.String,
  promiseId: Schema.String,
  status: Schema.Literals(["passing", "failing", "skipped"]),
  testName: Schema.String,
});

const TestResultsFileSchema = Schema.Struct({
  generatedAt: Schema.String,
  results: Schema.Array(TestResultSchema),
});
```

Report generation 根据这些 results 推导 `PromiseRunStatus`：

- promise id 没有 results -> `unknown`
- 任意 result failing -> `failing`
- 否则任意 result skipped -> `skipped`
- 否则全部 collected results 都 passing -> `passing`

## Implementation Steps

1. 增加一条新的 self-promise：

```text
promises/result-collector/maps-results.promise.yaml
```

它描述 Harness 能把 Vitest results 映射回 canonical promise ids 这一承诺。

2. 在 `packages/core` 里增加 result schemas 和 types。

建议模块：

```text
packages/core/src/results.ts
```

3. 增加一个 Vitest-specific helper。

建议模块：

```text
packages/core/src/vitest.ts
```

它只负责用最小方式把 `promiseId` 挂到当前 Vitest task metadata。

4. 增加一个最小 Vitest reporter。

建议模块：

```text
packages/core/src/vitest-reporter.ts
```

Reporter 收集 `promiseId`、file、test name、status 和 failure message，然后写入 `.harness/results.yaml`。

5. 更新 report generation。

`generateSeedReport(...)` 接收 collected results，并计算 `runStatus`，不再只 hardcode `unknown`。

6. 更新 CLI behavior。

- `harness verify` 如果存在 `.harness/results.yaml`，就读取它。
- `harness report` 可以共享同样行为。
- `harness test` 可以继续保持 stub，也可以等 reporter path 稳定后再变成 orchestrator。

7. 增加测试。

最小测试：

- result file schema 可以 decode 合法 YAML
- 非法 result file 返回 typed error
- 没有 result 时 report status 是 `unknown`
- passing promise result 对应 `passing`
- 任意 bound result failing 时对应 `failing`
- 全部 bound results skipped 时对应 `skipped`
- reporter 可以把 Vitest metadata 映射成持久化 result records

## Open Questions Before Coding

- 确认从 test helper 内部挂 metadata 的准确 Vitest API。
- 确认收集最终 task results 的准确 reporter hook。
- 决定 `scenarioTest` 是直接 wrap `test(...)`，还是提供更底层 helper 同时支持 `test` 和 `it`。

实现前应该先检查当前安装的 Vitest/Vite+ API，再开始写代码。
