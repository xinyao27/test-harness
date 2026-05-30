# Cucumber BDD 重写计划

> 状态：计划草案
> 目标：围绕 Cucumber 风格的 `Feature / Rule / Example` 重写 Harness，保留有价值的基础设施，同时彻底放弃旧 promise schema 兼容。

## 决策

采用 **保留工程骨架的语义重写**。

保留有用的工程骨架：

- Rust workspace、CLI 命令结构、validation/reporting 模式
- adapter runtime 的 event shards 和 `.harness/results.yaml` 合并模式
- localized text helpers
- daemon pairing、project access、open file、agent PTY plumbing
- Studio app shell 和可复用 UI components

重写语义核心：

- protocol schemas
- registries
- report model
- self-harness artifacts
- agent skills
- adapter binding model
- Studio data model

## 兼容策略

不做兼容层。

重写后的 Harness 不支持旧 canonical shapes：

- 不读取 `.promises.yaml`
- 不保留 `PromiseRecord`
- 不使用 `promiseId` result binding
- 不把 `scenarioTest(promiseId, ...)` 作为 canonical adapter API
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

Cucumber 负责 `Feature` 以下的行为描述层。Test Harness 负责 Cucumber 之上和周围的组织、review、lifecycle、coverage 和 reporting。

## 优先复用 Cucumber 生态

只要 Cucumber 生态已经解决了，就优先复用。

优先使用：

- Gherkin 语法和官方解析，而不是自定义 `.feature` parser
- Rust `gherkin` crate，用于 core 侧 `.feature` 扫描和校验
- Cucumber runner 的 step definition 匹配行为
- Cucumber Messages 或受支持的 formatter output 作为原始执行事件来源
- Cucumber tag expressions 来选择 packages、modules、features、rules 或 review slices
- Cucumber hooks 来做测试 setup 和环境准备
- Cucumber 对 undefined、pending、skipped、failed、passed 的 Example status 语义
- Cucumber HTML/JSON/reporting outputs 作为可选的人类阅读或调试 artifacts

Harness 只补 Cucumber 缺少的治理层：

- package 和 module manifests
- 稳定 feature/rule tag taxonomy
- lifecycle 和 human review records
- review-log drift protection
- behavior coverage：declared、described、automated、executed、passing
- 从 Example results 汇总到 Rule、Feature、Module 和 Package

不要 fork Gherkin 语法，不要发明一套平行 step runner，也不要构建自定义 parser，除非 Cucumber 生态无法提供需要的数据。

## 目标 Artifacts

```text
tests/harness.yaml
tests/harness.packages.yaml
tests/harness.modules.yaml
features/**/*.feature
tests/harness.behavior.yaml
tests/harness.review-log.yaml
.harness/results.yaml
```

预期 tag anchors：

```gherkin
@package:mobile-client
@module:chat-composer
@feature:voice-message.send
Feature: 发送语音条

  @rule:voice-message.progressive-upload
  Rule: 录音过程中提前传输语音分片
```

## 需要先锁定的 Canonical Rules

实现开始前，先锁定这些小的 protocol 规则：

- lifecycle values：`draft`、`proposed`、`accepted`、`deprecated`、`superseded`
- review states：`pending`、`approved`、`changes_requested`、`rejected`
- run status 和 lifecycle 分离：`accepted` 且 `failing` 是合法状态
- feature tags 使用 `@feature:<stable-id>`
- rule tags 使用 `@rule:<stable-id>`
- package 和 module tags 必须指向 manifest ids
- Example result identity 是 `featureTag + ruleTag + exampleName + file`，line number 作为有用的 debug metadata

Result records 应该包含：

- feature tag
- rule tag
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
6. lifecycle state 存在 `.feature` 文件之外
7. accepted Rule 的变更有 review-log 覆盖

`harness test` 应该：

1. 运行配置好的 Cucumber adapter
2. 收集 Example results
3. 合并结果到 `.harness/results.yaml`
4. 把 Example status 汇总到 Rule、Feature、Module 和 Package
5. 渲染 behavior coverage

`harness report` / `harness verify` 应该展示：

- package/module/feature hierarchy
- Rule lifecycle 和 run status
- Example execution status
- undefined 或 pending steps
- behavior coverage
- accepted behavior 缺少 executable evidence
- accepted behavior 的 reviewed content 已变化

## 重写阶段

### Phase 0：Cucumber Ecosystem Spike

删除 protocol code 之前，先创建一个很小的 fixture feature，确认生态路径：

- 用 Rust `gherkin` crate 解析 `.feature` 文件
- 检查 Rule、Example、tags、line numbers、doc strings、data tables 在 AST 里的形状
- 用 Rust `cucumber` 或 `cucumber-js` 跑通一个 example
- 确认 Cucumber Messages 或另一个受支持 formatter 是否能提供足够 result data
- 基于真实 Cucumber output 决定第一版 adapter output shape，而不是凭空猜

### Phase 1：Protocol Reset

用新的 canonical artifacts 替换旧 protocol schemas：

- package manifest schema
- module manifest schema
- behavior lifecycle schema
- review-log event schema
- Cucumber result schema
- report schema

删除旧 promise schemas，不把它们和新 schema 并排保留。

### Phase 2：Registry Rewrite

用以下 loader 替换 `promise_registry` 和旧 `module_registry`：

- package registry
- module registry
- 基于 Rust `gherkin` crate 的 feature file scanner
- tag index
- behavior lifecycle registry
- review-log loader

registry 输出应该是围绕 `Package -> Module -> Feature -> Rule -> Example` 的单一 project model。

### Phase 3：Checker First

先构建 `harness check`，不要先做新 UI。

第一个有价值的里程碑，是一个不用跑测试也能拒绝无效组织结构和 lifecycle state 的命令。

### Phase 4：Cucumber Adapter

把 Cucumber adapter 作为第一个 canonical adapter。

adapter 应该尽量消费 Cucumber-native execution output，优先使用 Cucumber Messages 或受支持的 formatter stream。Harness event shards 应该是 Cucumber 数据的 normalized projection，而不是替代 runner。

Rust 项目可以使用 Rust `cucumber` crate 作为执行 adapter。JavaScript/TypeScript 项目可以使用 `cucumber-js`。Harness core 应该保持 runner-agnostic：它用 `gherkin` 解析 `.feature` 文件做校验，然后消费任意 adapter 输出的 normalized Cucumber execution data。

adapter 应该为 Examples 输出 normalized event shards，包含：

- feature tag
- rule tag
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

### Phase 6：Self-Harness Rewrite

把这个仓库自己的 Harness artifacts 改写成新模型：

- 从一个最小 self-feature 开始，先证明新的 check/test/report loop
- 将旧 self-promises 转成 `.feature` 文件和 Rule lifecycle records
- 用新的 module manifests 替换旧 modules
- 用 behavior/review-log records 替换旧 review metadata
- 更新根 `tests/harness.yaml`，改为运行 Cucumber adapter
- 在新 check/test/report loop 通过后删除旧 promise files

### Phase 7：Agent Skill Rewrite

用新的 Harness-aware authoring skill 替换旧 promise-authoring skills。

这个 skill 必须教 Agent：

- 创建或更新 package/module manifests
- 编写带稳定 tags 的 `.feature` 文件
- 将 Rules 草拟为 `draft` 或 `proposed`
- 只有在人类明确 approval 后才把 Rule 标成 `accepted`
- 为 accepted behavior changes 追加 review-log events
- 编写真实 step definitions，避免占位断言
- 报告 lifecycle、run status、undefined steps 和 behavior coverage

### Phase 8：Studio Rewrite

保留 Studio shell，但用以下内容替换 promise-oriented 数据和页面：

- package overview
- module detail
- feature detail
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
7. accepted Rule drift 会通过 lifecycle/review-log checks 被检测出来
8. 新 Agent skill 能端到端驱动一次 feature change

## 风险

主要风险是引入新模型的同时继续保留旧概念。那会让项目里出现两套互相竞争的 mental model。

缓解方式很简单：每落地一个新 slice，就尽快删除对应旧 protocol shape，并让 self-harness checks 的失败暴露下一个缺口。
