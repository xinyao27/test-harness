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

## Spec Coverage

这个 example 把官方 Todo-Backend JavaScript spec 作为第一阶段覆盖基准：

```text
https://github.com/TodoBackend/todo-backend-js-spec/blob/master/js/specs.js
```

traceability map 位于：

```text
examples/todo-backend/spec-map.yaml
```

运行 coverage check：

```bash
pnpm example:todo-spec-map:check
```

这个检查会确认每条官方 spec case 都被列出、每条 case 都映射到至少一个 Harness promise，并且每个被映射的 promise id 都真实存在于 example promise files 中。

## Harness Feature Coverage

Todo-Backend showcase 也用于覆盖完整 TestHarness feature set。feature map 位于：

```text
examples/todo-backend/harness-feature-map.yaml
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
