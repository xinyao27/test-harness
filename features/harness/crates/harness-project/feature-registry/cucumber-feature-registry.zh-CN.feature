@package:harness-project
@module:feature-registry
@feature:harness.feature-registry.scan-cucumber-features
@locale:zh-CN
Feature: Cucumber feature registry

  Background:
    Given 人类通过 Cucumber feature files review Harness 行为
    And 每条行为记录都需要稳定的 package、module、feature、rule 和 example 身份
    And project model 依赖解析后的 feature files，而不是手写的重复索引

  @rule:harness.feature-registry.hierarchy-tags
  Rule: Feature 文件声明 Harness 层级 tags

    @example:feature-maps-to-hierarchy-records
    Example: 一个 feature 会映射成 package、module、feature、rule 和 example records
      Given features 目录下存在一个 .feature 文件
      When Harness 扫描 feature 文件
      Then 它会记录 package、module、feature、rule 和 example names
