@package:harness-runner
@module:cucumber-results
@feature:harness.results.cucumber-example-results
@locale:zh-CN
Feature: Cucumber Example results

  @rule:harness.results.identity-without-promise-id
  Rule: Results 绑定到 Cucumber Example identity

    @example:passing-example-uses-cucumber-identity
    Example: 一个 passing Example 会在没有 promise id 的情况下被记录
      Given Cucumber bridge 运行了一个位于 tagged Feature 和 Rule 下面的 Example
      When bridge 输出 normalized Harness result data
      Then result 会通过 feature tag、rule tag 和 example tag 识别

  @rule:harness.results.step-status-summary
  Rule: Example results 包含 step status summaries

    @example:failed-then-step-records-status-summary
    Example: 一个 failed Then step 会把 reviewer 指向行为失败
      Given Cucumber Example 包含 Given、When 和 Then steps
      When 某个 step 在执行过程中失败
      Then Harness result 会记录 Example status、step status summary 和 failure message

  @rule:harness.results.aggregate-through-hierarchy
  Rule: Example status 会沿行为层级汇总

    @example:failing-example-affects-hierarchy
    Example: 一个 failing Example 会让它的 Rule 和 Feature failing
      Given 一个 Feature 有多个 Rules 和 Examples
      When 一个 accepted Example 失败
      Then Harness 会报告对应 Rule、Feature、Module 和 Package 受到影响
