# AGENTS.md

## 项目概览

这个项目是一个 **promise-driven Test Harness** 的基础。

它的目标不是单纯运行测试，也不是单纯提高 coverage。它的目标是让测试和测试 metadata 成为软件系统的可读模型，让人类可以不逐行阅读实现代码，也能理解、review 和管理系统行为。

第一版实现是 **Vitest-first**。Vitest 应该提供执行基础：test discovery、test running、assertions、mocks、projects、reporters、browser mode、coverage 和 Node API 编排。这个项目应该在 Vitest 之上构建 promise 和 review 层，而不是重新实现一个测试 runner。

在这个项目里，一个测试代表一个 **promise**：一条人类可读的行为承诺，用来描述某个 feature 必须保证什么、为什么这个保证重要、它属于什么 boundary，以及哪些可观察证据可以证明它仍然有效。

预期工作流是：

1. 人类和 Agent 讨论一个新的 feature。
2. 双方识别这个 feature 背后的 promises。
3. Agent 在写实现代码之前，先草拟 promise metadata 和测试意图。
4. 人类 review 并批准这个 promise。
5. Agent 根据已批准的 promise 编写测试和实现逻辑，直到应用满足 promise。
6. Harness 运行应用和自动化测试，收集证据，并把结果映射回 promise id。
7. 未来修改需要通过同样的 review 流程更新、拆分、合并或废弃 promises。

这个项目最核心的设计原则是：人类主要 review **promises**，而不是实现代码。只要已批准的 promises 足够精确，并且实现满足这些 promises，系统就可以在减少逐行代码 review 的情况下持续演进。

这个项目必须实现自举。先构建一个很小的 seed Harness，然后用“关于这套 Harness 项目自身的 promises”来推动后续实现。

## 这个项目要构建什么

这个项目预期会逐步演进成一套小而结构化的工具集，包括：

- **Seed Harness**：最小自托管循环，用来存储本项目自己的 promises、附加 Vitest scenario bindings、按 promise id 收集结果，并输出可读的 promise 状态。
- **Agent Skill**：指导 Agent 如何写 Harness-friendly 测试。
- **Promise Registry**：持久化 promise metadata、review 状态、生命周期状态和变更历史。
- **Vitest Scenario Metadata Helper**：为 Vitest 测试提供 `scenario` / promise helper。
- **Quality Checker**：静态检查测试是否具备可读结构、稳定 metadata、中文测试目的、boundary、priority 和可观察断言。
- **Vitest Application Test Orchestration**：运行或连接到应用，执行配置好的 Vitest projects 和 browser checks，并收集证据。
- **Vitest Result Collector**：把 Vitest reporter 输出或 Node API 结果转换成按 scenario 或 promise id 组织的统一 JSON。
- **Analyzer**：生成 feature map、promise review map、risk map 和 failure impact summary。
- **UX**：最终把 feature 讨论、promise review、运行历史、失败信息和行为地图组织成人类可用的工作流。

## 文档规则

项目文档默认使用英文。

每一份英文 Markdown 文档都应该有对应的中文翻译，使用相同基础文件名并添加 `.zh-CN.md` 后缀。

示例：

```text
test-harness-design.md
test-harness-design.zh-CN.md
AGENTS.md
AGENTS.zh-CN.md
```

更新文档时，需要保持英文版和中文版同步。

## Agent 工作备注

- 把 promises 视为项目的一等 artifact。
- 把 `.promise.json` files 视为已 review behavior promise meaning 的 canonical source。测试里的 `scenario(...)` 应该绑定 promise id，而不是重新定义 promise。
- 拆分持久化 lifecycle 和 computed run status。一个 promise 可以同时是 `accepted` 和当前 `failing`。
- 代码里避免裸用 `Promise`，因为它会和 JavaScript `Promise` 冲突；优先使用 `BehaviorPromise`、`PromiseRecord` 和 `promiseId`。
- 保留 promise id 历史。Rename promise 意味着创建新 id，并 deprecate 或 supersede 旧 id。
- 优先选择自举步骤。第一版实现应该先能验证这套 Harness 项目自身，再广泛支持外部项目。
- 新增 Harness 能力时，先为这个能力编写或更新 promises。
- 把 promise drift 视为一等 review 对象。如果 promise 变弱、范围变窄、可观察性降低或 priority 降级，要保留旧文本、新文本、发起者、原因、时间戳和 human acknowledgement 状态。
- 不要假设 Vitest 测试通过就仍然证明了 promise。需要跟踪 N:M promise-to-test evidence mapping，捕获 assertion fingerprints，并在测试被生成或编辑时保留 evidence delta。
- Seed Harness 阶段使用 PR-based review metadata；在 checker 自身被接受之前，允许 checker 先输出 warnings。
- 优先基于 Vitest 构建，不要先发明 Harness 自己的 runner 行为。
- Agent 和 CI 执行测试时优先使用 `vitest run`，确保命令确定性退出。
- 能解决问题时，优先使用 Vitest reporters、projects、annotations、browser mode 和 Node API。
- 没有人类明确批准时，不要弱化、删除或模糊高优先级 promises。
- 优先做能提升人类可读性和 review 体验的修改。
- 实现细节应服从已批准的行为 promises。
- 尽量保留生命周期和 review 历史。
- 添加示例时，要足够具体，让人不读实现代码也能理解行为。
