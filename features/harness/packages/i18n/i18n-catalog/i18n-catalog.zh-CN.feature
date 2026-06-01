@package:harness-i18n
@module:i18n-catalog
@feature:harness.i18n.catalog-generation
@locale:zh-CN
Feature: I18n catalog generation

  @rule:harness.i18n.supported-locales-are-explicit
  Rule: Studio 支持的 locales 是显式的

    @example:locale-helpers-expose-supported-locales
    Example: Locale helpers 暴露支持的语言集合
      Given Studio code 导入 i18n package
      When code 查询 supported Harness locales 或 locale preferences
      Then 它会通过 typed helpers 暴露 zh-CN、en 和 system preference option

  @rule:harness.i18n.paraglide-config-is-canonical
  Rule: Paraglide compiler configuration 集中管理

    @example:generate-uses-shared-paraglide-options
    Example: Catalog generation 使用共享 compiler options
      Given i18n generate script 运行
      When 它调用 Paraglide
      Then 它会使用 shared config 中的 package project path、generated output directory、declarations、server expression 和 locale strategy

  @rule:harness.i18n.package-exports-runtime-and-messages
  Rule: i18n package 导出 runtime、messages 和 locale helpers

    @example:studio-imports-i18n-entrypoints
    Example: Studio 可以导入 generated messages 和 runtime helpers
      Given 另一个 package 导入 i18n package
      When 它使用 package entrypoints
      Then 它可以访问 locale helpers、generated messages 和 generated runtime
