@package:harness-daemon
@module:daemon-studio-api
@feature:harness.studio.review-workflow
@locale:en
Feature: Studio review workflow persistence

  @rule:harness.studio.review-action-updates-rule-state
  Rule: Studio review actions update Rule state

    @example:accept-rule-from-studio
    Example: A reviewer accepts a proposed Rule from Studio
      Given a Rule is proposed
      When Studio submits an accept review action for that Rule
      Then the daemon stores the Rule state as accepted with review metadata

  @rule:harness.studio.review-action-appends-history
  Rule: Studio review actions append review-log history

    @example:request-changes-records-review-log
    Example: A reviewer requests changes on a Rule
      Given a Rule is visible in the Studio review queue
      When Studio submits a changes requested review action with a note
      Then the daemon appends a review-log event for the affected Rule
