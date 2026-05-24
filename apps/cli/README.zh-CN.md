# @test-harness/cli

Seed Harness 的 CLI。

## Commands

- `harness check`：校验 canonical promise files 和已知 bindings。
- `harness report`：基于已有 results 渲染 promise report。
- `harness verify`：seed loop 中的 report alias。
- `harness test`：运行配置好的 adapter command，收集 `.harness/results.yaml`，然后渲染 verification report。

所有 report commands 都支持：

```bash
harness test --lang zh-CN
```
