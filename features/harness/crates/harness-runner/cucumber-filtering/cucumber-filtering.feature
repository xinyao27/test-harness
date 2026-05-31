@package:harness-runner
@module:cucumber-filtering
@feature:harness.runner.cucumber-filtering
@locale:en
Feature: Cucumber filtering

  @rule:harness.runner.filter-fields-to-tag-expression
  Rule: Harness filter fields become Cucumber tag expressions

    @example:filter-fields-render-tag-expression
    Example: Hierarchy filter fields render as a tag expression
      Given a reviewer selects package, module, feature, rule, example, and locale
      When Harness prepares a Cucumber run
      Then it renders one Cucumber tag expression joined by "and" for those tags

  @rule:harness.runner.filter-expression-reaches-bridge-command
  Rule: Cucumber filter expressions reach the bridge command

    @example:harness-test-provides-filter-environment
    Example: harness test passes the selected behavior slice to the runner
      Given harness test is run with a Rule and locale selection
      When the configured runner command is started
      Then the command environment contains the Cucumber tag expression for that selection
