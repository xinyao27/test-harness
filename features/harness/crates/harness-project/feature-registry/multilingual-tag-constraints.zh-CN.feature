@package:harness-project
@module:feature-registry
@feature:harness.feature-registry.multilingual-tag-constraints
@locale:zh-CN
Feature: 多语言 tag 约束

  @rule:harness.feature-registry.locale-and-example-tags
  Rule: 多语言 feature 文件声明 locale 和 example 身份 tags

    @example:localized-feature-declares-locale-and-example-tags
    Example: 一个多语言 feature 文件暴露语言和 example 身份
      Given .feature 文件是为某个 review language 编写的
      When Harness 扫描这个 feature 文件
      Then 它要求 Feature 层有 @locale，并且每个 Example 都有 @example

  @rule:harness.feature-registry.localized-tags-share-identity
  Rule: 翻译复用稳定行为 tags

    @example:same-feature-reuses-tags-across-locales
    Example: 英文和中文描述指向同一个行为身份
      Given 英文和中文 .feature 文件描述同一个行为
      When 它们共享 package、module、feature、rule 和 example tags
      Then Harness 会把它们视为同一个行为身份的多语言视图

  @rule:harness.feature-registry.localized-structure-parity
  Rule: 翻译保留 Rule、Example 和 step shape

    @example:translation-drift-is-reported
    Example: 翻译后的 feature 不能悄悄改变行为结构
      Given 多语言 .feature 文件共享同一个 feature tag
      When 它们的 rule tags、example tags 或 Given/When/Then step shape 发生分歧
      Then Harness 会报告这组多语言 feature 存在结构不匹配

  @rule:harness.feature-registry.english-gherkin-keywords
  Rule: 多语言 feature 文件保留英文 Gherkin 关键词

    @example:localized-content-keeps-english-keywords
    Example: 中文 review 文本仍使用英文 Cucumber 关键词
      Given 一个 .feature 文件使用 @locale:zh-CN 表示中文 review 文本
      When agent 编写 Feature、Rule、Example、Given、When、Then、And 或 But
      Then 只有 titles 和 step body text 会被本地化
