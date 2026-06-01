@package:harness-protocol
@module:protocol-contract
@feature:harness.protocol.v1-artifact-contracts
@locale:zh-CN
Feature: Protocol v1 artifact contracts

  @rule:harness.protocol.api-version-one
  Rule: Harness-owned artifacts 固定 apiVersion 1

    @example:non-v1-artifact-is-rejected
    Example: 非 v1 artifact 会被 protocol model 拒绝
      Given 一个 Harness-owned YAML artifact 通过 protocol crate 解码
      When 这个 artifact 使用的 apiVersion 不是 1
      Then protocol model 会拒绝它，而不是接受静默 shape change

  @rule:harness.protocol.localized-text-shape
  Rule: 面向人的 protocol text 支持 plain 或 localized values

    @example:localized-text-accepts-string-or-locale-map
    Example: Localized text 可以是 string 或 language map
      Given package、module、review 或 review-log text 被解码
      When value 是 plain string 或按 locale keyed 的 text map
      Then protocol model 会把它保留为 LocalizedText

  @rule:harness.protocol.strict-artifact-fields
  Rule: Protocol artifacts 会拒绝 unknown fields

    @example:unknown-fields-fail-decode
    Example: Unknown fields 不会静默进入 Harness artifacts
      Given package、module、behavior、review-log、config、bridge event 或 result artifact 包含 extra field
      When protocol crate 解码这个 artifact
      Then decode 会失败，而不是保留 unknown field

  @rule:harness.protocol.cucumber-result-identity
  Rule: Cucumber results 通过 behavior tags 标识

    @example:result-requires-feature-rule-example-tags
    Example: Result 需要稳定 Cucumber behavior identity
      Given bridge 输出一个 Example result
      When result 通过 protocol crate 解码
      Then 它必须包含 feature、rule、example、locale、status、file、name 和 step data
