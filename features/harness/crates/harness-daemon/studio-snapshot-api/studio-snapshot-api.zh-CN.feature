@package:harness-daemon
@module:daemon-studio-api
@feature:harness.studio.snapshot-api
@locale:zh-CN
Feature: Studio snapshot API

  @rule:harness.studio.snapshot-projects-check-model
  Rule: Studio snapshot 从已 check 的 Harness model 投影出来

    @example:snapshot-includes-review-hierarchy
    Example: Snapshot 包含 packages、modules、多语言 features、rules 和 examples
      Given Harness project check 已经加载 manifests、feature records、Rule state records、review logs 和可选 results
      When daemon 构建 Studio snapshot
      Then 它会返回 project counts、packages、modules、localized features、rules、examples、review history 和 result evidence

  @rule:harness.studio.snapshot-review-queue
  Rule: Studio snapshot 暴露需要人类 review 的 rules

    @example:reviewable-rules-appear-in-review-drafts
    Example: Proposed 或 changes requested Rules 会出现在 review queue
      Given behavior records 包含 proposed 或 changes requested Rules
      When daemon 构建 Studio snapshot
      Then 它会包含 review draft entries，指引 reviewer 找到 owning modules

  @rule:harness.studio.snapshot-empty-project
  Rule: 不支持的 projects 会产生 empty snapshot

    @example:empty-snapshot-has-zero-counts
    Example: 没有 Harness artifacts 的 project 返回空 review model
      Given Studio 请求一个没有可展示 Harness snapshot 的 project
      When daemon 返回 empty snapshot
      Then snapshot 中 package、module、feature、rule、example、warning 和 error counts 都是零
