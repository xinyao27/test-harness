@package:harness-studio-web
@module:studio-web
@feature:harness.studio.review-workbench
@locale:en
Feature: Studio review workbench

  @rule:harness.studio.review-actions-are-visible
  Rule: Rule review actions are available in Studio

    @example:rule-panel-offers-review-actions
    Example: A Rule panel offers state review actions
      Given Studio has loaded a Harness snapshot with proposed Rules
      When a reviewer opens a Rule panel
      Then the panel offers accept, request changes, reject, deprecate, and supersede actions

  @rule:harness.studio.review-history-is-visible
  Rule: Rule review history is visible in Studio

    @example:rule-panel-shows-review-history
    Example: A Rule panel shows its review-log history
      Given a Rule has review-log events
      When Studio renders that Rule
      Then the reviewer can see previous actions, authors, dates, notes, and summaries
