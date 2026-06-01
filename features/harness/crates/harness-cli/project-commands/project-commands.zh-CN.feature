@package:harness-cli
@module:cli-runner
@feature:harness.cli.project-commands
@locale:zh-CN
Feature: Project CLI commands

  @rule:harness.cli.check-validates-project-model
  Rule: harness check 校验 project behavior model

    @example:check-summarizes-validation-issues
    Example: check command 报告 feature count 和 validation issues
      Given Harness project 可以从当前目录加载
      When reviewer 运行 harness check
      Then CLI 会打印包含 feature count、error count、warning count 和 validation issues 的 check summary

  @rule:harness.cli.report-renders-behavior-model
  Rule: harness report 渲染已 check 的 behavior model

    @example:report-renders-summary-or-markdown
    Example: report command 渲染 summary 或完整 markdown output
      Given Harness 可以从 project 构建 feature report
      When reviewer 运行带或不带 --summary 的 harness report
      Then CLI 会渲染对应 behavior report，并在 report 包含 errors 时以非零状态退出

  @rule:harness.cli.verify-aliases-report
  Rule: harness verify 使用 report path

    @example:verify-renders-report-output
    Example: verify command 渲染 report output
      Given reviewer 运行 harness verify
      When CLI 分发这个 command
      Then 它会使用和 harness report 相同的 report rendering behavior

  @rule:harness.cli.invalid-commands-show-usage
  Rule: 无效 CLI input 展示 usage，而不是修改 project

    @example:unknown-command-prints-usage
    Example: Unknown command 会打印 usage 并失败
      Given reviewer 传入未知 Harness command
      When CLI 解析 input
      Then 它会打印 usage text，并在不修改 Harness artifacts 的情况下失败退出
