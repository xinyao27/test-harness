@package:harness-daemon
@module:daemon-studio-api
@feature:harness.studio.review-workflow
@locale:en
Feature: Studio review workflow persistence

  @rule:harness.studio.review-action-updates-lifecycle
  Rule: Studio review actions update Rule lifecycle and review state

    @example:approve-rule-from-studio
    Example: A reviewer approves a proposed Rule from Studio
      Given a Rule is proposed and pending review
      When Studio submits an approve review action for that Rule
      Then the daemon stores the Rule as accepted with approved review metadata

  @rule:harness.studio.review-action-appends-history
  Rule: Studio review actions append review-log history

    @example:request-changes-records-review-log
    Example: A reviewer requests changes on a Rule
      Given a Rule is visible in the Studio review queue
      When Studio submits a changes requested review action with a note
      Then the daemon appends a review-log event for the affected Rule
