@package:harness-cli
@module:cli-runner
@feature:harness.cli.project-commands
@locale:en
Feature: Project CLI commands

  @rule:harness.cli.check-validates-project-model
  Rule: harness check validates the project behavior model

    @example:check-summarizes-validation-issues
    Example: The check command reports feature count and validation issues
      Given a Harness project can be loaded from the current directory
      When a reviewer runs harness check
      Then the CLI prints a check summary with feature count, error count, warning count, and validation issues

  @rule:harness.cli.report-renders-behavior-model
  Rule: harness report renders the checked behavior model

    @example:report-renders-summary-or-markdown
    Example: The report command renders summary or full markdown output
      Given the Harness can build a feature report from the project
      When a reviewer runs harness report with or without --summary
      Then the CLI renders the corresponding behavior report and exits nonzero when the report contains errors

  @rule:harness.cli.verify-aliases-report
  Rule: harness verify uses the report path

    @example:verify-renders-report-output
    Example: The verify command renders report output
      Given a reviewer runs harness verify
      When the CLI dispatches the command
      Then it uses the same report rendering behavior as harness report

  @rule:harness.cli.invalid-commands-show-usage
  Rule: Invalid CLI input shows usage instead of mutating the project

    @example:unknown-command-prints-usage
    Example: An unknown command prints usage and fails
      Given a reviewer passes an unknown Harness command
      When the CLI parses the input
      Then it prints usage text and exits with failure without changing Harness artifacts
