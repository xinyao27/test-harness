@package:harness-runner
@module:cucumber-filtering
@feature:harness.runner.cucumber-filtering
@locale:zh-CN
Feature: Cucumber filtering

  @rule:harness.runner.filter-fields-to-tag-expression
  Rule: Harness filter fields 会变成 Cucumber tag expression

    @example:filter-fields-render-tag-expression
    Example: 层级 filter fields 会渲染成 tag expression
      Given reviewer 选择了 package、module、feature、rule、example 和 locale
      When Harness 准备一次 Cucumber run
      Then 它会为这些 tags 渲染一个用 "and" 连接的 Cucumber tag expression

  @rule:harness.runner.filter-expression-reaches-bridge-command
  Rule: Cucumber filter expression 会传递给 bridge command

    @example:harness-test-provides-filter-environment
    Example: harness test 会把选中的行为切片传给 runner
      Given harness test 使用 Rule 和 locale selection 运行
      When configured runner command 启动
      Then command environment 会包含这个 selection 对应的 Cucumber tag expression
