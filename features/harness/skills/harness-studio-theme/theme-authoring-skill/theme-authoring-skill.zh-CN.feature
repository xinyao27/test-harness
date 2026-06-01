@package:harness-skills
@module:studio-theme-skill
@feature:harness.studio-theme.skill-guidance
@locale:zh-CN
Feature: Studio theme authoring skill

  @rule:harness.studio-theme.source-of-truth-files
  Rule: Theme work 从 Studio theme source of truth 开始

    @example:theme-change-uses-canonical-files
    Example: Theme change 会遵循 canonical theme files
      Given agent 被要求修改 Harness Studio styling 或 theme behavior
      When agent 使用 Studio theme skill
      Then 它会从 skill 指定的 theme definitions、theme application、global CSS variables、settings controls 和 shared UI primitives 开始

  @rule:harness.studio-theme.semantic-token-styling
  Rule: Theme changes 优先使用 semantic tokens，而不是 raw styling

    @example:business-component-avoids-raw-colors
    Example: Business component styling 避免 raw color 和 radius literals
      Given Studio feature component 需要 visual changes
      When agent 应用 theme guidance
      Then 它会使用 semantic Tailwind classes、CSS variables、shared primitives 和 radius tiers，而不是 raw colors、arbitrary sizes 或 one-off radii

  @rule:harness.studio-theme.style-only-stays-style-only
  Rule: Style-only requests 不改变 behavior

    @example:style-refactor-avoids-data-flow-changes
    Example: Style-only refactor 保持 product behavior 不变
      Given 人类只要求 Studio styling、theme 或 visual refactor
      When agent 修改 Studio files
      Then 除非被明确要求，它不会改变 data flow、routing、stores、Harness metadata、API calls 或 review behavior

  @rule:harness.studio-theme.verifies-theme-dimensions
  Rule: Theme work 会验证支持的 theme dimensions

    @example:theme-change-checks-mode-color-and-radius
    Example: Theme change 会检查 mode、color theme 和 radius
      Given Studio theme code 已经变更
      When agent 验证这项工作
      Then 它会检查 build output，并在 browser target 可用时确认 theme mode、color theme 和 radius preset behavior
