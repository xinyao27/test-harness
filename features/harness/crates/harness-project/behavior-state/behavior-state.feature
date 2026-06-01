@package:harness-project
@module:behavior-state
@feature:harness.state.reviewed-rules
@locale:en
Feature: Rule state and human review

  Background: Rule state protects reviewed behavior
    Given Harness behavior is described in Cucumber feature files for human review
    And .feature files must stay focused on localized behavior wording
    And Rule state decides whether an agent may start executable tests or implementation work

  @rule:harness.state.stored-outside-feature-files
  Rule: Rule state is stored outside Cucumber feature files

    @example:state-stored-outside-feature-file
    Example: A feature file stays focused on behavior wording
      Given a Rule exists in a .feature file
      When the Harness records whether that Rule is draft, proposed, accepted, changes requested, rejected, deprecated, or superseded
      Then the Rule state is stored in the Harness behavior registry instead of the .feature file

  @rule:harness.state.acceptance-requires-human-review
  Rule: Accepted behavior requires explicit human review

    @example:agent-cannot-accept-rule-alone
    Example: An agent proposes a Rule but cannot accept it alone
      Given an agent has drafted a new Rule and Examples
      When the agent updates the Rule state registry
      Then the Rule remains draft or proposed until a human explicitly accepts it

  @rule:harness.state.accepted-change-appends-review-log
  Rule: Accepted behavior changes preserve review history

    @example:accepted-rule-change-records-review-history
    Example: A previously accepted Rule becomes narrower
      Given a Rule has already been accepted by a human
      When its meaning is weakened, narrowed, split, merged, deprecated, or superseded
      Then the review log records the old meaning, new meaning, initiator, reason, and review note
