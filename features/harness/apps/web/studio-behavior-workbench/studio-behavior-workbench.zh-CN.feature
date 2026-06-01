@package:harness-studio-web
@module:studio-web
@feature:harness.studio.behavior-workbench
@locale:zh-CN
Feature: Studio behavior workbench

  @rule:harness.studio.workbench-loads-project-snapshot
  Rule: Studio 加载选中 project 的 snapshot

    @example:project-selection-refreshes-snapshot
    Example: 选择 project 会刷新展示的 behavior model
      Given Studio 有一个 workbench projects 列表
      When reviewer 选择一个 project
      Then Studio 会加载这个 project 的 snapshot，并展示 project counts、packages、modules、features、rules 和 examples

  @rule:harness.studio.workbench-prefers-current-locale
  Rule: Studio 优先显示选中 locale 的 feature text

    @example:locale-switch-changes-feature-list
    Example: 切换 locale 会改变可见 feature descriptions
      Given Studio 拥有不止一种 locale 的 localized feature records
      When reviewer 在 zh-CN 和 en 之间切换
      Then Studio 会优先展示选中 locale 的 features，同时保留稳定 behavior tags

  @rule:harness.studio.workbench-opens-feature-files
  Rule: Studio 可以打开 source feature file

    @example:open-file-action-uses-feature-path
    Example: 打开 feature 会使用 snapshot 里的 path
      Given reviewer 正在查看 feature detail panel
      When reviewer 选择打开文件
      Then Studio 会请求 daemon 打开 snapshot 中的 feature path

  @rule:harness.studio.workbench-runs-tests-and-refreshes
  Rule: Studio 运行 Harness tests 并刷新 evidence

    @example:run-tests-refreshes-snapshot-results
    Example: 运行 tests 后会刷新 snapshot
      Given Studio 已连接 daemon
      When reviewer 从 workbench 运行 tests
      Then Studio 会调用 daemon test endpoint、展示最新 run output，并重新加载 snapshot evidence
