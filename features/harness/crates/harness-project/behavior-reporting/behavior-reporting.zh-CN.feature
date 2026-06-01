@package:harness-project
@module:behavior-report
@feature:harness.report.behavior-coverage
@locale:zh-CN
Feature: 行为报告和覆盖率

  @rule:harness.report.shows-package-module-feature-rule-example
  Rule: 报告展示完整行为层级

    @example:summary-report-names-review-layers
    Example: Summary report 会列出每个 review 层级
      Given Harness 拥有 package、module、feature、rule 和 example records
      When reviewer 运行 summary report
      Then report 会按 Package、Module、Feature、Rule 和 Example 组织行为

  @rule:harness.report.separates-rule-state-from-run-status
  Rule: 报告将 Rule state 和 run status 分开

    @example:accepted-behavior-can-fail
    Example: Accepted 行为当前可以失败
      Given 一个 Rule 的 state 是 accepted
      When 它最新的 Example result 是 failing
      Then report 会同时展示这个 Rule 是 accepted 和 failing

  @rule:harness.report.highlights-coverage-gaps
  Rule: 报告突出行为覆盖缺口

    @example:accepted-behavior-without-evidence-is-visible
    Example: 缺少 executable evidence 的 accepted 行为是可见的
      Given 一个 Rule 的 state 是 accepted
      When 没有 normalized Cucumber result 绑定到它的 Examples
      Then report 会把这个 accepted 行为标记为缺少 executable evidence
