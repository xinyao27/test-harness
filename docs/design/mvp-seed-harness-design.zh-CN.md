# MVP Seed Harness 设计

> 状态：MVP 设计；已更新为当前 Rust core/CLI 与 adapter-event runtime 架构。
> 目标：构建最小自举版本的 Test Harness，让 Harness 可以开始验证它自己的 promises。

## 一、目的

完整 Test Harness 目前仍然只是设计。第一版实现不应该试图一次性构建完整的 Promise Review Console。

MVP 应该是一个 **seed Harness**：一个最小的、基于文件的、protocol-first 系统，用来描述、运行和报告这套 Harness 项目自身的 promises。

稳定层是语言无关的 YAML。当前 Rust crates 提供 core/CLI 参考实现，TypeScript Vitest package 是薄 adapter，不是 Harness 本身的定义。

Seed Harness 的目的，是建立第一个自举循环：

```text
为 Harness 自身写 promises
  -> 给 adapter tests 附加 scenario bindings
  -> 运行配置好的 adapter
  -> 按 promise id 收集结果
  -> 检查可读性和 evidence 规则
  -> 生成可读的 promise report
  -> 用这个 report 指导下一轮 Harness 迭代
```

## 二、MVP 范围

只构建自举所需要的部分。

范围内：

1. **Promise files**
   用版本化文件存储这套 Harness 项目自己的 promises。这些文件是已 review promise meaning 的 canonical source。

2. **Adapter binding helper**
   提供 bindings，把可执行 adapter tests 连接到 canonical promise ids。Seed implementation 当前提供 Vitest helper。

3. **Basic quality checker**
   检查 canonical promise metadata 和 scenario bindings 是否存在、可读，并且足够完整。

4. **Basic evidence mapper**
   跟踪哪些 adapter results 声称证明了哪个 promise。完整 assertion fingerprints 和 Evidence Drift v1 仍是后续工作。

5. **Result collector**
   运行或读取 adapter results，并按 promise id 归一化成 `.harness/results.yaml`。

6. **Seed report**
   按 feature 和 promise 输出人类可读报告。

Seed 阶段不做：

- 完整可视化 Promise Review Console
- 复杂 browser UX
- 当前 Vitest adapter 之外的高级 adapters
- 完整 drift AI 分类
- 高级 risk maps
- 组织级权限
- 外部项目 onboarding

当前 seed 阶段不包含通过 assertion fingerprints 记录 deterministic evidence drift，也不包含完整 AI-based drift classification。

## 三、数据模型

Seed 可以先从文件开始。

Canonical source 决策：

```text
apiVersion: 1 grouped .promises.yaml files
  -> canonical reviewed promise meaning

adapter-side bindings such as scenarioTest(promiseId, ...)
  -> 测试侧绑定到 canonical promise
```

如果 `scenario(...)` 试图重新定义 title、priority、boundary、Given / When / Then 或 observes，seed 应该把它视为 invalid metadata 或 potential drift。已 review 的 promise file 胜出。

Seed review 机制：

```text
Human review 基于 PR。

修改 .promises.yaml files 需要正常 code review。
review metadata 记录批准 promise 的 PR 或 commit。
```

自举循环依赖规则：

```text
第一批 self-promises 由人类手动 review。
在 M2 稳定之前，quality checker 可以 warning 而不是 hard-fail。
M2 被接受之后，required metadata failures 变成 blocking。
```

当前结构：

```text
crates/
  harness-protocol/
  harness-core/
  harness-cli/
  harness-adapter-runtime/
  harness-adapter-rust/

packages/
  adapter-vitest/

promises/
  protocol/
    protocol.promises.yaml
  adapters/
    vitest/
      vitest.promises.yaml
  promise-registry/
    promise-registry.promises.yaml
  validation/
    validation.promises.yaml

protocol/
  v1/
    promise.schema.yaml
    promises-file.schema.yaml
    adapter-event.schema.yaml
    results.schema.yaml
    report.schema.yaml
    cli.yaml
```

Promise file 形态：

canonical file 使用 YAML，并声明 `apiVersion: 1`。Protocol shape 记录在 `protocol/v1/` 下。Rust protocol crate 实现与之匹配的运行时校验和类型。自然语言字段使用 `LocalizedText`：普通字符串是合法的，并被视为默认英文；也可以展开成 `en` / `zh-CN` 这样的语言 map。

```yaml
apiVersion: 1
promises:
  - id: harness.promise_registry.load_canonical_yaml_promises
    feature: Seed Harness / Promise Registry
    title:
      en: Accepted promises are loaded from canonical YAML files
      zh-CN: 已接受的承诺会从 canonical YAML 文件中加载
    purpose:
      en: Protect the seed Harness's reviewed behavior promises.
      zh-CN: 保护 seed Harness 能读取自己已批准的行为承诺。
    priority: P0
    boundary: unit
    lifecycle: accepted
    given:
      - en: A promise file exists under the promises root
        zh-CN: promises/ 目录下存在一个 promise 文件
    when:
      - en: The seed Harness loads promise records
        zh-CN: seed Harness 加载 promise records
    then:
      - en: The promise is decoded into a PromiseRecord
        zh-CN: 该 promise 会被解码成 PromiseRecord
    observes:
      - promises/**/*.promises.yaml
    failureMeaning:
      en: The Harness cannot trust its own reviewed behavior promises.
      zh-CN: Harness 无法信任自己已经 review 过的行为承诺。
    review:
      approvedBy: xinyao
      approvedAt: "2026-05-24"
```

Run status 不持久化在 promise file 里。它由 collector 计算：

```ts
type PromiseRunStatus =
  | "unknown"
  | "passing"
  | "failing"
  | "skipped"
  | "missing_evidence"
  | "evidence_drifted";
```

Adapter-side binding 形态：

```ts
scenarioTest(
  "harness.promise_registry.load_canonical_yaml_promises",
  "loads canonical YAML promises",
  () => {
    // executable evidence
  },
);
```

后续 assertion fingerprint 形态：

```ts
const AssertionFingerprintSchema = Schema.Struct({
  scenarioId: Schema.String,
  testFile: Schema.String,
  testName: Schema.String,
  assertions: Schema.Array(
    Schema.Struct({
      target: Schema.optionalKey(Schema.String),
      matcher: Schema.String,
      literal: Schema.optionalKey(Schema.String),
      evidenceTag: Schema.optionalKey(Schema.String),
    }),
  ),
});

type AssertionFingerprint = Schema.Schema.Type<typeof AssertionFingerprintSchema>;
```

## 四、MVP 自我 promises

MVP 应该从一小组验证自身的 promises 开始。

### Promise Registry

```text
Promise:
已接受 promises 会带着稳定 id、生命周期状态和 review metadata 被持久化。

Evidence:
- promise file 可以被加载
- required fields 被保留
- lifecycle 和 review fields 可读
```

### Scenario Helper

```text
Promise:
Adapter tests 可以通过稳定 promise id 绑定到 canonical promise。

Evidence:
- test file load 期间 scenario binding 会被注册
- duplicate ids 会被检测
- 缺少 required fields 会被报告
- 测试侧重新定义 canonical promise fields 会被拒绝
```

### Quality Checker

```text
Promise:
Seed Harness 会拒绝不可读的 canonical metadata 或不完整的 scenario bindings。

Evidence:
- missing id 失败
- missing purpose 失败
- missing Given / When / Then 或 observes 失败
- 类似 "works" 的模糊标题失败
```

### Result Collector

```text
Promise:
Adapter results 会按 promise id 归一化。

Evidence:
- passing tests 产生 passing promise results
- failing tests 产生 failing promise results
- unmapped tests 会被报告
```

### Evidence Mapper

```text
Promise:
一个 promise 可以映射到一个或多个 tests、evidence items 和 assertion fingerprints。

Evidence:
- one promise 可以有 multiple test records
- one test 可以引用 multiple evidence items
- missing evidence 会被报告
- assertion fingerprints 会被捕获，并在多次运行之间 diff
```

### Review Mechanism

```text
Promise:
Seed promise approval 可以通过 PR-based review metadata 追溯。

Evidence:
- accepted promises 包含 approvedBy 或 approvedIn
- unreviewed accepted promises 会被报告
- promise id rename 必须 deprecate old id 或显式 supersede
```

## 五、Seed Harness 命令

第一版 CLI 可以很小。

建议命令：

```text
harness check
  验证 promise files、scenario bindings、review metadata 和 quality rules。

harness test
  运行配置好的 adapter/runtime command，并按 promise id 收集结果。

harness report
  渲染当前 promise report；如果存在 .harness/results.yaml，则读取它。
```

第一版也保留一个 verification alias：

```text
harness verify
  渲染和 harness report 相同的 report path。
```

## 六、Seed Report

Seed report 应该在不打开测试文件的情况下可读。

示例：

```text
Seed Harness Report

Feature: Seed Harness / Promise Registry

P0  Accepted promises are persisted with lifecycle state
    Status: passing
    Lifecycle: accepted
    Evidence:
    - promise file loaded
    - required fields preserved
    - review metadata readable

Feature: Seed Harness / Quality Checker

P0  Unreadable canonical metadata or scenario bindings are rejected
    Status: failing
    Lifecycle: accepted
    Failure meaning:
    The Harness may accept tests that humans cannot manage.
```

## 七、自举里程碑

1. **M0: File convention**
   添加 promise files，把它们设为 canonical，选择 PR-based review metadata，并决定 reports 写到哪里。

2. **M1: Scenario helper**
   实现 `scenarioTest(promiseId, ...)` 这类 adapter bindings，并在 adapter 执行期间保存 binding metadata。Seed adapter 是 Vitest。

3. **M2: Quality checker**
   验证 required metadata 和基础可读性规则。在这个 milestone 被接受之前，checker failures 可以是 warnings；接受之后 required metadata failures 变成 blocking。

4. **M3: Result collector**
   按 promise id 归一化 adapter events/results。

5. **M4: Evidence mapper**
   跟踪 promise-to-test 和 promise-to-evidence mappings，并捕获 assertion fingerprints。

6. **M5: Seed report**
   生成可读的 JSON 和 Markdown reports，包括 lifecycle、run status 和 evidence deltas。

7. **M6: Self-hosted iteration**
   使用 seed report 端到端推动一个具体的下一轮 Harness feature：从 promise review 到 adapter result 再到 report。

## 八、成功标准

MVP 成功的标志是：

1. Harness 有自己的 promise files。
2. Adapter tests 可以声明 scenario binding。
3. Seed checker 可以拒绝不完整或不可读的 metadata。
4. Adapter results 可以按 promise id 分组。
5. Assertion fingerprints 和 evidence deltas 有清晰的后续 protocol 路径。
6. 人类可以阅读 seed report，并理解每个 Harness promise 的 lifecycle、run status 和 evidence status。
7. 下一个 Harness feature 可以作为 promises 被规划，并被 seed Harness 验证。
8. 一个完整 self-hosted feature 已经被端到端演示。
