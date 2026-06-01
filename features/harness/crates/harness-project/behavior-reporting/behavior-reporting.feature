@package:harness-project
@module:behavior-report
@feature:harness.report.behavior-coverage
@locale:en
Feature: Behavior report and coverage

  @rule:harness.report.shows-package-module-feature-rule-example
  Rule: Reports show the full behavior hierarchy

    @example:summary-report-names-review-layers
    Example: A summary report names every review layer
      Given the Harness has package, module, feature, rule, and example records
      When a reviewer runs the summary report
      Then the report groups behavior by Package, Module, Feature, Rule, and Example

  @rule:harness.report.separates-rule-state-from-run-status
  Rule: Reports keep Rule state separate from run status

    @example:accepted-behavior-can-fail
    Example: Accepted behavior can currently fail
      Given a Rule has state accepted
      When its latest Example result is failing
      Then the report shows the Rule as accepted and failing at the same time

  @rule:harness.report.highlights-coverage-gaps
  Rule: Reports highlight behavior coverage gaps

    @example:accepted-behavior-without-evidence-is-visible
    Example: Accepted behavior without executable evidence is visible
      Given a Rule has state accepted
      When no normalized Cucumber result binds to its Examples
      Then the report highlights the accepted behavior as missing executable evidence
