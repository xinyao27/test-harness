# Harness Test Orchestrator 计划

> 状态：历史计划；当前已在 Rust CLI 中实现为通用 configured-runner 路径。

## Summary

这个切片把早期的两步命令变成一个命令：

```bash
harness test
```

这个命令会运行 `tests/harness.yaml` 中配置的 test runner，通过 `HARNESS_ROOT_DIR` 把 workspace root 传下去，要求产生 Harness result file，然后渲染 `harness verify` 已经在使用的同一份 verification report。在这个仓库里，配置好的 command 使用 Rust adapter runtime 包装 `vp test`，并把 adapter event shards 合并到 `.harness/results.yaml`。

这一步仍然不是 AI-generated implementation。它只是最小可用的自举闭环：

```text
canonical .promises.yaml files
  -> scenarioTest(...) bindings
  -> harness test
  -> configured runner execution
  -> adapter event shards
  -> adapter runtime merge
  -> .harness/results.yaml
  -> promise verification report
```

## Goal

这个切片完成后，人可以：

1. 编写或 review `.promises.yaml` 文件。
2. 用 `scenarioTest(...)` 把可执行测试绑定到 promise ids。
3. 运行一个命令，看到已 review 的 promises 当前是 passing、failing、skipped 还是 unknown。

命令应该保留已有的 report language option：

```bash
harness test --lang zh-CN
```

## Boundaries

这个切片不引入新概念。

不做：

- AI generation from promises
- evidence drift detection
- assertion fingerprints
- browser or app orchestration
- Vitest UI integration
- visual reports

## Behavior

`harness test` 应该：

1. 解析 workspace root。
2. 删除或覆盖旧的 `.harness/results.yaml`。
3. 运行 `tests/harness.yaml` 中配置的 command。
4. 如果 test command 非 0，就失败；如果它仍然写出了 results，就继续渲染 results，让失败的 promises 仍然可见。
5. 如果 test command 非 0 且没有 results，只报告 test command failure，不再额外报告 result file missing。
6. 如果 test command 成功后仍然缺少 `.harness/results.yaml`，就失败。
7. 通过 Rust protocol decoder 读取 `.harness/results.yaml`。
8. 渲染和 `harness verify` 一样的 report。
9. 如果测试失败、result YAML 缺失或无效，或 verification 有 errors，就返回非 0。

这个命令不应该改变 `harness check`、`harness report` 和 `harness verify` 的现有行为。

## Root Handling

Orchestrator 需要明确 root handling：

- 默认 root 是 CLI 的 `cwd`。
- test command 使用这个 root 作为 `cwd`。
- CLI 通过 `HARNESS_ROOT_DIR` 把这个 root 传给 reporter。
- reporter 优先相对 `HARNESS_ROOT_DIR` 写入 `.harness/results.yaml`，只有 env var 不存在时才 fallback 到 test process cwd。

这样第一版实现简单、可预测，也避免 result file 意外写进 package 子目录。未来如果需要从 nested directories 运行 CLI，可以再加 workspace discovery。

## Test Command

这个仓库的开发态自举目前包装：

```bash
vp test
```

打包后的用户应调用已安装的 Harness binary 或 adapter entrypoint，而不是 Cargo。CLI 自身只理解 configured runner contract；Vitest 细节留在 adapter/runtime 边界。

## Done Looks Like

运行：

```bash
harness test --lang zh-CN
```

应该会：

- 执行测试套件
- 创建 `.harness/results.yaml`
- 打印 Seed Harness report
- 显示当前 self-promises 为 `passing`

## Test Plan

- CLI unit test：`harness test` 会调用配置好的 test runner，然后渲染 report。
- CLI unit test：test runner 非 0 时返回非 0，并打印失败信息。
- CLI unit test：只有 test command 成功时，缺少 `.harness/results.yaml` 才返回非 0 并说明缺少 result file。
- CLI unit test：无效 `.harness/results.yaml` 返回非 0，并带 typed error。
- Integration/manual check：

```bash
vp check
vp run -r test
vp run -r build
cargo run -q -p harness-cli -- test --lang zh-CN
```
