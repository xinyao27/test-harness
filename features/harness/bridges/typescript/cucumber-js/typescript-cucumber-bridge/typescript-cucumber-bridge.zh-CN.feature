@package:harness-cucumber-js
@module:typescript-cucumber-bridge
@feature:harness.results.typescript-cucumber-bridge
@locale:zh-CN
Feature: TypeScript Cucumber.js bridge

  @rule:harness.results.cucumber-js-records-example-results
  Rule: TypeScript bridge 记录 Cucumber.js Example results

    @example:cucumber-js-messages-become-harness-result
    Example: Cucumber.js Messages 会变成 Harness Example result
      Given Cucumber.js 为带 tags 的 Example run 输出 Messages
      When TypeScript bridge 转换这些 Messages
      Then 它返回一个由 feature、rule、example 和 locale tags 标识的 Harness result

  @rule:harness.results.cucumber-js-uses-harness-filter
  Rule: TypeScript bridge 把 Harness filters 映射成 Cucumber.js filters

    @example:harness-filter-becomes-cucumber-js-tag-expression
    Example: Harness tag expression 会变成 Cucumber.js run configuration
      Given HARNESS_CUCUMBER_TAG_EXPRESSION 包含一个 Cucumber tag expression
      When TypeScript bridge 准备 Cucumber.js execution
      Then 它会把这个 expression 写入 Cucumber.js user tags 和 run tagExpression configuration

    @example:harness-filter-is-applied-by-cucumber-js-entrypoint
    Example: Cucumber.js entrypoint 会在运行前应用 Harness tag expression
      Given 一个 Cucumber.js executable entrypoint 同时有 selected 和 unselected Examples
      When TypeScript bridge 带着 HARNESS_CUCUMBER_TAG_EXPRESSION 调用 runCucumber
      Then Cucumber.js 只运行匹配 sources.tagExpression 的 Examples
