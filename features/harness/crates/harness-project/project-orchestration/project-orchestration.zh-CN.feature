@package:harness-project
@module:project-orchestration
@feature:harness.project-orchestration.check-and-report
@locale:zh-CN
Feature: Project orchestration

  @rule:harness.project-orchestration.loads-canonical-artifacts
  Rule: Project check 会加载所有 canonical Harness artifacts

    @example:check-loads-project-artifacts
    Example: Project check 会加载完整 Harness model
      Given 一个 Harness project 拥有 config、package、module、locale、behavior、review-log、feature、source 和可选 result files
      When project check 从既有代码构建
      Then 它会先把这些 artifacts 加载成一个 check result，再报告 validation issues

  @rule:harness.project-orchestration.composes-validation-issues
  Rule: Project check 会组合每个 Harness 边界的 validation

    @example:check-aggregates-boundary-validation
    Example: Validation issues 会跨 project boundaries 收集
      Given package、module、feature、Rule state、review-log、result 和 source coverage records 已存在
      When project check 校验 Harness
      Then 它会把每个边界的 validation issues 汇总成一个 issue list

  @rule:harness.project-orchestration.report-uses-check-model
  Rule: Report 来自同一个 check model

    @example:report-renders-feature-check-output
    Example: Report 会复用 project check output
      Given project check 已经加载 feature records 和 validation issues
      When Harness 构建 feature report
      Then report 会从已 check 的 feature records 和 issue list 生成
