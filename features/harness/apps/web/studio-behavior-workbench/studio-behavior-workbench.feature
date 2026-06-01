@package:harness-studio-web
@module:studio-web
@feature:harness.studio.behavior-workbench
@locale:en
Feature: Studio behavior workbench

  @rule:harness.studio.workbench-loads-project-snapshot
  Rule: Studio loads the selected project snapshot

    @example:project-selection-refreshes-snapshot
    Example: Selecting a project refreshes the displayed behavior model
      Given Studio has a list of workbench projects
      When a reviewer selects a project
      Then Studio loads that project's snapshot and displays project counts, packages, modules, features, rules, and examples

  @rule:harness.studio.workbench-prefers-current-locale
  Rule: Studio prefers feature text for the selected locale

    @example:locale-switch-changes-feature-list
    Example: Switching locale changes the visible feature descriptions
      Given Studio has localized feature records for more than one locale
      When a reviewer switches between zh-CN and en
      Then Studio prefers features for the selected locale while preserving stable behavior tags

  @rule:harness.studio.workbench-opens-feature-files
  Rule: Studio can open the source feature file

    @example:open-file-action-uses-feature-path
    Example: Opening a feature uses the path from the snapshot
      Given a reviewer is viewing a feature detail panel
      When the reviewer chooses to open the file
      Then Studio asks the daemon to open the feature path from the snapshot

  @rule:harness.studio.workbench-runs-tests-and-refreshes
  Rule: Studio runs Harness tests and refreshes evidence

    @example:run-tests-refreshes-snapshot-results
    Example: Running tests refreshes the snapshot after execution
      Given Studio is connected to the daemon
      When a reviewer runs tests from the workbench
      Then Studio calls the daemon test endpoint, shows the latest run output, and reloads the snapshot evidence
