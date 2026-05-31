@package:harness-project
@module:feature-registry
@feature:harness.feature-registry.scan-cucumber-features
@locale:zh-CN
Feature: Cucumber feature registry

  @rule:harness.feature-registry.hierarchy-tags
  Rule: Feature 文件声明 Harness 层级 tags

    @example:feature-maps-to-hierarchy-records
    Example: 一个 feature 会映射成 package、module、feature、rule 和 example records
      Given features 目录下存在一个 .feature 文件
      When Harness 扫描 feature 文件
      Then 它会记录 package、module、feature、rule 和 example names
