@package:harness-project
@module:behavior-lifecycle
@feature:harness.lifecycle.reviewed-rules
@locale:en
Feature: Rule lifecycle and human review

  @rule:harness.lifecycle.stored-outside-feature-files
  Rule: Rule lifecycle is stored outside Cucumber feature files

    @example:lifecycle-stored-outside-feature-file
    Example: A feature file stays focused on behavior wording
      Given a Rule exists in a .feature file
      When the Harness records whether that Rule is draft, proposed, accepted, deprecated, or superseded
      Then the lifecycle state is stored in the Harness behavior registry instead of the .feature file

  @rule:harness.lifecycle.acceptance-requires-human-review
  Rule: Accepted behavior requires explicit human review

    @example:agent-cannot-accept-rule-alone
    Example: An agent proposes a Rule but cannot accept it alone
      Given an agent has drafted a new Rule and Examples
      When the agent updates the lifecycle registry
      Then the Rule remains draft or proposed until a human explicitly approves it

  @rule:harness.lifecycle.accepted-change-appends-review-log
  Rule: Accepted behavior changes preserve review history

    @example:accepted-rule-change-records-review-history
    Example: A previously accepted Rule becomes narrower
      Given a Rule has already been accepted by a human
      When its meaning is weakened, narrowed, split, merged, deprecated, or superseded
      Then the review log records the old meaning, new meaning, initiator, reason, and acknowledgement state
