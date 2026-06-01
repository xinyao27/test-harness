@package:harness-project
@module:feature-registry
@feature:harness.feature-registry.scan-cucumber-features
@locale:en
Feature: Cucumber feature registry

  Background:
    Given humans review Harness behavior through Cucumber feature files
    And every behavior record needs stable package, module, feature, rule, and example identity
    And the project model depends on parsed feature files instead of handwritten duplicate indexes

  @rule:harness.feature-registry.hierarchy-tags
  Rule: Feature files declare Harness hierarchy tags

    @example:feature-maps-to-hierarchy-records
    Example: A feature maps to package, module, feature, rule, and example records
      Given a .feature file exists under the features directory
      When the Harness scans feature files
      Then it records the package, module, feature, rule, and example names
