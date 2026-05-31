@package:harness-cli
@module:cli-runner
@feature:harness.cli.cucumber-test-execution
@locale:zh-CN
Feature: Cucumber test execution

  @rule:harness.cli.test-selects-cucumber-identity
  Rule: harness test 选择 Cucumber behavior identity

    @example:test-command-filters-by-rule
    Example: test run 被限制到一个 Rule
      Given project 配置了 Cucumber bridges，并且 feature files 带有 Rule tags
      When reviewer 使用 Rule tag 运行 harness test
      Then 每个 bridge command 都会收到这个 Rule 的 Cucumber tag filter

  @rule:harness.cli.test-collects-cucumber-evidence
  Rule: harness test 收集 Cucumber Example evidence

    @example:test-command-merges-cucumber-results
    Example: 被选择的 Cucumber run 写入 Harness results
      Given 已配置的 Cucumber bridges 输出 Example events
      When harness test 成功结束
      Then CLI 会把所有 bridge events 合并进 tests/harness.results.yaml 并报告 behavior status
