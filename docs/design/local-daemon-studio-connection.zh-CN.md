# Local Daemon Studio Connection

> 状态：拟议设计方向
> 目标：让 Harness Studio 不依赖账号登录、hosted relay 或中心化 daemon auth，就能连接本地 daemon。

## 1. 决策

使用去中心化的本地 capability 模型。

Harness Studio 可以部署在 Web 上，也可以本地打包，但 daemon 保持本地。Daemon 是 project access、run execution、file watching 和未来 agent sessions 的本地权限主体。使用本地 daemon 不应该要求 hosted service。

默认形态是：

```text
Harness Studio
  -> browser request to loopback
    -> local Harness Daemon
      -> local projects, runners, files, and agents
```

不需要登录。不需要 daemon 连接中心 server。Studio 和 daemon 之间不需要 server relay。

## 2. Pairing Model

Pairing credentials 应该由 daemon 生成。

推荐流程：

1. Daemon 在 loopback 上启动，并暴露 health endpoint 和 pairing endpoint。
2. Studio 发现 daemon，并检测到没有有效 local session。
3. 用户从 Studio settings 或 project controls 发起 pairing。
4. Daemon 生成短期有效的一次性 code。
5. 用户在本地 pairing flow 中确认 code。
6. Daemon 返回一个 opaque local session token。
7. Studio 在本地保存 token，并在后续 daemon requests 中发送它。

Daemon 只保存 token hash 和 operational metadata：

- client label
- allowed origins
- allowed project roots
- issued time
- expiry time
- revocation state

这样可以保持 Studio 简单。Studio 不为 daemon 生成权限；它只是证明用户完成了 daemon-owned pairing flow。

## 3. Local API Security

Daemon 是本地基础设施，不是公共基础设施。

默认安全规则：

- 默认绑定 loopback。
- 除非用户显式启用，否则拒绝非本机网络访问。
- CORS 只允许精确配置的 Studio origins。
- 绝不使用 wildcard browser origins。
- 支持部署版 Studio origin 所需的 browser private-network preflight 行为。
- 除 pairing endpoints 外，所有 endpoints 都要求有效 local session token。
- Streaming connections 必须先认证，再发送 project、run 或 agent events。
- 避免把长期 token 放进 query string。
- 不依赖 cookies 做 daemon auth。

Daemon 可以暴露很小的 unauthenticated surface，用于 health 和 pairing state，但这部分不能泄露 project structure、absolute file paths、run logs、agent data 或 user secrets。

## 4. Project Scope

Daemon 负责本地 project registry。

Project entries 是本地偏好和权限状态，不是 canonical Harness meaning。只有 root 已经被 daemon 批准的 project 才能被读取。

添加 project 应该要求明确的本地用户意图，例如从 Studio 选择目录，或批准 daemon-side request。批准后，daemon 可以索引：

- `tests/modules/`
- `tests/promises/`
- `tests/harness.yaml`
- explicit run evidence files

Daemon 不能让 Studio request 逃逸出已批准的 project root。

## 5. Studio UX

Harness Studio 应该把 daemon connection 展示成本地 capability，而不是账号身份。

Studio 应该展示这些状态：

- disconnected
- pairing required
- pairing in progress
- connected
- invalid or expired session
- daemon unavailable

Settings 应该用 shadcn/ui controls 展示：

- connection status
- pairing
- reconnect
- revoke local token
- clear local daemon state

连接 daemon 后，Project switching 应该使用认证后的 daemon project registry。如果 daemon 不可用，Studio 可以回退到 static read-only snapshots，但 UI 必须让数据来源可见。

Studio 不应该把账号登录作为使用本地 daemon 功能的要求。

## 6. Event And Command Channel

Snapshots 可以先用普通 authenticated HTTP requests。

Runtime changes 应该使用 versioned stream。一开始 SSE 足够承载 daemon 到 Studio 的单向事件。等 bidirectional runtime control 需要单条 long-lived channel 时，再引入 NDJSON over HTTP 或 WebSocket。

最早认证后的 event families 应该是：

- `project.indexed`
- `snapshot.updated`
- `file.changed`
- `run.started`
- `run.output`
- `run.finished`

等 project snapshots、project switching 和 runner actions 稳定后，再加入 agent event families。

## 7. 非目标

这个设计不包含：

- account login
- team permissions
- cloud sync
- remote mobile control
- hosted daemon relay
- central task queue
- 默认公开 daemon listener

这些以后可以成为独立产品线。它们不应该复杂化 local-first Studio plus daemon 这条路径。

## 8. Implementation Sequence

1. 编写并 review daemon connection promises。
2. 增加 daemon health、pairing state 和 token issuance。
3. 用 local token 保护 snapshot 和 project registry APIs。
4. 让 Studio settings 展示真实 daemon connection state。
5. 用 daemon-backed project registry data 替换 visual-only project switching。
6. 增加 authenticated event streaming。
7. 增加 runner APIs。
8. 增加 agent provider sessions 和 permission events。
