@package:harness-cucumber-rs
@module:rust-cucumber-bridge
@feature:harness.results.rust-cucumber-bridge
@locale:zh-CN
Feature: Rust cucumber-rs evidence bridge

  @rule:harness.results.cucumber-rs-records-example-events
  Rule: Rust bridge 记录 cucumber-rs Example events

    @example:recorded-cucumber-rs-example-emits-bridge-event
    Example: cucumber-rs Example 会作为 Harness evidence 输出
      Given cucumber-rs 已经执行了带 feature、rule、example 和 locale tags 的 Example
      When Rust bridge 记录这个 Example result
      Then 它会写入包含 step statuses 且不含 promise id 的 Cucumber Example bridge event

  @rule:harness.results.runner-run-merges-cucumber-rs-evidence
  Rule: Harness runner 合并 cucumber-rs bridge evidence

    @example:runner-run-merges-run-scoped-cucumber-events
    Example: cucumber-rs bridge run 会生成 normalized Harness results
      Given harness-runner 用新的 run id 和 events directory 启动 Rust bridge
      When bridge 输出 Cucumber Example events
      Then harness-runner 会把选中的 run 合并到 tests/harness.results.yaml

  @rule:harness.results.cucumber-rs-uses-harness-filter
  Rule: Rust bridge 把 Harness filters 映射成 cucumber-rs filters

    @example:harness-filter-becomes-cucumber-rs-tags
    Example: Harness tag expression 会变成 cucumber-rs native tag filter
      Given HARNESS_CUCUMBER_TAG_EXPRESSION 包含一个 Cucumber tag expression
      When Rust bridge 准备 cucumber-rs execution
      Then 它会把这个 expression 暴露成 cucumber-rs tags filter configuration

    @example:harness-filter-is-applied-by-cucumber-rs-entrypoint
    Example: cucumber-rs entrypoint 会在运行前应用 Harness tag expression
      Given 一个 cucumber-rs executable entrypoint 同时有 selected 和 unselected Examples
      When Rust bridge 在 entrypoint 运行前应用 HARNESS_CUCUMBER_TAG_EXPRESSION
      Then cucumber-rs 只运行匹配 native tag filter 的 Examples
