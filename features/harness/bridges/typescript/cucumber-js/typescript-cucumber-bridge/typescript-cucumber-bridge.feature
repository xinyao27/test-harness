@package:harness-cucumber-js
@module:typescript-cucumber-bridge
@feature:harness.results.typescript-cucumber-bridge
@locale:en
Feature: TypeScript Cucumber.js bridge

  @rule:harness.results.cucumber-js-records-example-results
  Rule: TypeScript bridge records Cucumber.js Example results

    @example:cucumber-js-messages-become-harness-result
    Example: Cucumber.js Messages become a Harness Example result
      Given Cucumber.js emits Messages for a tagged Example run
      When the TypeScript bridge converts those Messages
      Then it returns a Harness result identified by feature, rule, example, and locale tags

  @rule:harness.results.cucumber-js-uses-harness-filter
  Rule: TypeScript bridge maps Harness filters to Cucumber.js filters

    @example:harness-filter-becomes-cucumber-js-tag-expression
    Example: A Harness tag expression becomes Cucumber.js run configuration
      Given HARNESS_CUCUMBER_TAG_EXPRESSION contains a Cucumber tag expression
      When the TypeScript bridge prepares Cucumber.js execution
      Then it writes that expression to Cucumber.js user tags and run tagExpression configuration

    @example:harness-filter-is-applied-by-cucumber-js-entrypoint
    Example: The Cucumber.js entrypoint applies the Harness tag expression before running
      Given a Cucumber.js executable entrypoint has selected and unselected Examples
      When the TypeScript bridge calls runCucumber with HARNESS_CUCUMBER_TAG_EXPRESSION
      Then Cucumber.js runs only the Examples matching sources.tagExpression
