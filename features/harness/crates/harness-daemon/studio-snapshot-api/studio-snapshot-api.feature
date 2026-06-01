@package:harness-daemon
@module:daemon-studio-api
@feature:harness.studio.snapshot-api
@locale:en
Feature: Studio snapshot API

  @rule:harness.studio.snapshot-projects-check-model
  Rule: Studio snapshots are projected from the checked Harness model

    @example:snapshot-includes-review-hierarchy
    Example: A snapshot includes packages, modules, localized features, rules, and examples
      Given a Harness project check has loaded manifests, feature records, Rule state records, review logs, and optional results
      When the daemon builds a Studio snapshot
      Then it returns project counts, packages, modules, localized features, rules, examples, review history, and result evidence

  @rule:harness.studio.snapshot-review-queue
  Rule: Studio snapshots expose rules needing human review

    @example:reviewable-rules-appear-in-review-drafts
    Example: Proposed or changes requested Rules appear in the review queue
      Given behavior records contain proposed or changes requested Rules
      When the daemon builds a Studio snapshot
      Then it includes review draft entries pointing reviewers at the owning modules

  @rule:harness.studio.snapshot-empty-project
  Rule: Unsupported projects produce an empty snapshot

    @example:empty-snapshot-has-zero-counts
    Example: A project without Harness artifacts returns an empty review model
      Given Studio requests a project that has no displayable Harness snapshot
      When the daemon returns an empty snapshot
      Then the snapshot contains zero package, module, feature, rule, example, warning, and error counts
