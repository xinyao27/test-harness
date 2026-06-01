@package:harness-daemon
@module:daemon-studio-api
@feature:harness.studio.review-workflow
@locale:zh-CN
Feature: Studio review workflow persistence

  @rule:harness.studio.review-action-updates-rule-state
  Rule: Studio review actions 更新 Rule state

    @example:accept-rule-from-studio
    Example: Reviewer 从 Studio accept proposed Rule
      Given 一个 Rule 处于 proposed
      When Studio 为这个 Rule 提交 accept review action
      Then daemon 会把这个 Rule state 存为 accepted，并写入 review metadata

  @rule:harness.studio.review-action-appends-history
  Rule: Studio review actions 追加 review-log history

    @example:request-changes-records-review-log
    Example: Reviewer 对 Rule 请求修改
      Given 一个 Rule 出现在 Studio review queue 中
      When Studio 提交带 note 的 changes requested review action
      Then daemon 会为受影响 Rule 追加 review-log event
