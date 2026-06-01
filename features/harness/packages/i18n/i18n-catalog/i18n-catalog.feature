@package:harness-i18n
@module:i18n-catalog
@feature:harness.i18n.catalog-generation
@locale:en
Feature: I18n catalog generation

  @rule:harness.i18n.supported-locales-are-explicit
  Rule: Supported Studio locales are explicit

    @example:locale-helpers-expose-supported-locales
    Example: Locale helpers expose the supported language set
      Given the i18n package is imported by Studio code
      When code asks for supported Harness locales or locale preferences
      Then it exposes zh-CN, en, and a system preference option through typed helpers

  @rule:harness.i18n.paraglide-config-is-canonical
  Rule: Paraglide compiler configuration is centralized

    @example:generate-uses-shared-paraglide-options
    Example: Catalog generation uses the shared compiler options
      Given the i18n generate script runs
      When it invokes Paraglide
      Then it uses the package project path, generated output directory, declarations, server expression, and locale strategy from the shared config

  @rule:harness.i18n.package-exports-runtime-and-messages
  Rule: The i18n package exports runtime, messages, and locale helpers

    @example:studio-imports-i18n-entrypoints
    Example: Studio can import generated messages and runtime helpers
      Given another package imports the i18n package
      When it uses the package entrypoints
      Then it can access locale helpers, generated messages, and the generated runtime
