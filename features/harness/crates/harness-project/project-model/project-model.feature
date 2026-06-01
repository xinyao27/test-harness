@package:harness-project
@module:project-model
@feature:harness.project-model.hierarchy
@locale:en
Feature: Harness project model

  Background: Project boundaries make behavior reviewable
    Given humans need to review system behavior without reading every implementation file
    And the Harness project model must match the user's real code and ownership boundaries
    And every reviewable behavior needs stable identity across feature text, Rule state, executable evidence, and review history

  @rule:harness.project-model.package-is-code-boundary
  Rule: Package is the outer code and delivery boundary

    @example:package-groups-owned-modules
    Example: A package groups the modules that belong to one project boundary
      Given a repository contains crates, applications, libraries, services, or other project-owned code boundaries
      When a reviewer opens the Harness behavior model
      Then each Package represents one of those code and delivery boundaries
      And the Package lists the Modules that belong inside that boundary

  @rule:harness.project-model.module-is-reviewable-capability-boundary
  Rule: Module is the reviewable capability boundary inside a Package

    @example:module-describes-human-review-scope
    Example: A module gives humans a focused behavior review scope
      Given a Package contains multiple capabilities, subsystems, or ownership areas
      When the Harness organizes that Package for review
      Then each Module represents a coherent capability boundary
      And the Module declares the source paths and feature files it covers

  @rule:harness.project-model.module-contains-features
  Rule: A Module contains one or more Features

    @example:module-expands-into-features
    Example: A reviewer can move from a module to its concrete behavior features
      Given a Module owns a capability that needs several behavior commitments
      When the Harness builds the project model
      Then the Module links to the Cucumber Features that describe those commitments
      And each Feature can be reviewed through its Rules and Examples

  @rule:harness.project-model.feature-is-cucumber-gherkin-behavior
  Rule: Feature is described with Cucumber and Gherkin

    @example:feature-text-connects-to-executable-evidence
    Example: A feature starts as reviewable Gherkin and later connects to execution evidence
      Given a Module needs a human-readable behavior description
      When an agent drafts that behavior for review
      Then it writes a Cucumber .feature file using Gherkin keywords
      And executable evidence later binds to stable feature, rule, and example tags through a language bridge
