# Harness Studio Canvas Experience

> 状态：讨论稿
> 目标：把 Harness Studio 定义成 canvas-first 的 workbench，为 promise-driven vibe coding 做准备。

## 1. 方向

Harness Studio 不应该像一个通用 admin dashboard。它应该是一个聚焦的 TestHarness workbench：人和 agent 可以从已 review 的行为承诺开始，一层层长出测试和实现。

目标流程是分层的：

```text
tests/modules + tests/promises
  -> 绑定 promise 的单元 / 集成 / 浏览器测试
  -> 满足这些 promises 的业务逻辑
```

所以主界面首先应该帮助用户理解和管理 behavior model。测试和业务代码是这个 model 之下的 evidence 和 linked detail，而不是独立的一组顶层产品入口。

未来方向是一套 vibe coding 环境：Harness Studio 背后有 daemon，可以连接 Codex、cloud workers 或其他 agent runtime。这个 daemon 以后可以 draft promises、绑定测试、运行 Harness、修改业务代码。但现在 Harness Studio 只需要先准备好交互模型，不要现在就把 agent 控制能力做进去。

## 2. 北极星：不再先打开编辑器

长期目标是：日常产品开发不再需要先打开代码编辑器。用户应该可以只打开 Harness Studio，管理 behavior model，让 agent 执行受控变更，并通过 accepted promises 和 passing evidence 判断项目状态。

在这个世界里，TestHarness 不是测试旁边的一个面板。它是项目的架构索引和上线信心层：

- Module 是项目架构的第一层可见抽象。
- Promise 描述每个 Module 必须守住的行为契约。
- 测试是这些 promises 的可执行证据。
- 业务逻辑是满足这些证据的 linked implementation。
- Harness run passing 表示每个与上线相关的 accepted behavior commitment 都有当前有效证据。

Module 不是随手建的标签、filter、文件夹镜像或 UI 分类。它是人类理解项目组成时使用的可 review 架构边界。看一眼 Module 层，应该能回答：“这个系统由哪些主要部分组成？每个部分承诺负责什么？”

这是一条项目级建模规则，不只是 canvas 的展示规则。生成 module 的 skills、描述 module 的 schemas、拒绝模糊 module 的 validators，以及未来 daemon 的动作，都应该先把 module 当成 architecture boundary。

这不是说“任何绿色测试套件都证明产品一定正确”。它的意思是：系统应该把上线契约显式化。Accepted promises 足够完整，每个 accepted promise 都有有意义的证据，并且最新 Harness run passing。当这些条件成立时，Harness Studio 就可以成为人类判断 feature 是否可以上线的地方。

## 3. 当前方向的问题

现在 dashboard 方向一开始暴露的概念太多：overview、modules、promises、graph、review queues、generation、runs、status views 都在抢顶层导航。这会让产品显得比用户的第一个任务复杂很多。

对新用户来说，第一件有用的事其实很简单：

> 这个项目有哪些 Module，每个 Module 下有哪些 Promise？

其他能力都应该从这个问题下面渐进展开。

## 4. 产品原则

使用单一 canvas 作为主界面。

Sidebar 不再作为产品概念存在。Landing dashboard 也删掉。用户进入后直接看到一个大的 XYFlow canvas，用来表示项目的 behavior model。

Canvas 按层级渐进展示复杂度：

1. **Project level**：只展示 Module nodes，因为 Module 就是 architecture map。
2. **Module level**：选中一个 Module 后，展开或聚焦它对应的 Promise nodes。
3. **Promise level**：选中一个 Promise 后，在右侧可折叠 contextual panel 展示 promise 内容。
4. **Evidence level**：测试、运行证据、业务代码链接都放在选中 promise 下面，不做全局导航。

这样体验会更安静：一个界面，一个心智模型；只有当用户进一步选择时，才展示更深的内容。

## 5. MVP 体验

### 入口

根路由直接渲染 canvas。不再有独立首页，也不再有 "Dashboard" 页面。

第一屏包含：

- 占满可用空间的 XYFlow canvas
- 清晰排列的 Module nodes
- 必要时保留极少量 canvas controls，例如 zoom、fit view、search
- 没有 sidebar
- 没有 Overview、Modules、Promises、Runs、Generate、Review 这些顶层 tabs

### Module Nodes

每个 Module node 只表达最必要的信息：

- module title
- promise 数量
- aggregate run status，如果已有结果
- review 或 evidence 问题的小提示，如果存在

Node 不展示长描述或完整 metadata。这些内容应该在选中后的 detail panel 里出现。

完整的 Module nodes 必须能被当作项目架构图来阅读。如果一个 Module 不能对应一个有意义的架构部分，它就不应该是 Module。如果一个重要架构部分没有出现在 Module 层，Harness Studio 就隐藏了项目的真实形状。

### Module Selection

点击 Module 后，该 Module 成为 active focus。

Active 状态可以：

- 在 Module 周围展开 Promise nodes
- 淡化无关 modules
- 画出 Module 到 Promise 的 ownership edges
- 更新 URL，让选中状态可以分享或恢复

用户应该感觉自己是在同一个 canvas 上逐渐 zoom in，而不是跳转到另一个页面。

### Promise Nodes

Promise nodes 应该紧凑且可读：

- short title
- priority
- lifecycle
- current run status

Promise node 要始终 behavior-first。它不应该看起来像 test file、code file 或 task card。

### 右侧 Context Panel

选中 Promise 后，右侧打开一个依附于 canvas 的 context panel。这个 panel 必须允许折叠。折叠后应该保留当前选中状态，留下一个小的重新打开入口，让 canvas 重新拿回空间，但不要让用户丢失当前位置。

在 MVP 中，这个 panel 先作为 Promise Inspector，展示：

- promise title 和 id
- purpose
- priority、boundary、lifecycle、review state
- Given / When / Then
- failure meaning
- observed files
- 绑定的测试证据和当前 result status
- 如果可用，展示关联的 implementation files

Panel 应该方便扫读。先展示 meaning 和 status，再展示 metadata。它不应该变成 YAML dump。

未来进入受控 vibe coding 后，同一个右侧区域可以加入 prompt 和 agent controls。但它仍然应该跟随当前选中的 Module 或 Promise，而不是变成一个全局聊天 sidebar。

### Evidence And Code Links

Evidence 比 Promise 再深一层。

从 context panel 中，用户可以查看：

- 绑定到 promise id 的测试
- 最新 adapter results
- observed source files
- 与该 promise 相关的 implementation files

这些内容以后可以变成 graph nodes，但默认第一屏不应该直接展示它们。

## 6. 信息架构

UI 应该按 canvas state 组织，而不是 sidebar pages。

建议 URL model：

```text
/                         -> module overview canvas
/?module=<module-id>       -> 同一个 canvas 聚焦某个 module
/?promise=<promise-id>     -> 同一个 canvas 选中 promise，并打开 panel
```

如果使用 route-based URL 也可以，只要仍然渲染同一个 canvas：

```text
/modules/<module-id>
/promises/<promise-id>
```

关键规则是：导航只是改变 canvas 的 focus，而不是切到独立 management page。

## 7. 第一体验里要移除什么

这些不再作为顶层入口出现：

- Dashboard / Overview
- Modules list page
- Promises list page
- 独立 Project map page
- Review queue
- Generate promise
- Runs
- Status pages

这些能力以后可以作为 contextual overlays 或 panel sections 回来，但不应该作为第一层导航暴露。

## 8. 未来 Daemon 方向

Daemon 是从只读可视化走向 vibe coding 的桥。

未来 canvas 可以暴露这些动作：

- 把新增 architecture Module 作为明确的 architecture review event 提出
- draft 或 split Promises
- 把测试绑定到 Promise
- 运行 `harness check` 或 `harness test`
- 让 Codex 实现代码直到某个 Promise passing
- 让 Codex 在保持 accepted promise meaning 不变的前提下修改测试或实现
- 总结 evidence drift
- 对 promise 变更打开 human approval flow

Daemon 必须保持 Harness 模型：

1. Module 变更必须作为明确的 architecture review event。
2. Promise meaning 必须先在所属 architecture module 内 draft，然后才开始实现。
3. 人类 review、编辑或批准 promise。
4. 测试绑定到 approved promise id。
5. 实现工作跟随 promise 和 test evidence。
6. Harness Studio 展示最终 status 和链接。

Agent actions 不应该让 UI 变成一个贴在 graph 旁边的自由聊天窗口。Graph 仍然是用户定位和理解项目的主界面，Harness 仍然是上线 gate。

## 9. 实现阶段

### Stage 1: Canvas-Only Read Model

- 用 Harness Studio 的 canvas 替换当前 landing / dashboard / sidebar 体验
- 默认先渲染 Module nodes
- 选中 Module 后展开 Promise nodes
- 选中 Promise 后打开可折叠的右侧 context panel
- 所有数据保持 read-only

### Stage 2: Evidence Drilldown

- 在 context panel 中展示绑定测试证据
- 展示 run status 和 latest result details
- 链接 observed source files 和 implementation files
- 加轻量 filtering/search，但不要重新引入 sidebar

### Stage 3: Controlled Vibe Coding

- 引入 daemon API
- 允许通过显式动作 draft promise 和绑定测试
- 从 UI 运行 Harness commands
- 连接 Codex/cloud workers 去实现 approved promises

## 10. 产品决策与默认方案

已确定：

1. 产品界面叫 **Harness Studio**。
2. 右侧 context panel 允许折叠。

先按最优雅默认方案尝试：

1. Evidence 和 implementation files 先留在 context panel 里。只有当它们真的能帮助定位、比较或分析影响范围时，再提升成 graph nodes。
2. URL model 先用 query-state（`/?module=...`、`/?promise=...`），因为它表达的是同一个 canvas 内的 focus。后面如果分享、浏览器历史或 deep linking 需要，再补 semantic routes。
3. Release confidence 先显示一个默认 profile：所有 accepted P0/P1 promises 必须 passing，所有 accepted promises 必须有当前有效 evidence。等真实项目暴露出需求后，再让 profile 可配置。
