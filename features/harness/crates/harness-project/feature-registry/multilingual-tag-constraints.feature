@package:harness-project
@module:feature-registry
@feature:harness.feature-registry.multilingual-tag-constraints
@locale:en
Feature: Multilingual tag constraints

  @rule:harness.feature-registry.locale-and-example-tags
  Rule: Localized feature files declare locale and example identity tags

    @example:localized-feature-declares-locale-and-example-tags
    Example: A localized feature file exposes language and example identity
      Given a .feature file is written for a review language
      When the Harness scans the feature file
      Then it requires @locale at Feature level and @example on every Example

  @rule:harness.feature-registry.localized-tags-share-identity
  Rule: Translations reuse stable behavior tags

    @example:same-feature-reuses-tags-across-locales
    Example: English and Chinese descriptions point to one behavior identity
      Given English and Chinese .feature files describe the same behavior
      When they share package, module, feature, rule, and example tags
      Then the Harness treats them as localized views of one behavior identity

  @rule:harness.feature-registry.localized-structure-parity
  Rule: Translations preserve Rule, Example, and step shape

    @example:translation-drift-is-reported
    Example: A translated feature cannot silently change behavior structure
      Given localized .feature files share a feature tag
      When their rule tags, example tags, or Given/When/Then step shape diverge
      Then the Harness reports the localized feature set as structurally mismatched

  @rule:harness.feature-registry.english-gherkin-keywords
  Rule: Localized feature files keep English Gherkin keywords

    @example:localized-content-keeps-english-keywords
    Example: Chinese review text still uses English Cucumber keywords
      Given a .feature file uses @locale:zh-CN for Chinese review text
      When an agent writes Feature, Rule, Example, Given, When, Then, And, or But
      Then only the titles and step body text are localized
