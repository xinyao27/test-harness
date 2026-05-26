# Harness Daemon Runtime Control Plane

> 目标：把本地 daemon 定义成 Harness Studio 的 runtime control plane，同时避免它变成新的真实数据源。

## 1. 定位

Harness Daemon 是 Harness Studio 的本地 runtime control plane。

它负责把 Studio UI 连接到本地项目、Harness protocol files、测试命令、运行证据、文件监听，以及未来的本地 coding agents。它的职责是让本地项目状态可以在 Harness Studio 中被观察、控制和编排。

对于 local-first Studio 路径，daemon 不要求账号登录，也不会维持到 hosted server 的 outbound connection。Studio 在 daemon-owned pairing flow 完成后，通过本地 loopback 边界直接访问 daemon。具体连接模型定义在 [Local Daemon Studio Connection](./local-daemon-studio-connection.zh-CN.md)。

Daemon 不是 Harness meaning 的 canonical store。项目文件仍然是真源：

- `tests/modules/`
- `tests/promises/`
- `tests/harness.yaml`
- versioned protocol artifacts
- adapters 和 runners 产出的 run evidence files

Daemon 可以索引、缓存、校验、diff 和 stream 这些状态，但它必须能够从 protocol files 和 run evidence 中重建有意义的视图。

## 2. 核心原则

Daemon 不能变成隐式状态中心。

如果 module metadata、promise meaning、run status、watched file state 和 agent writes 主要存在 daemon memory 或私有数据库里，系统就会偏离 protocol-first 模型。这样会让 Harness Studio 更容易 demo，但更难被信任。

安全规则是：

1. 持久化的 Harness meaning 属于 protocol files。
2. 持久化的执行历史属于显式 run evidence。
3. Daemon state 必须是 derived、operational 或 recoverable。
4. 任何 daemon cache 都必须可以丢弃。
5. 任何 agent 或 UI 写入都必须产生可 review 的文件变更或 run artifact。

### Local HTTP 边界

第一版 daemon transport 是 local HTTP，但它不应该因此变成 public infrastructure。

Daemon 默认应该绑定 loopback address，只接受预期的本机 Host header，并且只允许配置过的 Harness Studio origins 发起 browser requests。Snapshot responses 默认不应该暴露本机绝对文件路径。当 Studio 因 daemon 不可用或 response contract 无效而回退到静态 snapshot 时，UI 应该让这个数据来源可见。

Daemon 应该负责 pairing 和 local session issuance。用户完成 daemon 生成的一次性 pairing flow 后，Studio 得到 opaque local token。非 pairing APIs 必须要求该 token，streaming APIs 必须先认证再发送事件，token records 必须可撤销。这样既保持 no-login 模型，又不会把任意网页当成可信 daemon client。

## 3. 职责

### Project Registry

Daemon 管理本地已知项目：

- 当前项目
- 最近打开的项目
- 项目展示名
- 项目根路径
- 某个路径是否像一个 Harness project

这是本地用户偏好状态，不是 Harness project meaning。

### Harness Indexer

Daemon 读取 Harness-owned project files，并构建结构化 project snapshot：

- modules
- promises
- ownership links
- coverage paths
- promise lifecycle 与 review metadata
- 可用的 evidence references
- graph-friendly nodes 和 edges projection

Indexer 应该优先复用 `harness-core` 使用的 protocol validation path。

### Graph Snapshot API

Harness Studio 需要一个稳定 read model，用来替换前端静态 snapshot。

Graph snapshot 应该是 projection，不是独立 authoring model。它可以包含 UI-friendly fields，比如 labels、badges、grouping 和 relationships，但这些字段必须从 modules、promises 和 evidence 推导出来。

### File Watcher

Daemon 监听 Harness-owned project paths，并在文件变化时发出 project refresh events。

Watcher 不应该修改项目文件。它应该 debounce changes、重新索引项目、计算新的 snapshot，并把 refresh event stream 给 Studio。

### Runner API

Daemon 可以运行 Harness checks 和配置好的测试命令。

Runner execution 有副作用，所以必须放在显式 API 后面，并支持 process tracking、cancellation、logs 和 result collection。Runner output 应该转换成显式 run evidence 和 normalized events。

### Result Store

Daemon 可以保存 run history 和 latest run summaries，但 store 不能替代 canonical promise files。

有用的 stored data 包括：

- run id
- command
- start 和 finish time
- status
- adapter result file paths
- promise status summary
- failure evidence summary

如果每条记录都能指回显式文件或 command output，SQLite 可以用于 operational history。第一版也可以使用 file-backed store，只要 recovery model 足够简单。

### Event Stream

Daemon 向 Harness Studio stream normalized local runtime events。

事件族示例：

- `project.changed`
- `project.indexed`
- `snapshot.updated`
- `file.changed`
- `run.started`
- `run.output`
- `run.finished`
- `agent.session.started`
- `agent.turn.started`
- `agent.permission.requested`

Event schema 应该尽早 versioned，因为 Harness Studio 和未来 Agent Bridge 都会依赖它。

### Agent Bridge

Daemon 未来通过 provider abstraction 管理本地 coding agent sessions。

ACP 应该只是一个 provider，而不是 daemon 的唯一内部协议：

- `AcpProvider`
- `CodexProvider`
- `ClaudeProvider`
- `OpenCodeProvider`

Studio 应该消费 daemon-level agent events 和 permission requests，而不是理解 provider-specific protocols。

### Permission And Safety

Daemon 负责本地副作用边界：

- file writes
- command execution
- process spawning
- agent tool approvals
- diff presentation
- project root restrictions

Agent writes 不能绕过 Harness review model。任何修改 module 或 promise meaning 的写入，都应该产生显式、可 review 的变更。

## 4. 非目标

Daemon 不应该：

- 把 canonical module 或 promise meaning 藏进数据库
- 替代 `harness-core`
- 为本地 Studio 使用强制要求账号登录或 hosted relay
- 让核心编排直接耦合 Claude、Codex、ACP 或 OpenCode
- 保存过重 UI state，比如 selected nodes 或 panel expansion
- 默认允许无限制的 command execution 或 file writes
- 让 Harness Studio 变成 graph 旁边贴一个通用 chat UI

## 5. 实现阶段

### Phase 1a: Read-Only Project Groundwork

先构建稳定 read path：

- project registry
- project root validation
- Harness file discovery
- module 和 promise loading
- protocol validation
- graph snapshot API

这个阶段应该用真实 project data 替换前端静态 snapshot。

### Phase 1b: Watch And Stream

增加增量 runtime awareness：

- file watcher
- debounce 和 re-index
- snapshot diff 或 snapshot replacement events
- SSE 或 NDJSON event stream
- Studio refresh integration

这个阶段应该让 Harness Studio 无需 reload 就能反映文件变化。

### Phase 1c: Runner

增加显式副作用执行：

- runner API
- command configuration
- process lifecycle tracking
- cancellation
- logs
- result collection
- latest run summary

Runner 是第一块会执行用户命令的能力，所以应该可以独立测试。

### Phase 2: Agent Bridge

等 event schema、permission model 和 project snapshot model 稳定后，再接入本地 coding agents：

- `AgentProvider` trait
- provider lifecycle
- session 和 turn events
- permission request events
- provider-specific adapters
- reviewable write integration

Agent Bridge 刻意后置，因为它同时涉及 process execution、file writes、permission prompts 和 long-lived sessions。

## 6. Rust 模块形态

先保持清晰 module boundary。等 trait 稳定后再拆 crate。

建议形态：

- `harness-core`: protocol models、schema validation、pure transformations
- `harness-store`: project file loading、result store traits、file-backed 或 SQLite implementations
- `harness-runner`: runner traits、process execution、result collection
- `harness-agent`: `AgentProvider` trait 和 provider implementations
- `harness-daemon`: runtime orchestration、state machine、event bus
- `harness-api`: Axum routes、SSE 或 NDJSON streaming、request and response types

如果多 crate 在早期拖慢开发，第一版 Rust implementation 可以先放在一个 crate 里，用这些 internal modules：

- `api`
- `events`
- `projects`
- `indexer`
- `watch`
- `runner`
- `results`
- `agents`
- `safety`

最重要的是 dependency direction：

```text
api -> daemon orchestration -> store / runner / agent
store / runner / agent -> core
core -> no daemon, no api, no process IO
```

## 7. 最终架构

```text
Harness Studio
  -> local loopback Harness API
    -> Pairing And Session Guard
      -> Daemon Orchestrator
        -> Project Registry
        -> Harness Indexer
        -> File Watcher
        -> Runner
        -> Result Store
        -> Agent Bridge
        -> Event Bus
          -> SSE / NDJSON stream
```

Studio 中所有可见行为都应该能由这些来源解释：

- canonical Harness files
- explicit run evidence
- local runtime events
- recent projects 等本地用户偏好

这样 daemon 才能既足够强，可以支撑 vibe coding，又不会破坏 Harness 的 promise model。
