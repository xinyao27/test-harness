@package:harness-project
@module:project-model
@feature:harness.project-model.hierarchy
@locale:en
Feature: Harness project model

  @rule:harness.project-model.package-module-feature-rule-example
  Rule: Harness behavior is organized from Package to Example

    @example:reviewer-scans-package-to-example
    Example: A reviewer can scan the project from package to executable example
      Given package and module manifests exist for the Harness project
      When a reviewer opens the Harness behavior model
      Then the reviewer can follow each Package to its Modules, Features, Rules, and Examples

  @rule:harness.project-model.manifest-tags-match-feature-files
  Rule: Manifest ids and feature tags describe the same hierarchy

    @example:feature-file-tags-resolve-to-manifests
    Example: A feature file points back to its declared package and module
      Given a .feature file declares package, module, feature, and rule tags
      When the Harness builds the project model
      Then those tags resolve to package and module manifest records

  @rule:harness.project-model.tags-are-language-neutral
  Rule: Stable tags are not localized

    @example:multilingual-text-shares-behavior-identity
    Example: Chinese and English review text can share the same behavior identity
      Given a behavior is described for humans in more than one language
      When the Harness compares lifecycle, review, and result records
      Then it uses stable package, module, feature, rule, and example tags instead of translated names
