@package:harness-skills
@module:studio-theme-skill
@feature:harness.studio-theme.skill-guidance
@locale:en
Feature: Studio theme authoring skill

  @rule:harness.studio-theme.source-of-truth-files
  Rule: Theme work starts from the Studio theme source of truth

    @example:theme-change-uses-canonical-files
    Example: A theme change follows the canonical theme files
      Given an agent is asked to change Harness Studio styling or theme behavior
      When the agent uses the Studio theme skill
      Then it starts from the theme definitions, theme application, global CSS variables, settings controls, and shared UI primitives named by the skill

  @rule:harness.studio-theme.semantic-token-styling
  Rule: Theme changes prefer semantic tokens over raw styling

    @example:business-component-avoids-raw-colors
    Example: Business component styling avoids raw color and radius literals
      Given a Studio feature component needs visual changes
      When the agent applies theme guidance
      Then it uses semantic Tailwind classes, CSS variables, shared primitives, and radius tiers instead of raw colors, arbitrary sizes, or one-off radii

  @rule:harness.studio-theme.style-only-stays-style-only
  Rule: Style-only requests do not change behavior

    @example:style-refactor-avoids-data-flow-changes
    Example: A style-only refactor keeps product behavior intact
      Given a human asks only for a Studio styling, theme, or visual refactor
      When the agent changes Studio files
      Then it avoids changing data flow, routing, stores, Harness metadata, API calls, or review behavior unless explicitly requested

  @rule:harness.studio-theme.verifies-theme-dimensions
  Rule: Theme work verifies supported theme dimensions

    @example:theme-change-checks-mode-color-and-radius
    Example: A theme change is checked across mode, color theme, and radius
      Given Studio theme code has changed
      When the agent verifies the work
      Then it checks build output and confirms theme mode, color theme, and radius preset behavior when a browser target is available
