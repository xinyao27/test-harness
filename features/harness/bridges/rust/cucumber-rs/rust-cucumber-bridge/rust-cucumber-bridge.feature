@package:harness-cucumber-rs
@module:rust-cucumber-bridge
@feature:harness.results.rust-cucumber-bridge
@locale:en
Feature: Rust cucumber-rs evidence bridge

  @rule:harness.results.cucumber-rs-records-example-events
  Rule: Rust bridge records cucumber-rs Example events

    @example:recorded-cucumber-rs-example-emits-bridge-event
    Example: A cucumber-rs Example is emitted as Harness evidence
      Given cucumber-rs has executed an Example with feature, rule, example, and locale tags
      When the Rust bridge records the Example result
      Then it writes a Cucumber Example bridge event with step statuses and no promise id

  @rule:harness.results.runner-run-merges-cucumber-rs-evidence
  Rule: Harness runner merges cucumber-rs bridge evidence

    @example:runner-run-merges-run-scoped-cucumber-events
    Example: A cucumber-rs bridge run produces normalized Harness results
      Given harness-runner starts the Rust bridge with a fresh run id and events directory
      When the bridge emits Cucumber Example events
      Then harness-runner merges the selected run into tests/harness.results.yaml

  @rule:harness.results.cucumber-rs-uses-harness-filter
  Rule: Rust bridge maps Harness filters to cucumber-rs filters

    @example:harness-filter-becomes-cucumber-rs-tags
    Example: A Harness tag expression becomes a cucumber-rs native tag filter
      Given HARNESS_CUCUMBER_TAG_EXPRESSION contains a Cucumber tag expression
      When the Rust bridge prepares cucumber-rs execution
      Then it exposes that expression as cucumber-rs tags filter configuration

    @example:harness-filter-is-applied-by-cucumber-rs-entrypoint
    Example: The cucumber-rs entrypoint applies the Harness tag expression before running
      Given a cucumber-rs executable entrypoint has selected and unselected Examples
      When the Rust bridge applies HARNESS_CUCUMBER_TAG_EXPRESSION before the entrypoint runs
      Then cucumber-rs runs only the Examples matching the native tag filter
