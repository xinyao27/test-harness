@package:harness-runner
@module:cucumber-results
@feature:harness.results.cucumber-example-results
@locale:en
Feature: Cucumber Example results

  @rule:harness.results.identity-without-promise-id
  Rule: Results bind to Cucumber Example identity

    @example:passing-example-uses-cucumber-identity
    Example: A passing Example is recorded without a promise id
      Given a Cucumber bridge runs an Example under a tagged Feature and Rule
      When the bridge emits normalized Harness result data
      Then the result is identified by feature tag, rule tag, and example tag

  @rule:harness.results.step-status-summary
  Rule: Example results include step status summaries

    @example:failed-then-step-records-status-summary
    Example: A failed Then step points reviewers at the behavioral failure
      Given a Cucumber Example has Given, When, and Then steps
      When one step fails during execution
      Then the Harness result records the Example status, step status summary, and failure message

  @rule:harness.results.aggregate-through-hierarchy
  Rule: Example status aggregates through the behavior hierarchy

    @example:failing-example-affects-hierarchy
    Example: A failing Example makes its Rule and Feature failing
      Given a Feature has multiple Rules and Examples
      When one accepted Example fails
      Then the Harness reports the owning Rule, Feature, Module, and Package as affected
