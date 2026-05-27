# Harness Studio Playground Experience

> 状态：当前设计方向
> 目标：把 Harness Studio 定义成 playground-first 的 workbench，用于 promise-driven architecture review 和未来 vibe coding。

## 1. 方向

Harness Studio 不是 dashboard。它是一个聚焦的 playground，让用户通过 Harness model 理解和控制项目。

目标流程是分层的：

```text
tests/modules + tests/promises
  -> 绑定 promise 的单元 / 集成 / 浏览器测试
  -> 满足这些 promises 的业务逻辑
```

UI 应该让这个层级直接可见，而不是要求用户先打开原始 YAML。Module 是项目架构。Promise 是这些架构边界内的行为契约。Evidence 和 implementation links 是支撑细节。

Harness Studio 以后应该成为用户管理 Harness model、要求本地 agent 执行受控变更、运行验证，并判断 feature 是否可以上线的地方。

## 2. 北极星：不再先打开编辑器

长期目标是：日常产品开发不再需要先打开代码编辑器。

用户应该可以打开 Harness Studio 并回答：

- 这个项目由什么组成？
- 有哪些 architecture modules？
- 每个 module 承诺负责什么？
- 哪些 promises 已经有 accepted meaning？
- 哪些 promises 有当前有效 evidence？
- 什么发生了变化，这个变化是否保持了 approved promise？

在这个世界里，TestHarness 不是测试旁边的 sidebar。它是项目的 architecture index 和 release confidence layer。

Module 不是随手建的标签、文件夹镜像、filter 或 UI 分类。它是人类理解项目组成时使用的可 review 架构边界。完整 Module 层应该回答：“这个系统由哪些主要部分组成？每个部分承诺负责什么？”

Module 刻意不去承担的那个“目录级分组”角色，由上一层的 **Package** 承担（见 Graph Model）。Package 对应仓库的 workspace 结构（crate / app / package），只用来组织 Module；Module 仍是它里面的可 review 边界。

这条规则不只适用于 UI。生成 module 的 skills、描述 module 的 schemas、拒绝模糊 module 的 validators，以及未来 daemon 的动作，都应该先把 module 当成 architecture boundary。

## 3. 产品原则

使用一个 playground 作为产品界面。

Sidebar 不再作为产品概念存在。Landing dashboard 删除。Modules、promises、runs、generation、review inboxes、status pages 这些顶层管理页面也删除。根路由应该直接进入 React Flow playground。

外层 app shell 应该几乎不可见：

- 没有 sidebar
- 没有 landing page
- 没有装饰性 chrome
- 没有假按钮
- 没有顶层 tabs
- 没有 gradients、shadows、blur 或 translucent panels

用户应该感觉自己一直沉浸在 playground 里面。

## 4. Playground Layout

主视口是一个带边框的 React Flow canvas playground。

Frame 应该贴近 app 边缘，只保留很小的外部间距。视觉语言是 flat 和 square：

- square corners
- playground 外面只有一个清晰 border
- 使用 app theme 的 token-based colors
- 没有 gradient backgrounds
- 没有 decorative shadows
- 没有 semi-transparent panels

Canvas overlays 应该使用 React Flow 自己的布局 primitives：

- 顶部 controls 放在 React Flow `Panel`
- 右侧 context inspector 放在 React Flow `Panel`
- zoom 和 fit controls 在合适时使用 React Flow controls

顶部 controls 不能被 context inspector 挤压。Header 区域应该被预留，context inspector 从 header 下方开始。

## 5. Top Controls

顶部 control panel 是唯一常驻导航 chrome。

左侧：

- project switcher
- breadcrumb
- search

右侧：

- total module count badge
- total promise count badge
- snapshot source and freshness indicator
- settings button

所有 buttons 和 icon buttons 都应该使用共享 shadcn/ui components，并保持一致 size。不要给某个按钮单独写一套尺寸。

### Project Switcher

Project switcher 用来在本地 Harness projects 之间切换。

Daemon 已连接时，switcher 必须从认证后的本地 daemon project registry 读取数据。它不应该只是前端视觉列表，也不应该要求账号登录或 hosted server。

它应该提供：

- 搜索最近打开的 projects
- recent project list
- current project check mark
- add new project action
- 添加 project 时选择目录

切换 project 最终必须改变 daemon-backed project snapshot。只有视觉变化的 switcher 不能作为最终行为。

### Breadcrumb

Breadcrumb 放在 project switcher 旁边，表示当前 playground 内的 focus。

示例：

```text
todo-backend
todo-backend > TodoMVC Client
todo-backend > Todo-Backend API Contract > Creates todos
```

点击 breadcrumb segment 应该回到上层 focus，而不是离开 playground。

### Search

Search 是跳转到已知 module 或 promise 的最快方式。

它应该可以从 canvas 顶部 controls 和 keyboard shortcut 打开。Search 应该匹配 module titles、promise titles、promise ids、feature names、priorities、lifecycle states 和 covered file paths。Results 应该区分 modules 和 promises，并展示足够上下文，让用户能放心选择。

选择 module result 会聚焦该 module。选择 promise result 会聚焦它所属的 module、选中 promise node、打开 context inspector，并更新 URL。这个能力对新 draft 的 promises 尤其重要，因为 reviewer 应该能在实现代码还不存在时找到相关 UI。

### Settings

Settings 从右上角 settings button 打开。

Settings 应该使用 shadcn/ui Dialog，而不是独立 settings page。Settings 包含产品级偏好：

- language
- light / dark mode
- daemon status 和 local pairing details
- revoke local daemon token

语言切换不应该作为独立控件占据右上角的重要位置。

本地 daemon 使用不应该出现 login surface。

### Snapshot Source

Harness Studio 必须让当前数据源可见。

Daemon-backed data 是 live project view。Static fallback data 只是降级的 read-only view，而且可能过期。如果 Studio 渲染 fallback data，UI 必须明确说明新加 modules 或 promises 可能缺失，并提供明显的 reconnect 或 pairing 路径。

Module 和 promise counts 应该继承同一个 source state。来自 fallback data 的 count 不能看起来像 canonical project truth。

## 6. Graph Model

Graph 渐进展示 Harness complexity：

1. **Project level**：展示按 **Package 区域**（见下）分组的 Module 卡片。Module 是 architecture map，Package 只是它们外面的目录级分组；这一层还不画 Promise。
2. **Module focus**：选中 Module 后展开或聚焦它的 Promise nodes（几十个时用优先级分组、分页、搜索来承载）。
3. **Promise focus**：选中 Promise 后打开 context inspector。
4. **Evidence level**：测试、run evidence 和 implementation links 优先显示在 inspector 内。

Navigation 只改变同一个 graph 里的 focus，而不是切换到独立 management pages。Package 不是一个导航步骤——它是静态区域，所以下钻是 Module → Promise → evidence。

### Package 区域

Package 就是 **monorepo 里 package 的同一个概念**——一个把仓库按领域切开的 workspace 成员（比如前端、后端、CLI）。在画布上它是一个把属于它的 Module 卡片框起来的命名区域。

Package 是**可选的**：单 package（非 monorepo）项目没有 Package，project level 就直接展示 Module 卡片、不画区域。只有当仓库是多 package workspace 时才出现 Package。

Package 刻意做得很轻：

- 它的真实来源是仓库的 **workspace 定义**（Cargo `[workspace].members`、pnpm/npm `workspaces`）。每个 Module 按它的 `covers` 路径映射到包含它的那个 package；这个映射由 agent 在 onboarding 时完成。
- 它的**名字就是 monorepo package 的名字**（manifest 的 `name`，如 `harness-cli`、`@test-harness/web`）。短显示名（CLI / Core / App）是可选覆盖，不是必须。
- 它是**区域，不是卡片，也不是下钻层级**。Module 仍然是卡片、是用户点进去的单位。
- 它**不带 review、不带 action**，只是一个目录式的组织概念。Promise 仍挂在 Module 上，Module 模型不变。
- 框头展示名字、路径和汇总计数（modules / promises / needs-review）。区域**可折叠**，让 module 很多的项目仍然可扫读。

这就是 os.ryo.lu 那种带标题的区域排版语法，但落在一个真实概念（仓库的 package 边界）上，而不是凭空造的视觉分组。

## 7. Module Nodes

Module nodes 必须能作为 architecture boundaries 阅读。

每个 Module node 应该展示：

- module title
- priority badge
- owned promises 需要 human review 时展示 review attention indicator
- promise count
- coverage count
- 可用时展示 evidence 或 run status

每个 Module node 应该避免：

- 冗余的 "Module" tag
- 类似 "Relevance unknown" 的模糊标签
- 长描述
- 完整 YAML metadata

Priority 很重要，应该影响 layout 和展示：

- P0 modules 放在第一排或第一组。
- P1 modules 放在下一排或下一组。
- 更低优先级继续向下。
- Priority badges 应该紧凑、清晰。

Node layout 应该让项目架构一眼可读。

### Module Review Attention

当 Module 拥有需要人类 review 的 promises 时，Module 应该展示一个紧凑的 attention dot。

第一版应该通过 promise lifecycle 和 review state 定义“needs attention”，而不是通过每个用户自己的 unread state。只要一个 module 拥有 proposed promises、changed promises、pending review promises，或未来 protocol 中明确需要 review 的状态，它就需要 attention。

这个 dot 不是装饰。它回答的是：“我下一步应该检查哪个 architecture boundary？”选中 module 后，需要 review 的 promises 应该排在 already-reviewed promises 前面。

视觉上它可以像一个小红点，但实现应该使用语义化 theme tokens，而不是硬编码 palette classes。

## 8. Promise Nodes

用户 focus 某个 module，或者通过 URL 直接选中 promise 时，Promise nodes 出现。

Promise nodes 应该展示：

- short title
- priority badge
- lifecycle
- 当前 evidence 或 run status

它们应该始终 behavior-first。它们不应该看起来像 task cards、test files 或 implementation file nodes。

## 9. Context Inspector

Context inspector 是右侧 React Flow `Panel`，不是普通 app sidebar。

它应该：

- 位于 playground frame 内
- 从 top control panel 下方开始
- 可以折叠
- 折叠后保留 graph selection
- 在合适位置使用共享 shadcn/ui building blocks
- 避免 shadows、transparency 和 rounded card styling

选中 Module 时，inspector 展示 architecture context：

- module title
- purpose
- priority
- owned promises
- coverage paths
- evidence summary

选中 Promise 时，inspector 展示 behavior context：

- promise title 和 id
- purpose
- priority、boundary、lifecycle、review state
- Given / When / Then
- failure meaning
- observed files
- 绑定测试证据和当前 result status
- 如果可用，展示 linked implementation files

Inspector 应该先展示 meaning 和 status，再展示 metadata。它不应该变成 raw YAML dump。

## 10. Style System

Harness Studio 应该使用 flat、practical 的设计语言。

这些内容都要使用 `apps/web/src/index.css` 中的 theme tokens：

- colors
- borders
- backgrounds
- spacing
- 有意使用的 shadows
- radii

避免在 application surfaces 中使用类似 `border-zinc-950` 的硬编码 Tailwind palette classes。这类写法会让 theme switching 更困难，也隐藏了设计意图。

当前设计默认值：

- square corners
- 没有大圆角 cards
- 没有 gradients
- 没有 decorative shadows
- 没有 blur panels
- 没有 semi-transparent panels
- 低装饰性
- 高布局清晰度

Button、Badge、Dialog、Dropdown Menu、Breadcrumb、Tooltip 等标准控件优先使用 shadcn/ui components。可以扩展本地 variants，但应该保持 theme-token behavior。

## 11. URL Model

优先使用 query-state URLs，因为它表达的是一个 playground 内的 focus：

```text
/                         -> project module overview
/?module=<module-id>       -> 同一个 playground 聚焦某个 module
/?promise=<promise-id>     -> 同一个 playground 选中 promise
```

如果分享、浏览器历史或 deep linking 需要，以后可以补 semantic routes。关键规则是：navigation 改变 playground 内的 focus，而不是切到独立 management pages。

## 12. Future Daemon Direction

Daemon 是从只读可视化走向本地控制和 vibe coding 的桥。具体 runtime 边界定义在 [Harness Daemon Runtime Control Plane](./harness-daemon-runtime-control-plane.zh-CN.md)。

最重要的产品规则是：daemon 是本地 control plane，不是新的真实数据源，也不是 server-mediated identity system。Harness files 和显式 run evidence 仍然是 canonical；daemon 在完成 local pairing 后负责索引、监听、运行，并把 derived state stream 回 Harness Studio。No-login connection model 定义在 [Local Daemon Studio Connection](./local-daemon-studio-connection.zh-CN.md)。

未来 playground 可以暴露这些动作：

- 把新增 architecture Module 作为明确的 architecture review event 提出
- draft 或 split Promises
- 把测试绑定到 Promise
- 运行 `harness check` 或 `harness test`
- 让本地 agent 实现代码直到某个 Promise passing
- 让本地 agent 在保持 accepted promise meaning 不变的前提下修改测试或实现
- 总结 evidence drift
- 对 promise 变更打开 human approval flow

Agent actions 不应该让 UI 变成一个贴在 graph 旁边的自由聊天窗口。Graph 仍然是用户定位和理解项目的主界面，Harness 仍然是 release gate。

## 13. Implementation Stages

### Stage 1: Playground Shell

- 删除 sidebar 和 landing dashboard
- 渲染一个带边框的 React Flow playground
- 把常驻 controls 移入 React Flow panels
- 使用 project switcher、breadcrumb、count badges 和 settings dialog
- 删除 fake 或没有实际作用的 buttons
- 强制使用 flat token-based styling

### Stage 2: Graph Interaction

- 按 priority group 渲染 Module nodes
- 选中 Module 后展开或聚焦 Promise nodes
- 在 top panel 下方打开右侧 context inspector
- 同步 URL query state
- 支持 inspector collapse 和 restore

### Stage 3: Daemon-Backed Data

- 无账号登录地把 Studio 与本地 daemon 配对
- 用 daemon project snapshots 替换静态前端 snapshots
- project switcher 切换真实 projects
- 监听 Harness files 并刷新 graph
- stream project 和 snapshot events

### Stage 4: Runs And Evidence

- 从 playground 运行 Harness commands
- 收集 result evidence
- 展示 latest run 和 promise status
- 从 inspector 链接 tests 和 implementation files

### Stage 5: Controlled Vibe Coding

- 通过 daemon providers 引入本地 agent sessions
- 把 permission requests 和 diffs 展示成可 review actions
- 让 agents draft promises、绑定 tests、实现 approved behavior
- 保持 graph 作为定位主界面

## 14. Product Decisions

已确定：

1. 产品界面叫 **Harness Studio**。
2. 第一屏是 playground，不是 dashboard。
3. 没有 sidebar。
4. Settings 使用 shadcn/ui Dialog 打开。
5. Project switching 放在左上角 playground controls。
6. Search 属于 canvas 顶部 controls，因为 promise review 需要直接导航。
7. Breadcrumbs 在 project switcher 旁边展示当前 focus。
8. Module 和 promise counts 是右上角 compact badges。
9. Context inspector 可折叠，并位于 React Flow playground 内。
10. 视觉语言是 flat、square、token-based。
11. 本地 daemon 使用不要求账号登录或 hosted relay。
12. Package 是最外层分组，等同于 monorepo 的一个 package（workspace 成员），且是可选的（单 package 仓库没有 Package）。它是框住 Module 卡片的区域，不带 review、不带 action。Module 仍是可 review 边界；Package 来自仓库的 workspace 定义（配合 module `covers` 映射），不是单独编写的 artifact。

先按默认方案尝试：

1. Evidence 和 implementation files 先留在 inspector 里。只有当它们真的能帮助定位、比较或分析影响范围时，再提升成 graph nodes。
2. URL model 先用 query-state。
3. Release confidence 先显示一个默认 profile：所有 accepted P0/P1 promises 必须 passing，所有 accepted promises 必须有当前有效 evidence。等真实项目暴露出需求后，再让 profile 可配置。
