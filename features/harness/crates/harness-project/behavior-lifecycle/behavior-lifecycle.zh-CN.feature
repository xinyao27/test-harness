@package:harness-project
@module:behavior-lifecycle
@feature:harness.lifecycle.reviewed-rules
@locale:zh-CN
Feature: Rule 生命周期和人类 review

  @rule:harness.lifecycle.stored-outside-feature-files
  Rule: Rule lifecycle 存在 Cucumber feature 文件之外

    @example:lifecycle-stored-outside-feature-file
    Example: Feature 文件只关注行为文字
      Given .feature 文件里存在一个 Rule
      When Harness 记录这个 Rule 是 draft、proposed、accepted、deprecated 还是 superseded
      Then lifecycle state 会存入 Harness behavior registry，而不是 .feature 文件

  @rule:harness.lifecycle.acceptance-requires-human-review
  Rule: Accepted 行为需要明确的人类 review

    @example:agent-cannot-accept-rule-alone
    Example: Agent 可以提出 Rule，但不能独自接受它
      Given agent 已经草拟了新的 Rule 和 Examples
      When agent 更新 lifecycle registry
      Then Rule 会保持 draft 或 proposed，直到人类明确批准

  @rule:harness.lifecycle.accepted-change-appends-review-log
  Rule: Accepted 行为变更会保留 review 历史

    @example:accepted-rule-change-records-review-history
    Example: 一个已经 accepted 的 Rule 变窄
      Given 一个 Rule 已经被人类 accepted
      When 它的含义被弱化、变窄、拆分、合并、废弃或替代
      Then review log 会记录旧含义、新含义、发起人、原因和确认状态
