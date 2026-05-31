@package:harness-cli
@module:cli-runner
@feature:harness.cli.cucumber-test-execution
@locale:en
Feature: Cucumber test execution

  @rule:harness.cli.test-selects-cucumber-identity
  Rule: harness test selects Cucumber behavior identity

    @example:test-command-filters-by-rule
    Example: A test run is limited to one Rule
      Given the project has configured Cucumber bridges and feature files with Rule tags
      When a reviewer runs harness test with a Rule tag
      Then each bridge command receives a Cucumber tag filter for that Rule

  @rule:harness.cli.test-collects-cucumber-evidence
  Rule: harness test collects Cucumber Example evidence

    @example:test-command-merges-cucumber-results
    Example: A selected Cucumber run writes Harness results
      Given the configured Cucumber bridges emit Example events
      When harness test completes successfully
      Then the CLI merges all bridge events into tests/harness.results.yaml and reports behavior status
