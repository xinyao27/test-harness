@package:harness-skills
@module:agent-authoring
@feature:harness.agent-skill.author-bdd-harness
@locale:en
Feature: Harness BDD authoring skill

  @rule:harness.agent-skill.behavior-before-code
  Rule: Agents require accepted behavior before tests and implementation

    @example:capability-starts-as-bdd-structure
    Example: A requested Harness capability waits for feature acceptance
      Given a human asks an agent to add a Harness capability
      When the agent uses the Harness BDD authoring skill
      Then the agent drafts package, module, feature, rule, state, and review-log artifacts and waits for human acceptance before writing step definitions, tests, or implementation logic

  @rule:harness.agent-skill.interactive-feature-review
  Rule: Agents review features through explicit human decisions

    @example:review-feature-one-by-one-with-human-decision
    Example: A feature review asks before moving to the next item
      Given a human asks an agent to review Harness features
      When the agent uses the Harness BDD authoring skill
      Then the agent shows the package, module, feature tag, locale, Rule state, Background, Rule titles, Example titles, and exact Given/When/Then steps before asking the human to accept, request changes, reject, deprecate, supersede, or update the feature text

  @rule:harness.agent-skill.feature-intake-modes
  Rule: Agents create proposed features from discussion or existing code

    @example:feature-from-human-discussion
    Example: A discussed need becomes proposed behavior artifacts
      Given a human and agent have discussed a new Harness capability
      When the agent drafts the behavior model
      Then the agent creates proposed package, module, feature, Rule, Example, state, and review-log artifacts before implementation

    @example:feature-from-existing-code
    Example: Existing code becomes proposed behavior for review
      Given a Harness behavior already exists in implementation code
      When the agent derives .feature text from that code
      Then the agent marks the behavior as proposed and asks the human whether the observed behavior should be accepted, changed, deprecated, or rejected

  @rule:harness.agent-skill.background-captures-feature-purpose
  Rule: Agents write Background to explain why a feature exists

    @example:background-explains-review-context
    Example: A generated feature includes its review context
      Given an agent drafts or updates a Harness .feature file
      When the agent writes the feature before human review
      Then the agent includes a Background that explains why the feature exists, what human problem it protects, and what shared assumptions make the Rules meaningful

  @rule:harness.agent-skill.no-promise-workflow
  Rule: Agents avoid the old promise workflow

    @example:no-promises-yaml-for-feature-change
    Example: A feature change does not create .promises.yaml files
      Given the repository is using the Cucumber BDD Harness model
      When an agent authors a new behavior description
      Then the agent writes .feature and Harness registry files instead of .promises.yaml files

  @rule:harness.agent-skill.language-bridges-not-framework-adapters
  Rule: Agents keep language execution in Cucumber bridge boundaries

    @example:typescript-frameworks-stay-inside-steps
    Example: A TypeScript test framework does not become a Harness adapter
      Given a Harness project uses Vitest, Jest, Playwright, or another TypeScript test tool
      When an agent connects executable Feature evidence to that project
      Then the agent routes Harness evidence through Cucumber.js and a language bridge instead of creating a framework-specific Harness adapter

  @rule:harness.agent-skill.cucumber-examples-are-test-entrypoints
  Rule: Agents use Cucumber Examples as the test entrypoints for Harness behavior

    @example:no-extra-outer-test-for-harness-behavior
    Example: A Harness behavior change is not proven by a separate outer test
      Given a human asks an agent to implement new Harness behavior
      When the agent adds executable evidence for that behavior
      Then the evidence starts from a corresponding Cucumber Example instead of a separate unit, integration, Vitest, Jest, or Cargo test entrypoint

  @rule:harness.agent-skill.handoff-at-behavior-level
  Rule: Agents hand back work at behavior level

    @example:handoff-reports-behavior-level
    Example: The final report names Rule state and evidence gaps
      Given an agent has changed Harness behavior artifacts
      When the agent summarizes the work for a human
      Then the summary names touched Packages, Modules, Features, Rules, Rule states, evidence status, and verification commands
