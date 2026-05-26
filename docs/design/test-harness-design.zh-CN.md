# Test Harness 设计

> 状态：设计草案 v2
> 目标：构建一套语言无关、promise-driven 的 Test Harness，让人类 review 行为承诺，让 Agent 实现满足这些承诺的代码。

## 文档约定

项目文档默认使用英文。每一份英文 Markdown 文档都必须有对应的中文翻译，使用相同基础文件名并添加 `.zh-CN.md` 后缀。

示例：

```text
test-harness-design.md
test-harness-design.zh-CN.md
```

## 一、这是什么

这个项目是一套围绕 versioned YAML protocol 构建的 **承诺驱动 Test Harness**。

它不绑定某一种语言或测试框架。当前实现使用 Rust 编写 core/CLI，并在 Node test-runtime 边界保留一个薄 TypeScript Vitest adapter。

这套 Harness 增加的是普通测试框架没有提供的那一层：

- 人类可读的行为承诺
- 承诺 review 和批准
- 承诺生命周期历史
- Agent 写测试的质量规则
- promise drift 和 evidence drift 检测
- 测试结果和证据映射回 promise
- 支持持续承诺迭代的 UX

核心思想：

```text
人类 review promises。
Agent 编写测试和实现。
Adapters 运行可执行检查。
Harness 把结果映射回已批准的 promises。
```

## 二、架构一览

```text
Human + Agent
  -> 讨论 feature 意图
  -> 草拟行为承诺

Promise Workspace
  -> review / approve / request changes
  -> 跟踪生命周期和 drift

Promise Registry
  -> 存储 promises、review 状态、历史、drift records

Adapter Tests
  -> 把 promises 编码成可执行证据
  -> 使用 scenario bindings

Adapter Runner / UI / Reporters
  -> 运行测试、browser checks、coverage、reports

Result + Evidence Collector
  -> 收集 pass/fail、logs、screenshots、DOM/state/file evidence

Analyzer
  -> 生成 feature map、promise map、evidence coverage、risk map

Harness Studio
  -> 展示 architecture playground、promises、drift、evidence、failures 和 run history
```

Adapters 负责执行。Harness protocol 负责承诺语义。

## 三、开发流程

1. 人类和 Agent 讨论一个 feature。
2. Agent 草拟这个 feature 的行为承诺。
3. 人类 review promises，而不是实现代码。
4. 被批准的 promises 变成稳定的行为约定。
5. Agent 编写 adapter tests 和实现逻辑。
6. 配置好的 adapter 运行检查。
7. Harness 把测试结果和证据映射回 promise ids。
8. 未来修改通过 review 来更新、拆分、合并或废弃 promises。
9. Promise drift 和 evidence drift 都必须显式提醒人类。

目标是：人主要 review **系统承诺什么**，Agent 负责 **代码如何满足这些承诺**。

## 四、自举策略

这套 Harness 应该尽早开始使用自己来构建自己。

第一版实现应该是一个很小的 **seed Harness**，而不是完整最终系统。它的任务是让项目具备自托管能力：

```text
Seed Harness
  -> 存储这套 Harness 项目自己的 promises
  -> 给 adapter tests 附加 scenario bindings
  -> 运行配置好的 adapter
  -> 按 promise id 收集结果
  -> 检查基础可读性和 evidence 规则
  -> 报告哪些 Harness promises 通过、失败或需要 review
```

当 seed 存在之后，Harness 的每个主要部分都应该通过“关于 Harness 自身的 promises”来开发：

```text
构建最小 Harness 能力
  -> 为下一个 Harness 能力写 promises
  -> review 这些 promises
  -> 实现 tests 和逻辑
  -> 用 Harness 运行并验证 Harness 自身
  -> 用 failures 和 drift records 指导下一轮迭代
```

详细 MVP 方案见 [mvp-seed-harness-design.zh-CN.md](mvp-seed-harness-design.zh-CN.md)。

## 五、核心术语

### 人类管理模型

测试会随着时间变得很多。人类不应该通过直接阅读测试文件来管理系统。

面向人类的可读管理层级是：

```text
Module（架构边界）
  -> Promise
    -> Evidence
      -> Adapter Tests
```

Module 是架构入口。Module 不是松散标签、文件夹镜像或 UI 分类，而是告诉人类“这个项目由什么组成”的可 review 边界。Promise 是这个边界里的 review 单位。Evidence 解释为什么这个 promise 仍然可信。Adapter tests 是底层可执行编码。

默认 UX 应该汇总稳定绿色的 promises，只突出真正需要注意的东西：

```text
Needs Review
Changed
Drifted
Failing
Missing Evidence
Weak Evidence
P0 / P1
```

目标是让人先读到这种信息：

```text
Checkout / Payment

P0  Successful payment marks order as paid
    Status: passing
    Evidence: order.status, success page UI, payment event

P0  Failed payment preserves unpaid order
    Status: failing
    Failure meaning: user may think payment failed but order changed

P1  Payment retry does not duplicate charge
    Status: evidence drift
    Missing evidence: charge id uniqueness no longer asserted
```

然后再决定是否进入测试实现细节。

### Promise

**Promise** 是一条人类可读的行为承诺。

在代码和 schema 里，避免裸用 `Promise`，因为这是 Vitest / Node 项目，而 `Promise` 已经表示 JavaScript `Promise`。优先使用明确命名：

```text
BehaviorPromise
PromiseRecord
promiseId
```

示例：

```text
当支付成功时，订单进入 paid 状态，并且用户看到成功页面。
```

一个 promise 应该解释：

- 保证什么行为
- 为什么重要
- priority
- boundary
- Given / When / Then 行为
- 什么可观察证据能证明它
- 失败意味着什么

Promise files 是已 review 行为承诺的 canonical source of truth。Promise rename 不能静默编辑 id：应该创建新 id，并 deprecate 旧 id，这样历史仍然可读。

Promise 状态应该拆分成 review lifecycle 和 computed run state：

```ts
type PromiseLifecycle =
  | "proposed"
  | "accepted"
  | "implemented"
  | "changed_requires_review"
  | "deprecated";

type PromiseRunStatus =
  | "unknown"
  | "passing"
  | "failing"
  | "skipped"
  | "missing_evidence"
  | "evidence_drifted";
```

`lifecycle` 持久化在 promise files 中。`runStatus` 由 collector 根据最新 adapter run 和 evidence checks 计算。

### Scenario

**Scenario** 是测试侧 metadata，用来把可执行测试连接回 promises。

Adapter-side bindings 不是 canonical promise definition。它们应该把 adapter test 绑定到已有 `promiseId`。如果本地 metadata 和 canonical promise file 冲突，Harness 应该报告 drift 或 invalid metadata。

最小 adapter-side 形态：

```ts
scenarioTest(
  "checkout.payment.success_marks_order_paid",
  "marks the order paid after successful payment",
  () => {
    // executable evidence
  },
);
```

完整 title、priority、boundary、Given / When / Then 和 review lifecycle 都存在 promise file 里。

### Evidence

**Evidence** 是证明 promise 被满足的证据。

示例：

- 返回值
- 数据库记录
- 文件内容
- 发出的事件
- 可见 UI 文案
- DOM 状态
- screenshot
- log 或 trace
- error type

Harness 应该优先使用可观察证据，而不是只断言 mock 被调用。

Promise file 里的 `observes` 是 expected evidence claim。Adapter assertions 是实际可执行证据。Harness 应该把每个重要 `observes` item 映射到至少一个 assertion、显式 evidence tag 或捕获到的 assertion fingerprint。

### Promise Drift

**Promise drift** 指 promise 本身发生了变化。

它不一定是坏事。产品行为可以变化。但 promise drift 必须可见、可 review，因为它改变了系统声称要保证的东西。

示例：

```text
旧承诺：
当支付成功时，订单进入 paid 状态，并且用户看到成功页面。

新承诺：
当支付成功时，系统会处理订单。
```

这变弱了，因为它删除了精确的 paid 状态和用户可见的成功页面。

常见 promise drift 信号：

- priority 降级：`P0 -> P1`
- boundary 变弱：`browser/e2e -> unit`
- `then` 删除重要结果
- `observes` 删除 UI、数据库、文件或状态证据
- Given 范围变窄
- 精确行为变成模糊描述
- 用户可见行为消失
- 错误处理或边界情况被删除

每一次弱化 drift 都应该生成 drift record：

```text
old promise
new promise
drift type
initiator: human / agent / tool
reason
timestamp
human acknowledgement state
```

### Evidence Drift

**Evidence drift** 指 promise 没有变化，但测试已经不能像以前那样证明它。

示例 promise：

```text
当支付成功时，订单进入 paid 状态，并且用户看到成功页面。
```

旧证据：

```ts
expect(order.status).toBe("paid");
expect(screen.getByText("Payment successful")).toBeVisible();
```

新证据：

```ts
expect(payOrder()).resolves.toBeDefined();
```

测试可能仍然通过，但它已经不能证明订单变成 paid，也不能证明用户看到了成功页面。

常见 evidence drift 信号：

- 精确断言变宽松：`toBe("paid") -> toBeDefined()`
- 状态断言被删除
- UI 断言被删除
- 数据库、文件、事件断言被删除
- 测试只断言 mock 被调用
- 被测业务逻辑被 mock，而不是只 mock 外部 IO
- 测试变成 `skip`、`todo` 或不可达
- 测试 boundary 未经 review 变弱
- `observes` 里的证据不再被断言

Evidence drift 应该生成 evidence delta：

```text
evidence added
evidence removed
evidence weakened
evidence changed
promises affected
tests affected
requires human review: yes / no
```

Seed Harness 应该用 deterministic 的方式实现 Evidence Drift v1：为每个 scenario 记录 assertion fingerprint。

```text
matcher names
asserted symbols
asserted literals
observed targets
explicit evidence tags
```

示例 fingerprint：

```text
scenario: checkout.payment.success_marks_order_paid
assertions:
  - target: order.status
    matcher: toBe
    literal: paid
  - target: screen.getByText
    matcher: toBeVisible
    literal: Payment successful
```

当 fingerprint 变化时，即使还没有 AI drift classification，Harness 也可以先展示 evidence delta。

简单区分：

```text
Promise drift:
  目标变了。

Evidence drift:
  目标没变，但证明变弱了。
```

## 六、Protocol-First 设计

使用稳定的 Harness protocol 负责：

- canonical promise YAML
- adapter result YAML
- report shape
- CLI command semantics
- cross-language compatibility

使用 adapters 负责：

- test discovery and execution
- assertions and matchers
- mocks and fixtures
- browser checks and coverage
- framework-specific reporters or APIs

当前 adapter 是 Vitest。Vitest 对这个仓库仍然有用，但它不是 protocol boundary。

使用 Harness 负责：

- promise metadata
- human review state
- promise lifecycle history
- promise drift records
- evidence mapping
- evidence drift detection
- quality checks
- 按 promise id 归一化结果
- module、feature 和 risk maps
- Harness Studio UX

## 七、可读性和可管理性规则

Harness 必须通过改变管理单位来让测试可读：人管理 promises，而不是测试文件。

规则：

1. 人类优先按 architecture module 导航，而不是按文件路径导航。
2. 人类先 review promises，而不是先 review 测试实现。
3. Promise card 默认只展示 title、priority、boundary、lifecycle、run status、Given / When / Then、observable evidence 和 failure meaning。
4. 测试代码作为 drill-down 细节存在，不作为第一屏。
5. 稳定通过的 promises 只做汇总；review 注意力集中在 changed、failing、drifted、weak 或 missing-evidence promises。
6. 每个 promise 都必须映射到 observable evidence。
7. 每个重要 evidence item 都应该映射到一个或多个 adapter assertions。
8. Checker 必须拒绝不可读或不可管理的 modules 和 tests，包括模糊 module bucket、模糊测试名称、缺少 purpose、缺少 Given / When / Then、缺少 observes，以及 adapter boundary 之外的 mock-call-only assertions。
9. 生成 module 的 skills 必须从项目架构和 ownership model 出发，而不是从文件夹或方便的 UI 分类出发。
10. Promise files 是 canonical；测试里的 scenario bindings 不能静默重新定义已 review 的 promise meaning。
11. Change view 应展示从上一次 review 以来新增的 promises、删除的 promises、rename 的 promises、弱化的 promises、被删除的 evidence，以及失败的已接受 promises。
12. UI badge 必须明确区分 Promise Drift 和 Evidence Drift，不能只写 Drift。

这样即使测试数量增长，系统仍然可以被人类管理。

## 八、Harness Pass

配置好的 adapter 测试通过只是 **Runtime Pass**。

一个 promise 通过 Harness 需要：

```text
Runtime Pass
  Adapter checks pass。

Quality Pass
  测试可读、结构清楚、断言有意义。

Evidence Pass
  当前证据仍然能证明已接受的 promise。

Review Pass
  所有 promise drift 或 evidence drift 都已经被确认。
```

## 九、UX 形态

产品 UX 应该是 **Harness Studio**，不是普通测试 dashboard。

Harness Studio 是 playground-first 的界面：

```text
React Flow playground
  -> Module layer 作为项目 architecture map
  -> 选中 architecture boundary 后展示 Promise nodes
  -> Context inspector 展示选中的 Module 或 Promise
  -> Evidence、runs、drift 和 implementation links 作为 drill-down detail
```

当前 UX 方向定义在 [dashboard-canvas-experience.zh-CN.md](dashboard-canvas-experience.zh-CN.md)。虽然文件名保留了历史上的 canvas 命名，但内容现在描述的是 Harness Studio Playground experience。

重要 UX 问题：

- 这个系统承诺了什么？
- 哪些 promises 需要 review？
- 哪些 promises 变了？
- 哪些 promises 被弱化了？
- 哪些测试是绿色的，但已经不能证明已接受的 promise？
- 哪些 assertion fingerprints 从上一次 accepted review 后发生了变化？
- 哪些已批准 promises 正在失败？
- 哪个 architecture module 拥有这个行为？
- 哪些 feature 变更影响了哪些 promises？
- 我现在能运行相关 adapter checks 吗？

## 十、MVP

先构建能保留核心模型的最小版本。详细 seed 方案见 [mvp-seed-harness-design.zh-CN.md](mvp-seed-harness-design.zh-CN.md)。

1. **Seed Harness**
   创建最小自托管循环：promise storage、按 promise id 收集 adapter results，以及针对这套 Harness 项目自身的可读报告。

2. **Agent authoring skills**
   教 Agent 如何起草 Harness-friendly promises、architecture modules 和 tests。Skill 按场景切分 —— [../../skills/harness-add-feature/SKILL.md](../../skills/harness-add-feature/SKILL.md) 用于日常功能开发，[../../skills/harness-onboard-project/SKILL.md](../../skills/harness-onboard-project/SKILL.md) 用于首次接入，[../../skills/harness-troubleshoot/SKILL.md](../../skills/harness-troubleshoot/SKILL.md) 用于诊断命令失败。字段级别的规则放在 AGENTS.md 以及现有 `.promises.yaml` / `.module.yaml` 文件中作为模板，skill 本身专注于工作流。所有 module 相关 skill 都必须把 module creation 当成 architecture modeling，而不是 metadata filing。整体保持在 Harness runtime data model 之外。

3. **Promise registry**
   存储 promises、生命周期状态、review 状态、历史和 drift records。

4. **Vitest adapter**
   提供 `scenarioTest(...)` metadata 和写出 adapter event shards 的 reporter，再由共享 runtime 合并成 Harness result YAML。

5. **Quality and drift checker**
   检查 canonical metadata、scenario bindings、可读结构、中文测试目的、boundary、可观察断言、promise drift、evidence drift 和 assertion fingerprint changes。

6. **Evidence mapper**
   跟踪 promises、tests 和 evidence 之间的 N:M 映射。

7. **Result collector**
   读取 adapter results，并按 promise id 归一化。

8. **Minimal Harness Studio read surface**
   展示 architecture module layer、promise focus、运行结果、drift records 和 evidence coverage，同时不要重新引入 dashboard-style navigation。

## 十一、成功标准

这套 Harness 成功的标志是：

1. 人类可以通过 architecture modules 及其 promises 理解系统。
2. 人类主要 review promises，而不是实现代码。
3. Agent 写出的测试可读、可 review。
4. Adapter results 能清楚映射回已批准 promises。
5. Promise drift 不能静默发生。
6. Evidence drift 不能藏在绿色测试后面。
7. Harness 可以使用自己的 promises 和 adapter checks 来验证自己的核心行为。
8. 可以从 promises、tests 和 evidence 生成 module、feature 与 risk maps。
