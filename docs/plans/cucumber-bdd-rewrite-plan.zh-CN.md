# Cucumber BDD 重写计划

> 状态：计划草案
> 目标：围绕 Cucumber 风格的 `Feature / Rule / Example` 重写 Harness，保留有价值的基础设施，同时彻底放弃旧 promise schema 兼容。

## 决策

采用 **保留工程骨架的语义重写**。

保留有用的工程骨架：

- Rust workspace、CLI 命令结构、validation/reporting 模式
- 归一化结果收集到 `tests/harness.results.yaml` 的模式
- localized text helpers
- daemon pairing、project access、open file、agent PTY plumbing
- Studio app shell 和可复用 UI components

重写语义核心：

- protocol schemas
- registries
- report model
- self-harness artifacts
- agent skills
- Cucumber runner 和 language bridge model
- Studio data model

## 兼容策略

不做兼容层。

重写后的 Harness 不支持旧 canonical shapes：

- 不读取 `.promises.yaml`
- 不保留 `PromiseRecord`
- 不使用 `promiseId` result binding
- 不把 `scenarioTest(promiseId, ...)` 作为 canonical bridge API
- 不保留 promise-oriented report schema
- 不保留旧 Promise Studio 页面
- 不做同时接受新旧文件的隐藏 migration mode

旧文件可以作为重写时的参考材料，但新 Harness 只接受新的 protocol artifacts。

## 目标模型

```text
Package
  Module
    Feature
      Rule
        Example
          Given / When / Then
```

Cucumber 负责 `Feature` 以下的行为描述层。Test Harness 负责 Cucumber 之上和周围的组织、review、Rule state、coverage 和 reporting。

## 目标 Workspace 结构

Harness 项目 crates 要和特定语言的 Cucumber bridges 分开。

核心 Harness crates：

```text
crates/
  harness-protocol/
  harness-project/
  harness-runner/
  harness-cli/
  harness-daemon/
```

语言 bridges：

```text
bridges/
  rust/
    cucumber-rs/
  typescript/
    cucumber-js/
```

长期职责：

- `harness-protocol` 负责稳定的跨语言 schemas、manifests、runner contracts 和归一化 result types。
- `harness-project` 负责 project loading、`.feature` scanning、package/module/locale manifests、Rule state、review logs、validation、coverage、reporting snapshots，以及 Studio 需要的 project data。
- `harness-runner` 负责执行编排。它选择 package/module/feature/rule/example/locale slices，生成 Cucumber tag expressions，调用 language bridges，并合并归一化结果。
- `harness-cli` 保持为 `harness-project` 和 `harness-runner` 之上的薄命令行入口。
- `harness-daemon` 保持为 Studio 和本地 API workflow 之上的薄服务层。
- `bridges/rust/cucumber-rs` 通过 custom Writer 把 cucumber-rs typed events 转成 Harness protocol results。
- `bridges/typescript/cucumber-js` 把 Cucumber.js Messages 或 formatter events 转成 Harness protocol results。

不要保留或重新创建旧 adapter crates 作为 canonical evidence producers。新的 Harness 行为必须由对应的 Cucumber `.feature` 文件和通过 language bridge 的 Cucumber execution 来证明。Vitest、Jest、Playwright、Cargo tests 这类框架可以在 step definitions 里被调用，或者作为 fixtures/assertion helpers 复用，但不能变成绕过 Cucumber 的 Harness 行为外层测试入口。

## 优先复用 Cucumber 生态

只要 Cucumber 生态已经解决了，就优先复用。

优先使用：

- Gherkin 语法和官方解析，而不是自定义 `.feature` parser
- Rust `gherkin` crate，用于 core 侧 `.feature` 扫描和校验
- Cucumber runner 的 step definition 匹配行为
- Cucumber Messages 或受支持的 formatter output 作为原始执行事件来源
- Cucumber tag expressions 来选择 packages、modules、features、rules、examples、locales 或 review slices
- Cucumber hooks 来做测试 setup 和环境准备
- Cucumber 对 undefined、pending、skipped、failed、passed 的 Example status 语义
- Cucumber HTML/JSON/reporting outputs 作为可选的人类阅读或调试 artifacts

Rust 执行层应该从 [`cucumber-rs`](https://cucumber-rs.github.io/cucumber/current/introduction.html) 开始。Cucumber Rust book 将 `cucumber` crate 描述为 Rust 里把 Gherkin steps 连接到可执行 Rust 逻辑的实现；这对我们很重要，因为很多 Harness feature 可能都会基于 Rust 扩展。

CLI 设计上的平衡点：

- `harness` 保持为治理 CLI，负责 `check`、`test`、`report`、Rule state、locale、coverage 和 evidence aggregation。
- `cucumber-rs` 保持为 Rust 执行引擎，负责运行 `.feature` examples、匹配 step definitions、处理 tag/name/input filters、concurrency、retry 和 terminal debugging output。
- Harness 应该 wrap、配置或调用 cucumber-rs，而不是重写它的 terminal app。
- Harness selection 要保持为 Harness 概念（`package`、`module`、`feature`、`rule`、`example`、`locale`），只在 runner/bridge 边界渲染成 Cucumber tag expression，目前通过 `HARNESS_CUCUMBER_TAG_EXPRESSION` 暴露。
- Language bridges 会消费这个 Harness expression，并映射到原生 Cucumber filters：cucumber-rs 的 `CUCUMBER_FILTER_TAGS`、`--tags` 或 `TagOperation`；Cucumber.js 的 `tags`、CLI `--tags` 或 `sources.tagExpression`。
- Bridge entrypoint 必须在真实 Cucumber execution 前应用映射后的 filter，例如 cucumber-rs `World::run` 或 Cucumber.js `runCucumber`；只返回配置的 helper 不能算充分证据。
- 机器证据优先使用 cucumber-rs 的 JSON/JUnit writer，或者写一个很小的 custom Writer，把 cucumber events 投影成 Harness result YAML。
- 人类 terminal output 应保留 cucumber-rs 的输出；如果同时需要人类输出和 Harness evidence，使用 Tee 风格 writer pipeline。
- 只有当 CLI 参数表达 package/module/rule/locale/Rule state 这类 Harness 概念时，才在执行层上增加 Harness-specific options。

Harness 只补 Cucumber 缺少的治理层：

- package 和 module manifests
- 稳定 feature/rule tag taxonomy
- Rule state 和 human review records
- review-log drift protection
- behavior coverage：declared、described、automated、executed、passing
- 从 Example results 汇总到 Rule、Feature、Module 和 Package

不要 fork Gherkin 语法，不要发明一套平行 step runner，也不要构建自定义 parser，除非 Cucumber 生态无法提供需要的数据。

## 目标 Artifacts

```text
tests/harness.yaml
tests/harness.packages.yaml
tests/harness.modules.yaml
tests/harness.locales.yaml
features/**/*.feature
tests/harness.behavior.yaml
tests/harness.review-log.yaml
tests/harness.results.yaml
```

预期 tag anchors：

```gherkin
@package:mobile-client
@module:chat-composer
@feature:voice-message.send
@locale:zh-CN
Feature: 发送语音条

  @rule:voice-message.progressive-upload
  Rule: 录音过程中提前传输语音分片

    @example:chunks-upload-before-release
    Example: 用户仍在录音时，分片已经开始上传
```

多语言 feature 文件可以重复同一个 `@feature`、`@rule` 和 `@example` tag，前提是它们表达的是同一个行为的不同语言版本，并且通过 `@locale:<code>` 区分。

## 需要先锁定的 Canonical Rules

实现开始前，先锁定这些小的 protocol 规则：

- Rule state values：`draft`、`proposed`、`accepted`、`changes_requested`、`rejected`、`deprecated`、`superseded`
- 不保存重复状态词：不要把 `approved` 或 `pending` 存成状态；人类批准对应 `accepted`，等待 review 的行为是 `proposed` 或 `changes_requested`
- run status 和 Rule state 分离：`accepted` 且 `failing` 是合法状态
- `.feature` 行为是实现门禁：在 `.feature` 中所有被触及的 Rule 都经过人类 accept，变成 `accepted` 之前，Agent 不能写 step definitions、可执行测试或实现逻辑
- feature tags 使用 `@feature:<stable-id>`
- rule tags 使用 `@rule:<stable-id>`
- example tags 使用 `@example:<stable-id>`
- 多语言 feature 文件使用 `@locale:<code>`
- package 和 module tags 必须指向 manifest ids
- Example result identity 是 `featureTag + ruleTag + exampleTag`；locale、file path 和 line number 是有用的 debug metadata
- `tests/harness.locales.yaml` 保存 `sourceLocale`、`requiredLocales` 和 `executionLocale`
- 自然语言标题和 step body text 可以因语言不同而变化，但 Gherkin 关键词保持英文，Feature/Rule/Example tag 集合保持等价
- Harness 自己定义的 YAML artifacts 用 `LocalizedText` 表达自然语言字段：字符串代表默认英文，`{ en, zh-CN }` 这样的语言 map 用来承载翻译
- YAML 机器字段，例如 ids、tags、package/module references、Rule state values 和 result identifiers，永不本地化

Result records 应该包含：

- feature tag
- rule tag
- example tag
- locale
- example name
- file path
- optional line
- status
- step status summary
- failure message

## 新职责

`harness check` 应该校验：

1. package/module/feature tag 一致性
2. 每个 `.feature` 文件都有一个 package、一个 module、一个稳定 feature tag
3. 每个被 review 的 Rule 都有稳定 `@rule:*` tag
4. manifest 声明的 features 在 `.feature` 文件中真实存在
5. `.feature` 文件不会引入孤儿 package/module/feature tags
6. Rule state 存在 `.feature` 文件之外
7. accepted Rule 的变更有 review-log 覆盖
8. 同一 Feature 的多语言 `.feature` 文件拥有匹配的 Rule 和 Example tags
9. 按照 `tests/harness.locales.yaml` 校验 required locales 是否齐全
10. 翻译后的 examples 保持 step 顺序和意图，同时保留英文 `Given / When / Then` 关键词，避免行为悄悄变成另一个契约
11. Harness 自己的 YAML manifests 为面向人的 title 和 description 提供 required `LocalizedText` entries

`harness test` 应该：

1. 通过 `harness-runner` 运行配置好的 Cucumber bridge
2. 收集 Example results
3. 合并结果到 `tests/harness.results.yaml`
4. 把 Example status 汇总到 Rule、Feature、Module 和 Package
5. 渲染 behavior coverage

`harness report` / `harness verify` 应该展示：

- package/module/feature hierarchy
- Rule state 和 run status
- Example execution status
- undefined 或 pending steps
- behavior coverage
- accepted behavior 缺少 executable evidence
- accepted behavior 的 reviewed content 已变化
- locale coverage 和过期翻译

## 重写阶段

### Phase 0：Cucumber Ecosystem Spike

删除 protocol code 之前，先创建一个很小的 fixture feature，确认生态路径：

- 用 Rust `gherkin` crate 解析 `.feature` 文件
- 检查 Rule、Example、tags、line numbers、doc strings、data tables 在 AST 里的形状
- 用 Rust `cucumber` 或 `cucumber-js` 跑通一个 example
- 确认 Cucumber Messages 或另一个受支持 formatter 是否能提供足够 result data
- 基于真实 Cucumber output 决定第一版 bridge output shape，而不是凭空猜

### Phase 1：Protocol Reset

用新的 canonical artifacts 替换旧 protocol schemas：

- package manifest schema
- module manifest schema
- locale manifest schema
- behavior state schema
- review-log event schema
- Cucumber result schema
- report schema

删除旧 promise schemas，不把它们和新 schema 并排保留。

### Phase 2：Registry Rewrite

用以下 loader 替换 `promise_registry` 和旧 `module_registry`：

- package registry
- module registry
- locale registry
- 基于 Rust `gherkin` crate 的 feature file scanner
- tag index
- behavior state registry
- review-log loader

registry 输出应该是围绕 `Package -> Module -> Feature -> Rule -> Example` 的单一 project model。

### Phase 3：Checker First

先构建 `harness check`，不要先做新 UI。

第一个有价值的里程碑，是一个不用跑测试也能拒绝无效组织结构和 Rule state 的命令。

### Phase 4：Harness Runner 和 Cucumber Bridges

添加 Harness runner 和第一批 Cucumber bridges。

Runner 应该尽可能编排 Cucumber-native execution output，最好是 Cucumber Messages、cucumber-rs typed events 或受支持的 formatter stream。Harness results 应该是 Cucumber 数据的 normalized projection，而不是替代 runner。

Rust 项目应该通过 `bridges/rust/cucumber-rs` 使用 Rust `cucumber` crate。JavaScript/TypeScript 项目应该通过 `bridges/typescript/cucumber-js` 使用 `cucumber-js`。Harness project model 应该保持 runner-agnostic：它用 `gherkin` 解析 `.feature` 文件做校验，然后消费任意 bridge 输出的 normalized Harness protocol results。

对 Rust 来说，不要先构建一套竞争性的 runner 或 terminal CLI。第一步应让 cucumber-rs 通过它自己的 CLI/options 和 output pipeline 运行 Examples。Harness 只增加：

- 一个很薄的 `harness test` orchestration layer，用 Harness slices 选择范围，再委托给 cucumber-rs 执行
- 一个基于 `featureTag + ruleTag + exampleTag` 的 normalized result collector
- 如果现有 JSON/JUnit output 不能保留足够 tag/rule/example metadata，再写 optional custom Writer
- 只有当 Harness-specific options 需要和 cucumber-rs options 放在一起时，后续再使用 cucumber-rs CLI composition 做集成

对 TypeScript，不要把 Vitest/Jest bridges 做成 canonical Harness evidence。使用 Cucumber.js 作为执行入口，通过 JavaScript API 或 formatter 消费 Cucumber Messages，让 Vitest/Jest/Playwright 只作为 step definition 内部可选的工具。不要为了新的 Harness bridge 行为额外写独立的 Vitest/Jest 测试作为主要证明；应该更新对应的 Cucumber Example 和 step definitions。

每个 bridge 应该为 Examples 输出 normalized Harness results，包含：

- feature tag
- rule tag
- example tag
- locale
- example name
- step status summary
- file path
- run status
- failure message

result file 不再使用 `promiseId`。

### Phase 5：Report And Coverage

实现行为报告：

```text
Package -> Module -> Feature -> Rule -> Example
```

Coverage 应该包含：

- declared features
- described rules
- automated examples
- executed examples
- passing behavior
- undefined steps
- required locale coverage
- 过期或结构不匹配的翻译
- required locales 缺失的 YAML 多语言标签

### Phase 6：Self-Harness Rewrite

把这个仓库自己的 Harness artifacts 改写成新模型：

- 从一个最小 self-feature 开始，先证明新的 check/test/report loop
- 将旧 self-promises 转成 `.feature` 文件和 Rule state records
- 为 required review languages 增加多语言 `.feature` 文件
- 用新的 module manifests 替换旧 modules
- 将 manifest titles 和 descriptions 转成 `LocalizedText`
- 用 behavior/review-log records 替换旧 review metadata
- 更新根 `tests/harness.yaml`，改为通过 `harness-runner` 和对应 bridge 运行 Cucumber
- 在新 check/test/report loop 通过后删除旧 promise files

### Phase 7：Agent Skill Rewrite

用新的 Harness-aware authoring skill 替换旧 promise-authoring skills。

这个 skill 必须教 Agent：

- 创建或更新 package/module manifests
- 将 manifest titles 和 descriptions 写成 `LocalizedText`
- 编写带稳定 tags 的 `.feature` 文件
- 编写带相同稳定 tags 和 `@locale` 的多语言 `.feature` 文件
- 使用稳定 `@example` tags，不把翻译后的 Example 标题当成身份
- 将 Rules 草拟为 `draft` 或 `proposed`
- 只有在人类明确 acceptance 后才把 Rule 标成 `accepted`
- 把 `.feature` acceptance 作为写 step definitions、可执行测试和实现逻辑之前的硬门禁
- 为 accepted behavior changes 追加 review-log events
- 编写真实 step definitions，避免占位断言
- 报告 Rule state、run status、undefined steps 和 behavior coverage

### Phase 8：Studio Rewrite

保留 Studio shell，但用以下内容替换 promise-oriented 数据和页面：

- package overview
- module detail
- feature detail
- Feature、Rule、Example 和 step 文本的 locale switcher
- Rule review panel
- Example evidence panel
- behavior coverage view
- review-log/drift view

删除旧 Promise 页面，不做适配。

## Done Looks Like

重写完成时应该满足：

1. 仓库里没有 canonical `.promises.yaml` files
2. Rust protocol 不再暴露 `PromiseRecord`
3. result files 不再使用 `promiseId`
4. `harness check` 能校验 package/module/feature/rule 一致性
5. `harness test` 能运行 Cucumber 并写出新的 result YAML
6. `harness report --summary` 能按 Package、Module、Feature、Rule 展示行为状态
7. accepted Rule drift 会通过 Rule state 和 review-log checks 被检测出来
8. 多语言 `.feature` 文件可以校验 required locale coverage 和结构等价
9. 新 Agent skill 能端到端驱动一次 feature change

## 风险

主要风险是引入新模型的同时继续保留旧概念。那会让项目里出现两套互相竞争的 mental model。

缓解方式很简单：每落地一个新 slice，就尽快删除对应旧 protocol shape，并让 self-harness checks 的失败暴露下一个缺口。
