@package:harness-project
@module:project-model
@feature:harness.project-model.hierarchy
@locale:zh-CN
Feature: Harness project model

  Background: Project boundaries 让行为可以被 review
    Given 人类需要在不阅读每个实现文件的情况下 review 系统行为
    And Harness project model 必须贴合用户真实的代码边界和 ownership 边界
    And 每个可 review 的行为都需要在 feature text、Rule state、executable evidence 和 review history 之间保持稳定身份

  @rule:harness.project-model.package-is-code-boundary
  Rule: Package 是最外层的代码和交付边界

    @example:package-groups-owned-modules
    Example: Package 聚合属于同一个项目边界的 modules
      Given repository 包含 crates、applications、libraries、services 或其他项目拥有的代码边界
      When reviewer 打开 Harness behavior model
      Then 每个 Package 都代表其中一个代码和交付边界
      And Package 会列出属于这个边界的 Modules

  @rule:harness.project-model.module-is-reviewable-capability-boundary
  Rule: Module 是 Package 内部可 review 的能力边界

    @example:module-describes-human-review-scope
    Example: Module 给人类一个聚焦的行为 review 范围
      Given 一个 Package 包含多个 capabilities、subsystems 或 ownership areas
      When Harness 为 review 组织这个 Package
      Then 每个 Module 都代表一个内聚的能力边界
      And Module 会声明它覆盖的 source paths 和 feature files

  @rule:harness.project-model.module-contains-features
  Rule: 一个 Module 包含一个或多个 Features

    @example:module-expands-into-features
    Example: Reviewer 可以从 module 进入具体的行为 features
      Given 一个 Module 拥有一个需要多个行为承诺的能力
      When Harness 构建 project model
      Then Module 会链接到描述这些承诺的 Cucumber Features
      And 每个 Feature 都可以通过它的 Rules 和 Examples 被 review

  @rule:harness.project-model.feature-is-cucumber-gherkin-behavior
  Rule: Feature 使用 Cucumber 和 Gherkin 描述

    @example:feature-text-connects-to-executable-evidence
    Example: Feature 先是可 review 的 Gherkin，之后再连接到执行证据
      Given 一个 Module 需要一份人类可读的行为描述
      When agent 为 review 起草这个行为
      Then 它会用 Gherkin keywords 写出 Cucumber .feature 文件
      And executable evidence 之后会通过 language bridge 绑定到稳定的 feature、rule 和 example tags
