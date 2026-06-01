@package:harness-project
@module:project-orchestration
@feature:harness.project-orchestration.check-and-report
@locale:en
Feature: Project orchestration

  @rule:harness.project-orchestration.loads-canonical-artifacts
  Rule: Project checks load every canonical Harness artifact

    @example:check-loads-project-artifacts
    Example: A project check loads the full Harness model
      Given a Harness project has config, package, module, locale, behavior, review-log, feature, source, and optional result files
      When the project check is built from existing code
      Then it loads those artifacts into one check result before reporting validation issues

  @rule:harness.project-orchestration.composes-validation-issues
  Rule: Project checks compose validation from every Harness boundary

    @example:check-aggregates-boundary-validation
    Example: Validation issues are collected across project boundaries
      Given package, module, feature, Rule state, review-log, result, and source coverage records exist
      When the project check validates the Harness
      Then it aggregates validation issues from each boundary into one issue list

  @rule:harness.project-orchestration.report-uses-check-model
  Rule: Reports are derived from the same check model

    @example:report-renders-feature-check-output
    Example: A report reuses the project check output
      Given the project check has loaded feature records and validation issues
      When the Harness builds a feature report
      Then the report is generated from the checked feature records and issue list
