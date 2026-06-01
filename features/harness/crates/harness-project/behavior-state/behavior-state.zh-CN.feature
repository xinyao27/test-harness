@package:harness-project
@module:behavior-state
@feature:harness.state.reviewed-rules
@locale:zh-CN
Feature: Rule state and human review

  Background: Rule state 保护已经 review 的行为
    Given Harness 行为用 Cucumber feature 文件描述，供人类 review
    And .feature 文件必须只关注本地化后的行为文字
    And Rule state 决定 agent 是否可以开始写可执行测试或实现代码

  @rule:harness.state.stored-outside-feature-files
  Rule: Rule state 存在 Cucumber feature 文件之外

    @example:state-stored-outside-feature-file
    Example: Feature 文件只关注行为文字
      Given .feature 文件里存在一个 Rule
      When Harness 记录这个 Rule 是 draft、proposed、accepted、changes requested、rejected、deprecated 还是 superseded
      Then Rule state 会存入 Harness behavior registry，而不是 .feature 文件

  @rule:harness.state.acceptance-requires-human-review
  Rule: Accepted 行为需要明确的人类 review

    @example:agent-cannot-accept-rule-alone
    Example: Agent 可以提出 Rule，但不能独自接受它
      Given agent 已经草拟了新的 Rule 和 Examples
      When agent 更新 Rule state registry
      Then Rule 会保持 draft 或 proposed，直到人类明确 accept

  @rule:harness.state.accepted-change-appends-review-log
  Rule: Accepted 行为变更会保留 review history

    @example:accepted-rule-change-records-review-history
    Example: 一个已经 accepted 的 Rule 变窄
      Given 一个 Rule 已经被人类 accepted
      When 它的含义被弱化、变窄、拆分、合并、废弃或替代
      Then review log 会记录旧含义、新含义、发起人、原因和 review note
