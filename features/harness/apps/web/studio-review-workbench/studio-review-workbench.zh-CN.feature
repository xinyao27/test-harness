@package:harness-studio-web
@module:studio-web
@feature:harness.studio.review-workbench
@locale:zh-CN
Feature: Studio review workbench

  @rule:harness.studio.review-actions-are-visible
  Rule: Studio 中可以看到 Rule review actions

    @example:rule-panel-offers-review-actions
    Example: Rule panel 提供 lifecycle review actions
      Given Studio 已经加载了包含 pending Rules 的 Harness snapshot
      When reviewer 打开一个 Rule panel
      Then panel 会提供 approve、request changes、reject、deprecate 和 supersede actions

  @rule:harness.studio.review-history-is-visible
  Rule: Studio 中可以看到 Rule review history

    @example:rule-panel-shows-review-history
    Example: Rule panel 展示它的 review-log history
      Given 一个 Rule 已经有 review-log events
      When Studio 渲染这个 Rule
      Then reviewer 可以看到之前的 actions、authors、dates、acknowledgements 和 summaries
