# Todo-Backend 示例

这个 example 使用经典 TodoMVC React UI，作为 Todo-Backend-compatible API 的真实客户端。

客户端源码已经 vendored 到仓库里，并重构成一个小型 Vite app。它不会保留原 TodoMVC 的 webpack、ESLint、生成的 `dist/` 或 lockfile 设置。

## Client

```bash
pnpm example:todo-client
```

客户端运行在：

```text
http://127.0.0.1:3100/
```

客户端从 `VITE_TODO_BACKEND_URL` 读取 todos，默认地址是：

```text
http://127.0.0.1:3101/todos
```

在这个 URL 启动一个 Todo-Backend-compatible server，然后打开命令打印出的 Vite URL。

## Backends

单独运行 TypeScript implementation：

```bash
pnpm example:todo:serve:typescript
```

它会在这个地址提供 Todo-Backend API：

```text
http://127.0.0.1:3101/todos
```

运行它的 native Vitest coverage：

```bash
pnpm example:todo:test:typescript:native
```

单独运行 Rust Axum implementation：

```bash
pnpm example:todo:serve:rust
```

它会在这个地址提供同一套 API：

```text
http://127.0.0.1:3102/todos
```

## Harness Run

运行完整 showcase：TypeScript contract/native tests、Rust contract/native tests、同一个 TodoMVC client 分别连接两个 backend 的 browser E2E，以及 report、matrix、spec coverage、feature coverage 的 showcase 自检。命令会收集 adapter events、写入 `matrix.yaml`、合并到 `.harness/results.yaml`，并渲染 Harness summary：

```bash
pnpm example:todo:test
```

开发迭代时也可以只跑某个切片：

```bash
pnpm example:todo:test:typescript
pnpm example:todo:test:rust
pnpm example:todo:test:browser:typescript
pnpm example:todo:test:browser:rust
pnpm example:todo:matrix
```

showcase 自检会在完整的 `pnpm example:todo:test` 命令里运行，因为它们验证的是当前 active run 的 adapter events。

渲染最近一次 Todo-Backend Harness report：

```bash
pnpm example:todo:report
pnpm example:todo:report:full
```

summary report 更紧凑；full report 会包含 Given/When/Then、evidence references，以及本地化后的 promise text。

## Spec Coverage

这个 example 把官方 Todo-Backend JavaScript spec 作为第一阶段覆盖基准：

```text
https://github.com/TodoBackend/todo-backend-js-spec/blob/master/js/specs.js
```

traceability map 位于：

```text
examples/todo-backend/tests/spec-map.yaml
```

运行 coverage check：

```bash
pnpm example:todo-spec-map:check
```

这个检查会确认每条官方 spec case 都被列出、每条 case 都映射到至少一个 Harness promise，并且每个被映射的 promise id 都真实存在于 example promise files 中。

## Harness Feature Coverage

Todo-Backend showcase 也用于覆盖完整 TestHarness feature set。feature map 位于：

```text
examples/todo-backend/tests/harness-feature-map.yaml
```

运行两个 coverage checks：

```bash
pnpm example:todo:check
```

这个检查会确认每个 canonical Harness module，以及这些 modules 拥有的每个 promise，都在 Todo-Backend showcase 中拥有明确应用路径。

## Attribution

UI 基于 TasteJS TodoMVC 的 React example：

```text
https://github.com/tastejs/todomvc/tree/master/examples/react
```

源码已经被重构成 Vite app，并从本地 reducer state 改成 Todo-Backend HTTP API client。
