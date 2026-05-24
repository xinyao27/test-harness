# MVP Seed Harness 设计

> 状态：MVP 设计草案 v1
> 目标：构建最小自举版本的 Test Harness，让 Harness 可以开始验证它自己的 promises。

## 一、目的

完整 Test Harness 目前仍然只是设计。第一版实现不应该试图一次性构建完整的 Promise Review Console。

MVP 应该是一个 **seed Harness**：一个最小的、基于文件的、Vitest-first 系统，用来描述、运行和报告这套 Harness 项目自身的 promises。

Seed Harness 的目的，是建立第一个自举循环：

```text
为 Harness 自身写 promises
  -> 给 Vitest tests 附加 scenario bindings
  -> 运行 Vitest
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

2. **Vitest scenario helper**
   提供 `scenario(...)` bindings，把 Vitest tests 连接到 canonical promise ids。

3. **Basic quality checker**
   检查 canonical promise metadata 和 scenario bindings 是否存在、可读，并且足够完整。

4. **Basic evidence mapper**
   跟踪哪些 tests 和 assertions 声称证明了哪个 promise。为 Evidence Drift v1 捕获 assertion fingerprints。

5. **Vitest result collector**
   运行或读取 Vitest 结果，并按 promise id 归一化。

6. **Seed report**
   按 feature 和 promise 输出人类可读报告。

Seed 阶段不做：

- 完整可视化 Promise Review Console
- 复杂 browser UX
- 多语言 adapters
- 完整 drift AI 分类
- 高级 risk maps
- 组织级权限
- 外部项目 onboarding

Seed 阶段仍然通过 assertion fingerprints 记录 deterministic evidence drift。完整 AI-based drift classification 不在 seed 范围内。

## 三、数据模型

Seed 可以先从文件开始。

Canonical source 决策：

```text
.promise.json files
  -> canonical reviewed promise meaning

scenario({ id })
  -> 测试侧绑定到 canonical promise
```

如果 `scenario(...)` 试图重新定义 title、priority、boundary、Given / When / Then 或 observes，seed 应该把它视为 invalid metadata 或 potential drift。已 review 的 promise file 胜出。

Seed review 机制：

```text
Human review 基于 PR。

修改 .promise.json files 需要正常 code review。
review metadata 记录批准 promise 的 PR 或 commit。
```

自举循环依赖规则：

```text
第一批 self-promises 由人类手动 review。
在 M2 稳定之前，quality checker 可以 warning 而不是 hard-fail。
M2 被接受之后，required metadata failures 变成 blocking。
```

建议结构：

```text
promises/
  test-harness/
    promise-registry.promise.json
    scenario-helper.promise.json
    result-collector.promise.json
    quality-checker.promise.json

src/
  scenario.ts
  collect-results.ts
  check-quality.ts
  evidence-map.ts

reports/
  harness-report.json
  harness-report.md
```

Promise file 形态：

```ts
interface PromiseRecord {
  id: string;
  feature: string;
  title: string;
  purpose: string;
  priority: "P0" | "P1" | "P2";
  boundary: "unit" | "integration" | "browser" | "e2e" | "adapter";
  lifecycle: "proposed" | "accepted" | "implemented" | "changed_requires_review" | "deprecated";
  given: string[];
  when: string[];
  then: string[];
  observes: string[];
  failureMeaning: string;
  supersedes?: string[];
  deprecatedBy?: string;
  review: {
    approvedBy?: string;
    approvedAt?: string;
    approvedIn?: string;
    notes?: string;
  };
}
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

Scenario metadata 形态：

```ts
scenario({
  id: "harness.promise_registry.persist_accepted_promises",
  evidence: ["promise file loaded", "lifecycle field preserved"],
});
```

Assertion fingerprint 形态：

```ts
interface AssertionFingerprint {
  scenarioId: string;
  testFile: string;
  testName: string;
  assertions: Array<{
    target?: string;
    matcher: string;
    literal?: string;
    evidenceTag?: string;
  }>;
}
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
Vitest tests 可以通过稳定 promise id 绑定到 canonical promise。

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
Vitest results 会按 promise id 归一化。

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
  运行 Vitest，按 promise id 收集结果，并捕获 assertion fingerprints。

harness report
  生成 reports/harness-report.json 和 reports/harness-report.md。
```

第一版也可以先合并成一个命令：

```text
harness verify
  check -> test -> report
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
   实现 `scenario({ id })` bindings，并在 Vitest 执行期间保存 binding metadata。

3. **M2: Quality checker**
   验证 required metadata 和基础可读性规则。在这个 milestone 被接受之前，checker failures 可以是 warnings；接受之后 required metadata failures 变成 blocking。

4. **M3: Result collector**
   按 promise id 归一化 Vitest results。

5. **M4: Evidence mapper**
   跟踪 promise-to-test 和 promise-to-evidence mappings，并捕获 assertion fingerprints。

6. **M5: Seed report**
   生成可读的 JSON 和 Markdown reports，包括 lifecycle、run status 和 evidence deltas。

7. **M6: Self-hosted iteration**
   使用 seed report 端到端推动一个具体的下一轮 Harness feature：从 promise review 到 Vitest result 再到 report。

## 八、成功标准

MVP 成功的标志是：

1. Harness 有自己的 promise files。
2. Vitest tests 可以声明 scenario binding。
3. Seed checker 可以拒绝不完整或不可读的 metadata。
4. Vitest results 可以按 promise id 分组。
5. Assertion fingerprints 会被捕获，并且可以报告 evidence deltas。
6. 人类可以阅读 seed report，并理解每个 Harness promise 的 lifecycle、run status 和 evidence status。
7. 下一个 Harness feature 可以作为 promises 被规划，并被 seed Harness 验证。
8. 一个完整 self-hosted feature 已经被端到端演示。
