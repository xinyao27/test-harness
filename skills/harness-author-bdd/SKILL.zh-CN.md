---
name: harness-author-bdd
description: 用 Cucumber BDD 重写模型编写或修改 Test Harness 行为时使用。适用于新增 Harness 功能、把行为纳入新的 Package/Module/Feature/Rule/Example 层级、编写或更新多语言 .feature 文件、locale 记录、生命周期记录、review-log、Cucumber 结果绑定，或做 Harness 自举规范。不要使用旧的 promise-driven .promises.yaml 工作流。
---

# Harness BDD 编写

在 Cucumber 重写之后，只要 agent 要修改 Harness 项目的行为，就使用这个 skill。

Agent 的职责是先让人 review 并 approve **行为形状和生命周期**，再让代码满足这些被 review 的行为。不要从实现代码开始。

硬门禁：Agent 要实现的所有 `.feature` 行为都必须先经过人类 approve。用 Harness 的语言说，这些 `.feature` 文件里每一个被触及的 Rule 都必须是 `accepted` 且 review state 为 `approved`，或者在当前 review surface 里获得明确 approval，之后 Agent 才能写 step definitions、可执行测试或实现逻辑。这个要求的目的，是确保 feature 行为在动工前一定有人 review。

## 心智模型

```text
Package manifest
  Module manifest
    .feature file
      Feature tag
        Rule tag + lifecycle record
          Example + executable result evidence
```

Cucumber 负责 `Feature / Rule / Example / Given / When / Then`。
Harness 负责用户项目自己的组织方式、稳定 tag、生命周期、review 历史、结果归一化和覆盖率。

feature 文件要尽量跟着用户项目的代码和目录边界来组织。这样覆盖率会自然分散到真实的项目结构里；而 tags 和 YAML 负责保证覆盖统计是可信的。

## Canonical 文件

目标形态使用这些文件：

- `tests/harness.yaml` — runner 配置。
- `tests/harness.packages.yaml` — package 列表，以及 package 到 module 的分组。
- `tests/harness.modules.yaml` — module 所有权、目的和覆盖路径。
- `tests/harness.locales.yaml` — source locale、required review locales 和 execution locale。
- `features/**/*.feature` — Cucumber 行为描述。
- `tests/harness.behavior.yaml` — Rule tag 的生命周期和 review 状态。
- `tests/harness.review-log.yaml` — append-only 的人类 review 与 drift 历史。
- `tests/harness.results.yaml` — 归一化后的 Cucumber Example 结果。

不要创建新的 `.promises.yaml` 文件。不要用 `promiseId` 绑定新测试。

## Rust Cucumber 执行

对于 Rust-backed Harness 行为，优先使用官方 Rust `cucumber` crate，也就是 [cucumber-rs](https://cucumber-rs.github.io/cucumber/current/introduction.html)，作为执行引擎。

不要把 cucumber-rs 重新实现成 Harness runner。最佳分工是：

- cucumber-rs 运行 `.feature` Examples、匹配 step definitions、应用 tag/name/input filters、处理 concurrency/retry，并提供 terminal output。
- `harness` 校验 manifests、lifecycle、locales 和 tag identity，然后把 Cucumber execution 聚合成 Harness evidence。
- `harness test` 一开始应该只是 cucumber-rs execution 上面很薄的一层 orchestration。
- Harness execution selection 应该写成 package/module/feature/rule/example/locale 字段，只在 runner 或 bridge 边界渲染成 Cucumber tag expression。bridge command 需要选中的 Cucumber tags 时，使用 `HARNESS_CUCUMBER_TAG_EXPRESSION`。
- Rust bridges 应该把这个值映射到 cucumber-rs 原生的 `CUCUMBER_FILTER_TAGS`、`--tags` 或 `TagOperation`；TypeScript bridges 应该把它映射到 Cucumber.js 的 `tags`、CLI `--tags` 或 `sources.tagExpression`。
- Bridge entrypoint 必须在调用真实 Cucumber execution 前应用这个值，例如在 cucumber-rs `World::run` 或 Cucumber.js `runCucumber` 之前。不要停留在只有 helper mapping 的状态。
- 使用 cucumber-rs JSON/JUnit writers、Tee 风格 multiple outputs，或者一个很小的 custom Writer 来收集机器可读 evidence。
- 只有 package、module、feature、rule、example、locale、lifecycle 或 review slice selection 这类 Harness 概念，才增加 Harness-specific CLI options。

## Language Bridge 边界

当 Harness 项目需要把可执行 `.feature` 文件接到某种编程语言时，把这个集成放在 language bridge 边界里。Bridge 的职责是把该语言的 Cucumber execution output 转成 Harness protocol results。

对这个仓库的重写来说，长期形态是：

```text
crates/
  harness-protocol/
  harness-project/
  harness-runner/
  harness-cli/
  harness-daemon/

bridges/
  rust/
    cucumber-rs/
  typescript/
    cucumber-js/
```

在其他项目里也遵循同一个原则：Harness core 负责 protocol、project loading、validation、lifecycle、review、runner orchestration、reports 和 Studio data；bridges 负责特定语言的 Cucumber result conversion。

不要创建面向具体测试框架的 Harness adapters 作为 canonical evidence producers。新的 Harness 行为必须由对应的 Cucumber `.feature` 文件和通过 language bridge 的 Cucumber execution 来证明。Vitest、Jest、Playwright、Cargo tests 或其他测试工具可以在 step definitions 里作为 assertion libraries、fixtures、helpers 或临时 subprocesses 复用，但不能变成绕过 Cucumber 的 Harness 行为外层测试入口。

## 编写流程

1. **先定位层级。** 从用户项目的 manifest、现有 `features/**/*.feature` 和本次改动涉及的代码路径中，找到所属 package 和 module。默认把新的 feature 文件放进和用户项目目录一致的树里。边界不清楚时，先提出 package/module 变更，再写行为。

2. **先写或更新 `.feature`。** 每个 feature 文件必须在 Feature 层声明且只声明一个 package tag、module tag、feature tag 和 locale tag：

```gherkin
@package:harness-project
@module:feature-registry
@feature:harness.feature-registry.scan-cucumber-features
@locale:zh-CN
Feature: Cucumber feature registry
```

3. **用 Rule 做 review 单元。** 每个被 review 的行为承诺都是一个带稳定 `@rule:<id>` tag 的 `Rule`。为了人类可读性，使用 `Example`，不要用 `Scenario`。每个 Example 必须有一个稳定 `@example:<id>` tag，并包含 Given、When、Then。

```gherkin
  @rule:harness.feature-registry.hierarchy-tags
  Rule: Feature files declare Harness hierarchy tags

    @example:valid-feature-maps-to-hierarchy
    Example: A valid feature file maps to Harness hierarchy records
      Given a .feature file exists under the features directory
      When the Harness scans feature files
      Then it records the package, module, feature, rule, and example names
```

4. **生命周期放在 `.feature` 外面。** 每个 Rule tag 都要在 `tests/harness.behavior.yaml` 中新增或更新记录。新 Rule 在整理阶段是 `draft`，准备给人 review 时是 `proposed`。只有当前对话或 review surface 中有明确的人类批准，才能改成 `accepted`。一个 `.feature` 只有在其中所有被触及的 Rule 都是 `accepted` 且 `approved` 后，才可以进入实现。

5. **追加 review 历史。** 已接受行为的修改、弱化、拆分、合并、废弃或替代，都需要在 `tests/harness.review-log.yaml` 中追加事件。行为变窄或变弱时，要保留旧含义和新含义。

6. **只在 approval 后写可执行证据。** Executable evidence 绑定 Cucumber Example identity，而不是 promise id。在 `.feature` 中被触及的 Rule 获得人类 approve 之前，不要为它写 step definitions、独立 unit tests、integration tests、Vitest、Jest、Cargo tests 或实现逻辑。如果这些工具在 approval 后有用，把它们放到 step definitions 或对应 Cucumber Example 背后的 supporting helpers 里。Canonical identity 是：

```text
featureTag + ruleTag + exampleTag
```

Locale、文件路径和行号是有用的调试信息，但不是稳定身份。

7. **feature approval 之后再实现。** 代码变更应该满足已经 accepted 且 approved 的 Rule。如果 `.feature` 或 Rule 仍是 `draft`、`proposed`、`pending`、`changes_requested` 或 `rejected`，就停在写测试和实现逻辑之前，把它交回给人类 review。避免 `toBeDefined()` 或 “mock 被调用了” 这种占位断言，除非 Rule 明确观察的就是 bridge 边界。

8. **通过 Harness 命令验证。**

```bash
harness check
harness test
harness report --summary
```

如果 `harness` 不在 PATH，使用仓库自己的 wrapper，例如 `cargo run -p harness-cli -- check`。

## 语言规则

稳定 tag 永不本地化。所有 locale 的 Gherkin 结构关键词都保持英文：`Feature`、`Rule`、`Example`、`Given`、`When`、`Then`、`And` 和 `But`。人类可读的名称和 step body text 可以翻译。

Harness 自己定义的 YAML 文件不按语言复制多份。面向人的字符串使用 `LocalizedText`：

```yaml
apiVersion: 1
modules:
  - id: feature-registry
    title:
      en: Feature registry
      zh-CN: Feature 注册表
    description:
      en: Loads Cucumber feature files into the Harness project model.
      zh-CN: 将 Cucumber feature 文件加载为 Harness 项目模型。
    package: harness-project
    features:
      - tag: "@feature:harness.feature-registry.scan-cucumber-features"
        title:
          en: Scan Cucumber feature files
          zh-CN: 扫描 Cucumber feature 文件
```

titles、descriptions、notes 和其他面向人的文本都使用 `LocalizedText`。ids、tags、package/module references、lifecycle values、review states、result identifiers 和 file paths 保持语言中立。

当行为需要支持多语言 review 时，每种语言使用一个 `.feature` 文件：

```text
features/harness/crates/harness-project/feature-registry/cucumber-feature-registry.feature
features/harness/crates/harness-project/feature-registry/cucumber-feature-registry.zh-CN.feature
```

同一行为的多语言文件复用同一组机器 tags：

```gherkin
@package:harness-project
@module:feature-registry
@feature:harness.feature-registry.scan-cucumber-features
@locale:en
Feature: Cucumber feature registry

  @rule:harness.feature-registry.hierarchy-tags
  Rule: Feature files declare Harness hierarchy tags

    @example:valid-feature-maps-to-hierarchy
    Example: A valid feature file maps to Harness hierarchy records
      Given a .feature file exists under the features directory
      When the Harness scans feature files
      Then it records the package, module, feature, rule, and example names
```

```gherkin
@package:harness-project
@module:feature-registry
@feature:harness.feature-registry.scan-cucumber-features
@locale:zh-CN
Feature: Cucumber feature registry

  @rule:harness.feature-registry.hierarchy-tags
  Rule: Feature 文件声明 Harness 层级 tags

    @example:valid-feature-maps-to-hierarchy
    Example: 有效 feature 文件会映射成 Harness 层级记录
      Given features 目录下存在一个 .feature 文件
      When Harness 扫描 feature 文件
      Then 它会记录 package、module、feature、rule 和 example 名称
```

`tests/harness.locales.yaml` 应该定义：

```yaml
apiVersion: 1
sourceLocale: zh-CN
requiredLocales:
  - zh-CN
  - en
executionLocale: zh-CN
```

不要为了切换 Gherkin 关键词而添加 `# language: zh-CN`。用 `@locale:<code>` 标识 review language，Gherkin 关键词保持英文，只翻译 names 和 step body text。多语言文件复用同一个 `@feature`、`@rule` 和 `@example` tag 是预期行为。不要翻译 tags、ids、lifecycle values、review states 或 bridge result identifiers。

更新一种语言时，要在同一个变更里更新其他 required locales，或者留下明确的 stale-translation/lifecycle 记录。当翻译之间含义冲突时，`sourceLocale` 是人类批准语义的来源。

## 生命周期规则

允许的 lifecycle：

- `draft` — 还没准备好 review。
- `proposed` — 已准备好给人 review。
- `accepted` — 人类已批准；运行时可以通过也可以失败。
- `deprecated` — 不再是 canonical。
- `superseded` — 被另一个 Rule 替代。

允许的 review state：

- `pending`
- `approved`
- `changes_requested`
- `rejected`

运行状态从结果中计算，永远不要存成 lifecycle。

## 交付前检查

交还工作前：

- `harness check` 应该是零错误。
- 每个改过的 `.feature` 文件都有 package/module/feature/locale tag。
- 当配置了多个 review language 时，每个改过的 Harness YAML title/description/note 都使用 `LocalizedText`。
- 每个改过的 Rule 都有 `@rule` tag 和 lifecycle 记录。
- 每个已经写了 step definitions、executable evidence 或 implementation code 的 Rule 都是 `accepted` 且 `approved`。
- 每个改过的 Example 都有 `@example` tag。
- Required locale 文件齐全，或者明确标记为 stale/missing。
- 每个 accepted Rule 的变更都有 review-log 事件。
- 新测试绑定 `featureTag + ruleTag + exampleTag`，而不是 `promiseId`。

## Handoff

按这个顺序汇报：

1. 触及的 package/module。
2. 新增或修改的 Feature、Rule、Example 和 locales。
3. 每个 Rule 的 lifecycle 和 review state。
4. 已提供或仍需要可执行证据的 Example。
5. `harness check`、`harness test` 和 `harness report --summary` 结果。
6. 仍需人类 review 的 draft/proposed Rule。
