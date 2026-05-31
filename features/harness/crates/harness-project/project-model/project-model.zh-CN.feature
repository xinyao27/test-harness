@package:harness-project
@module:project-model
@feature:harness.project-model.hierarchy
@locale:zh-CN
Feature: Harness project model

  @rule:harness.project-model.package-module-feature-rule-example
  Rule: Harness 行为从 Package 组织到 Example

    @example:reviewer-scans-package-to-example
    Example: Reviewer 可以从 package 扫描到 executable example
      Given Harness project 存在 package 和 module manifests
      When reviewer 打开 Harness behavior model
      Then reviewer 可以从每个 Package 追踪到它的 Modules、Features、Rules 和 Examples

  @rule:harness.project-model.manifest-tags-match-feature-files
  Rule: Manifest ids 和 feature tags 描述同一个层级

    @example:feature-file-tags-resolve-to-manifests
    Example: Feature 文件会指回它声明的 package 和 module
      Given .feature 文件声明了 package、module、feature 和 rule tags
      When Harness 构建 project model
      Then 这些 tags 会解析到 package 和 module manifest records

  @rule:harness.project-model.tags-are-language-neutral
  Rule: 稳定 tags 不被本地化

    @example:multilingual-text-shares-behavior-identity
    Example: 中文和英文 review 文本可以共享同一个行为身份
      Given 一个行为用不止一种语言描述给人类
      When Harness 比较 lifecycle、review 和 result records
      Then 它会使用稳定的 package、module、feature、rule 和 example tags，而不是翻译后的 names
