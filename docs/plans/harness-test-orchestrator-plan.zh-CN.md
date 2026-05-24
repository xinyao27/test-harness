# Harness Test Orchestrator 计划

## Summary

下一个切片要把当前的两步命令变成一个命令：

```bash
harness test
```

这个命令会从 workspace root 运行 Vite+/Vitest，让 Harness reporter 写入 `.harness/results.yaml`，然后渲染 `harness verify` 已经在使用的同一份 verification report。

这一步仍然不是 AI-generated implementation。它只是最小可用的自举闭环：

```text
canonical .promise.yaml files
  -> scenarioTest(...) bindings
  -> harness test
  -> Vitest execution
  -> .harness/results.yaml
  -> promise verification report
```

## Goal

这个切片完成后，人可以：

1. 编写或 review `.promise.yaml` 文件。
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
3. 运行配置好的 Vite+/Vitest 命令。
4. 如果 test command 非 0，就失败。
5. 通过已有 Effect Schema decoder 读取 `.harness/results.yaml`。
6. 渲染和 `harness verify` 一样的 report。
7. 如果测试失败、result YAML 无效，或 verification 有 errors，就返回非 0。

这个命令不应该改变 `harness check`、`harness report` 和 `harness verify` 的现有行为。

## Root Handling

Orchestrator 需要明确 root handling：

- 默认 root 是 CLI 的 `cwd`。
- test command 使用这个 root 作为 `cwd`。
- reporter 继续相对 test process cwd 写入 `.harness/results.yaml`。

这样第一版实现简单、可预测。未来如果需要从 nested directories 运行 CLI，可以再加 workspace discovery。

## Test Command

第一版使用当前 repo 已经存在的命令：

```bash
vp run -r test
```

这个命令应该集中在一个小 helper 里，方便以后变成 configurable，而不影响 report logic。

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
- CLI unit test：无效 `.harness/results.yaml` 返回非 0，并带 typed error。
- Integration/manual check：

```bash
vp check
vp run -r test
vp run -r build
vp exec harness test --lang zh-CN
```
