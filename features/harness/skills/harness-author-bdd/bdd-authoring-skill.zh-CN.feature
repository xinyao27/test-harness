@package:harness-skills
@module:agent-authoring
@feature:harness.agent-skill.author-bdd-harness
@locale:zh-CN
Feature: Harness BDD 编写 skill

  @rule:harness.agent-skill.behavior-before-code
  Rule: Agent 需要 approved 行为后才能写测试和实现

    @example:capability-starts-as-bdd-structure
    Example: 一个 Harness 能力请求会等待 feature approval
      Given 人类要求 agent 增加一个 Harness 能力
      When agent 使用 Harness BDD 编写 skill
      Then agent 会先草拟 package、module、feature、rule、lifecycle 和 review-log artifacts，并等待人类 approval 后才写 step definitions、tests 或实现逻辑

  @rule:harness.agent-skill.no-promise-workflow
  Rule: Agent 避免旧 promise 工作流

    @example:no-promises-yaml-for-feature-change
    Example: 一个 feature 变更不会创建 .promises.yaml 文件
      Given 仓库正在使用 Cucumber BDD Harness 模型
      When agent 编写新的行为描述
      Then agent 会写 .feature 和 Harness registry 文件，而不是 .promises.yaml 文件

  @rule:harness.agent-skill.language-bridges-not-framework-adapters
  Rule: Agent 把语言执行放在 Cucumber bridge 边界里

    @example:typescript-frameworks-stay-inside-steps
    Example: TypeScript 测试框架不会变成 Harness adapter
      Given Harness 项目使用 Vitest、Jest、Playwright 或其他 TypeScript 测试工具
      When agent 将可执行 Feature evidence 接入这个项目
      Then agent 会通过 Cucumber.js 和 language bridge 汇入 Harness evidence，而不是创建面向具体框架的 Harness adapter

  @rule:harness.agent-skill.cucumber-examples-are-test-entrypoints
  Rule: Agent 使用 Cucumber Examples 作为 Harness 行为测试入口

    @example:no-extra-outer-test-for-harness-behavior
    Example: Harness 行为变更不会被额外的外层测试证明
      Given 人类要求 agent 实现新的 Harness 行为
      When agent 为这个行为添加 executable evidence
      Then evidence 会从对应的 Cucumber Example 开始，而不是从独立的 unit、integration、Vitest、Jest 或 Cargo test 入口开始

  @rule:harness.agent-skill.handoff-at-behavior-level
  Rule: Agent 以行为层级交付结果

    @example:handoff-reports-behavior-level
    Example: 最终汇报会说明 review 状态和 evidence 缺口
      Given agent 已经修改了 Harness 行为 artifacts
      When agent 向人类总结工作
      Then 汇报会说明触及的 Packages、Modules、Features、Rules、lifecycle states、review states、evidence status 和 verification commands
