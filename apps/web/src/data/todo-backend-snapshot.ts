// oxlint-disable unicorn/no-thenable
// Generated from examples/todo-backend/tests/** and examples/todo-backend/.harness/results.yaml.

import type { HarnessSnapshot } from "@/data/harness-snapshot";

export const todoBackendSnapshot: HarnessSnapshot = {
  project: {
    name: {
      en: "Todo-Backend Example",
      "zh-CN": "Todo-Backend Example",
    },
    description: {
      en: "A real TodoMVC client plus TypeScript Hono and Rust Axum Todo-Backend implementations, mapped through Harness promises.",
      "zh-CN":
        "真实 TodoMVC client，加上 TypeScript Hono 与 Rust Axum Todo-Backend implementations，并通过 Harness promises 建模。",
    },
    promiseCount: 20,
    moduleCount: 5,
    warningCount: 0,
    errorCount: 0,
  },
  modules: [
    {
      id: "todo-backend-api-contract",
      title: {
        en: "Todo-Backend API Contract",
        "zh-CN": "Todo-Backend API Contract",
      },
      summary: {
        en: "The official Todo-Backend HTTP behavior, plus the spec-to-promise coverage map that defines what 100% means for this example.",
        "zh-CN":
          "官方 Todo-Backend HTTP 行为，以及定义本 example 中“100% 覆盖”含义的 spec-to-promise coverage map。",
      },
      purpose: {
        en: "This module lets reviewers inspect the API promises without reading the TypeScript or Rust implementations.",
        "zh-CN":
          "这个 module 让 reviewer 不读 TypeScript 或 Rust implementation，也能检查 API promises。",
      },
      priority: "P0",
      promiseIds: [
        "todo_backend.api.create_returns_persisted_todo",
        "todo_backend.api.todo_urls_are_dereferenceable",
        "todo_backend.api.list_returns_current_collection",
        "todo_backend.api.update_changes_title_and_completed",
        "todo_backend.api.order_is_preserved_and_updateable",
        "todo_backend.api.delete_one_removes_only_that_todo",
        "todo_backend.api.delete_all_clears_collection",
        "todo_backend.api.cors_allows_todomvc_client",
        "todo_backend.spec.official_spec_map_is_complete",
      ],
      covers: [
        "examples/todo-backend/tests/spec-map.yaml",
        "examples/todo-backend/contract-tests/**",
        "examples/todo-backend/tests/promises/contract.promises.yaml",
      ],
      relatedModuleIds: [
        "todo-backend-client",
        "todo-backend-typescript-hono",
        "todo-backend-rust-axum",
        "todo-backend-showcase",
      ],
    },
    {
      id: "todo-backend-client",
      title: {
        en: "TodoMVC Client",
        "zh-CN": "TodoMVC Client",
      },
      summary: {
        en: "The Vite React TodoMVC client that exercises a real Todo-Backend HTTP API instead of local-only reducer state.",
        "zh-CN":
          "Vite React TodoMVC client，它使用真实 Todo-Backend HTTP API，而不是只使用本地 reducer state。",
      },
      purpose: {
        en: "This module keeps the demo honest by ensuring a human can use the same backend behavior the Harness tests prove.",
        "zh-CN":
          "这个 module 让 demo 保持真实：用户可以使用 Harness tests 所证明的同一套 backend 行为。",
      },
      priority: "P1",
      promiseIds: ["todo_backend.client.uses_real_backend_api"],
      covers: ["examples/todo-backend/client/todomvc-react/**"],
      relatedModuleIds: [
        "todo-backend-api-contract",
        "todo-backend-typescript-hono",
        "todo-backend-rust-axum",
      ],
    },
    {
      id: "todo-backend-rust-axum",
      title: {
        en: "Rust Axum Implementation",
        "zh-CN": "Rust Axum Implementation",
      },
      summary: {
        en: "A real Rust backend implementation and native Cargo tests that prove the shared Todo-Backend promises through the Rust adapter.",
        "zh-CN":
          "一个真实 Rust backend implementation，以及通过 Rust adapter 证明共享 Todo-Backend promises 的 native Cargo tests。",
      },
      purpose: {
        en: "This module demonstrates that Harness promises are not tied to TypeScript or Vitest.",
        "zh-CN": "这个 module 证明 Harness promises 不绑定 TypeScript 或 Vitest。",
      },
      priority: "P1",
      promiseIds: [
        "todo_backend.rust_axum.server_implements_contract",
        "todo_backend.rust_axum.native_tests_are_promise_bound",
      ],
      covers: ["examples/todo-backend/implementations/rust-axum/**"],
      relatedModuleIds: ["todo-backend-api-contract", "todo-backend-showcase"],
    },
    {
      id: "todo-backend-showcase",
      title: {
        en: "Harness Showcase",
        "zh-CN": "Harness Showcase",
      },
      summary: {
        en: "The public-facing Todo-Backend demo layer that maps every Harness capability, runs the complete workflow, and renders readable reports.",
        "zh-CN":
          "面向公开展示的 Todo-Backend demo 层，负责映射每个 Harness 能力、运行完整 workflow，并渲染可读 reports。",
      },
      purpose: {
        en: "This module turns the example from a sample app into a product demonstration of the Harness.",
        "zh-CN": "这个 module 把 example 从样例 app 变成 Harness 的产品级展示。",
      },
      priority: "P0",
      promiseIds: [
        "todo_backend.report.matrix_compares_implementations_by_promise",
        "todo_backend.showcase.feature_map_covers_harness_capabilities",
        "todo_backend.showcase.one_command_runs_full_demo",
        "todo_backend.showcase.cross_language_adapters_merge_evidence",
        "todo_backend.showcase.cli_reports_bilingual_promise_status",
        "todo_backend.showcase.validation_guards_promise_and_module_coverage",
      ],
      covers: [
        "examples/todo-backend/tests/harness-feature-map.yaml",
        "examples/todo-backend/tools/**",
        "examples/todo-backend/README.md",
        "examples/todo-backend/README.zh-CN.md",
      ],
      relatedModuleIds: [
        "todo-backend-api-contract",
        "todo-backend-client",
        "todo-backend-typescript-hono",
        "todo-backend-rust-axum",
      ],
    },
    {
      id: "todo-backend-typescript-hono",
      title: {
        en: "TypeScript Hono Implementation",
        "zh-CN": "TypeScript Hono Implementation",
      },
      summary: {
        en: "A real TypeScript backend implementation and native Vitest tests that prove the shared Todo-Backend promises through the Vitest adapter.",
        "zh-CN":
          "一个真实 TypeScript backend implementation，以及通过 Vitest adapter 证明共享 Todo-Backend promises 的 native Vitest tests。",
      },
      purpose: {
        en: "This module demonstrates the reference TypeScript adapter path while keeping core promise meaning in shared YAML.",
        "zh-CN":
          "这个 module 展示参考 TypeScript adapter 路径，同时把核心 promise meaning 保持在共享 YAML 中。",
      },
      priority: "P1",
      promiseIds: [
        "todo_backend.typescript_hono.server_implements_contract",
        "todo_backend.typescript_hono.native_tests_are_promise_bound",
      ],
      covers: ["examples/todo-backend/implementations/typescript-hono/**"],
      relatedModuleIds: ["todo-backend-api-contract", "todo-backend-showcase"],
    },
  ],
  promises: [
    {
      id: "todo_backend.api.create_returns_persisted_todo",
      moduleId: "todo-backend-api-contract",
      feature: "Todo-Backend / API Contract",
      title: {
        en: "Creating a todo returns the persisted todo",
        "zh-CN": "创建 todo 会返回已持久化的 todo",
      },
      purpose: {
        en: "Protect the baseline Todo-Backend behavior that lets any client add a todo and immediately receive the server-owned identity and URL.",
        "zh-CN":
          "保护 Todo-Backend 的基础行为，让任意 client 可以新增 todo，并立即拿到服务端拥有的 identity 和 URL。",
      },
      priority: "P0",
      boundary: "integration",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "A Todo-Backend-compatible server is running",
          "zh-CN": "一个兼容 Todo-Backend 的 server 正在运行",
        },
        {
          en: "The todo collection is empty",
          "zh-CN": "todo collection 是空的",
        },
      ],
      when: [
        {
          en: "The contract test creates a todo with a title",
          "zh-CN": "contract test 用一个 title 创建 todo",
        },
      ],
      then: [
        {
          en: "The response status is successful",
          "zh-CN": "response status 成功",
        },
        {
          en: "The returned todo includes title, completed, order, and a stable URL",
          "zh-CN": "返回的 todo 包含 title、completed、order 和稳定 URL",
        },
        {
          en: "A newly-created todo is initially not completed unless the request says otherwise",
          "zh-CN": "新创建的 todo 默认不是 completed，除非 request 明确指定其它值",
        },
        {
          en: "A later list request includes the same todo",
          "zh-CN": "之后的 list request 会包含同一个 todo",
        },
      ],
      observes: [
        "examples/todo-backend/contract-tests/**",
        "examples/todo-backend/implementations/*/**",
      ],
      failureMeaning: {
        en: "The TodoMVC client can appear to add an item but cannot trust that the server persisted it.",
        "zh-CN": "TodoMVC client 可能看起来添加了条目，但无法信任 server 已经持久化它。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.api.todo_urls_are_dereferenceable",
      moduleId: "todo-backend-api-contract",
      feature: "Todo-Backend / API Contract",
      title: {
        en: "Todo URLs can be fetched as individual todos",
        "zh-CN": "Todo URL 可以作为单个 todo 读取",
      },
      purpose: {
        en: "Protect the Todo-Backend hypermedia contract where each todo carries a server-owned URL that clients and tests can follow.",
        "zh-CN":
          "保护 Todo-Backend 的 hypermedia contract：每个 todo 都带有 client 和 test 可以继续访问的服务端 URL。",
      },
      priority: "P0",
      boundary: "integration",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "A Todo-Backend-compatible server has one or more todos",
          "zh-CN": "兼容 Todo-Backend 的 server 上存在一个或多个 todos",
        },
      ],
      when: [
        {
          en: "The contract test follows a todo's URL from a create or list response",
          "zh-CN": "contract test 访问 create 或 list response 中某个 todo 的 URL",
        },
      ],
      then: [
        {
          en: "The URL responds successfully with that individual todo",
          "zh-CN": "该 URL 成功返回对应的单个 todo",
        },
        {
          en: "The fetched todo includes the same title, completed, order, and URL values that define the current server state",
          "zh-CN": "读取到的 todo 包含与当前 server 状态一致的 title、completed、order 和 URL 值",
        },
      ],
      observes: [
        "examples/todo-backend/contract-tests/**",
        "examples/todo-backend/client/todomvc-react/src/api.js",
      ],
      failureMeaning: {
        en: "Clients could receive todo URLs that cannot be used to inspect or verify the individual resource they identify.",
        "zh-CN": "Client 可能拿到无法继续读取或验证对应资源的 todo URL。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.api.list_returns_current_collection",
      moduleId: "todo-backend-api-contract",
      feature: "Todo-Backend / API Contract",
      title: {
        en: "Listing todos returns the current collection",
        "zh-CN": "查询 todos 会返回当前 collection",
      },
      purpose: {
        en: "Protect the read path shared by the TodoMVC client, contract tests, and every language implementation.",
        "zh-CN": "保护 TodoMVC client、contract tests 和每种语言实现共享的读取路径。",
      },
      priority: "P0",
      boundary: "integration",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "A Todo-Backend-compatible server has existing todos",
          "zh-CN": "一个兼容 Todo-Backend 的 server 已有 todos",
        },
      ],
      when: [
        {
          en: "The contract test requests the todo collection",
          "zh-CN": "contract test 请求 todo collection",
        },
      ],
      then: [
        {
          en: "The response is an array of todos",
          "zh-CN": "response 是 todo 数组",
        },
        {
          en: "Each todo includes title, completed, order, and URL fields",
          "zh-CN": "每个 todo 都包含 title、completed、order 和 URL 字段",
        },
        {
          en: "The collection reflects todos created, updated, and deleted earlier in the same run",
          "zh-CN": "collection 会反映同一轮运行中之前创建、更新和删除的 todos",
        },
      ],
      observes: [
        "examples/todo-backend/contract-tests/**",
        "examples/todo-backend/client/todomvc-react/src/api.js",
      ],
      failureMeaning: {
        en: "Users cannot trust the visible TodoMVC list to represent the backend state.",
        "zh-CN": "用户无法信任 TodoMVC 可见列表代表了后端状态。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.api.update_changes_title_and_completed",
      moduleId: "todo-backend-api-contract",
      feature: "Todo-Backend / API Contract",
      title: {
        en: "Updating a todo changes its title and completed state",
        "zh-CN": "更新 todo 会改变 title 和 completed 状态",
      },
      purpose: {
        en: "Protect the editing and completion workflows that make the TodoMVC app more than an append-only list.",
        "zh-CN": "保护编辑和完成状态工作流，让 TodoMVC app 不只是一个只能追加的列表。",
      },
      priority: "P0",
      boundary: "integration",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "A todo exists on a Todo-Backend-compatible server",
          "zh-CN": "兼容 Todo-Backend 的 server 上存在一个 todo",
        },
      ],
      when: [
        {
          en: "The contract test updates that todo's title and completed state",
          "zh-CN": "contract test 更新该 todo 的 title 和 completed 状态",
        },
      ],
      then: [
        {
          en: "The response contains the changed title and completed state",
          "zh-CN": "response 包含变更后的 title 和 completed 状态",
        },
        {
          en: "Refetching the todo by URL returns the changed values",
          "zh-CN": "通过 URL 重新读取该 todo 会返回变更后的值",
        },
        {
          en: "A later list request returns the changed values",
          "zh-CN": "之后的 list request 返回变更后的值",
        },
      ],
      observes: [
        "examples/todo-backend/contract-tests/**",
        "examples/todo-backend/client/todomvc-react/src/todo/App.jsx",
      ],
      failureMeaning: {
        en: "The UI can show edits or completion toggles that are lost when the list reloads.",
        "zh-CN": "UI 可能展示编辑或完成切换，但列表重新加载后这些变更会丢失。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.api.order_is_preserved_and_updateable",
      moduleId: "todo-backend-api-contract",
      feature: "Todo-Backend / API Contract",
      title: {
        en: "Todo order can be created, changed, and refetched",
        "zh-CN": "Todo order 可以创建、修改并重新读取",
      },
      purpose: {
        en: "Protect the official Todo-Backend ordering behavior so implementations preserve user-visible ordering metadata instead of dropping it.",
        "zh-CN":
          "保护官方 Todo-Backend 的排序行为，确保各实现保留用户可见的 order metadata，而不是悄悄丢弃它。",
      },
      priority: "P0",
      boundary: "integration",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "A Todo-Backend-compatible server is running",
          "zh-CN": "一个兼容 Todo-Backend 的 server 正在运行",
        },
      ],
      when: [
        {
          en: "The contract test creates a todo with an order value and later patches that order value through the todo URL",
          "zh-CN": "contract test 创建带 order 值的 todo，并随后通过 todo URL PATCH 该 order 值",
        },
      ],
      then: [
        {
          en: "The create response includes the requested order value",
          "zh-CN": "create response 包含 request 中指定的 order 值",
        },
        {
          en: "The patch response includes the changed order value",
          "zh-CN": "patch response 包含修改后的 order 值",
        },
        {
          en: "Refetching the todo by URL returns the changed order value",
          "zh-CN": "通过 URL 重新读取该 todo 会返回修改后的 order 值",
        },
      ],
      observes: [
        "examples/todo-backend/contract-tests/**",
        "examples/todo-backend/implementations/*/**",
      ],
      failureMeaning: {
        en: "A backend could pass basic create and update flows while silently losing ordering data that Todo-Backend clients expect.",
        "zh-CN":
          "Backend 可能通过基础 create/update 流程，但悄悄丢失 Todo-Backend client 期望的 order 数据。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.api.delete_one_removes_only_that_todo",
      moduleId: "todo-backend-api-contract",
      feature: "Todo-Backend / API Contract",
      title: {
        en: "Deleting one todo removes only that todo",
        "zh-CN": "删除一个 todo 只会移除该 todo",
      },
      purpose: {
        en: "Protect destructive operations so a user can delete one item without losing unrelated todos.",
        "zh-CN": "保护破坏性操作，让用户可以删除一个条目而不会丢失无关 todos。",
      },
      priority: "P0",
      boundary: "integration",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "Multiple todos exist on a Todo-Backend-compatible server",
          "zh-CN": "兼容 Todo-Backend 的 server 上存在多个 todos",
        },
      ],
      when: [
        {
          en: "The contract test deletes one todo by its URL",
          "zh-CN": "contract test 通过 URL 删除一个 todo",
        },
      ],
      then: [
        {
          en: "The deleted todo no longer appears in later list responses",
          "zh-CN": "被删除的 todo 不再出现在之后的 list responses 中",
        },
        {
          en: "Other todos remain present and unchanged",
          "zh-CN": "其它 todos 仍然存在且未被改变",
        },
      ],
      observes: [
        "examples/todo-backend/contract-tests/**",
        "examples/todo-backend/client/todomvc-react/src/todo/App.jsx",
      ],
      failureMeaning: {
        en: "A user action intended to remove one item may either do nothing or remove too much data.",
        "zh-CN": "用户原本只想删除一个条目，但操作可能无效或删除过多数据。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.api.delete_all_clears_collection",
      moduleId: "todo-backend-api-contract",
      feature: "Todo-Backend / API Contract",
      title: {
        en: "Deleting the collection clears all todos",
        "zh-CN": "删除 collection 会清空全部 todos",
      },
      purpose: {
        en: "Protect the Todo-Backend reset behavior used by contract tests and by the example client when switching implementations.",
        "zh-CN":
          "保护 Todo-Backend 的重置行为；contract tests 和 example client 切换实现时都会用到它。",
      },
      priority: "P0",
      boundary: "integration",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "A Todo-Backend-compatible server has one or more todos",
          "zh-CN": "兼容 Todo-Backend 的 server 上有一个或多个 todos",
        },
      ],
      when: [
        {
          en: "The contract test deletes the collection endpoint",
          "zh-CN": "contract test 删除 collection endpoint",
        },
      ],
      then: [
        {
          en: "A later list request returns an empty array",
          "zh-CN": "之后的 list request 返回空数组",
        },
      ],
      observes: [
        "examples/todo-backend/contract-tests/**",
        "examples/todo-backend/client/todomvc-react/src/api.js",
      ],
      failureMeaning: {
        en: "Test runs and manual demos cannot return the backend to a known empty state.",
        "zh-CN": "测试运行和手动 demo 无法把 backend 恢复到已知空状态。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.api.cors_allows_todomvc_client",
      moduleId: "todo-backend-api-contract",
      feature: "Todo-Backend / Browser Compatibility",
      title: {
        en: "CORS allows the TodoMVC client to use the backend",
        "zh-CN": "CORS 允许 TodoMVC client 使用 backend",
      },
      purpose: {
        en: "Protect the real browser demo where the Vite TodoMVC client and backend run on different local ports.",
        "zh-CN": "保护真实浏览器 demo：Vite TodoMVC client 和 backend 会运行在不同本地端口。",
      },
      priority: "P0",
      boundary: "browser",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "The TodoMVC React client runs at http://127.0.0.1:3100",
          "zh-CN": "TodoMVC React client 运行在 http://127.0.0.1:3100",
        },
        {
          en: "A Todo-Backend-compatible server runs on a separate local port",
          "zh-CN": "兼容 Todo-Backend 的 server 运行在另一个本地端口",
        },
      ],
      when: [
        {
          en: "The browser client sends API requests to the backend",
          "zh-CN": "browser client 向 backend 发送 API requests",
        },
      ],
      then: [
        {
          en: "The backend responds with CORS headers that allow the client origin",
          "zh-CN": "backend 返回允许 client origin 的 CORS headers",
        },
        {
          en: "The client can create, list, update, and delete todos without browser CORS failures",
          "zh-CN": "client 可以创建、查询、更新和删除 todos，不会遇到浏览器 CORS failures",
        },
      ],
      observes: [
        "examples/todo-backend/client/todomvc-react/**",
        "examples/todo-backend/contract-tests/**",
        "examples/todo-backend/implementations/*/**",
      ],
      failureMeaning: {
        en: "The backend may pass non-browser HTTP tests while the real TodoMVC app cannot use it.",
        "zh-CN": "backend 可能通过非浏览器 HTTP tests，但真实 TodoMVC app 无法使用它。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.client.uses_real_backend_api",
      moduleId: "todo-backend-client",
      feature: "Todo-Backend / TodoMVC Client",
      title: {
        en: "The TodoMVC client uses the real backend API",
        "zh-CN": "TodoMVC client 使用真实 backend API",
      },
      purpose: {
        en: "Protect the example from becoming a mock demo; manual UI actions and Harness tests must exercise the same backend contract.",
        "zh-CN":
          "防止 example 退化成 mock demo；手动 UI 操作和 Harness tests 必须运行同一套 backend contract。",
      },
      priority: "P0",
      boundary: "browser",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "The Vite TodoMVC React client is open in a browser",
          "zh-CN": "Vite TodoMVC React client 已经在浏览器中打开",
        },
        {
          en: "A backend URL is configured through VITE_TODO_BACKEND_URL or the default local URL",
          "zh-CN": "backend URL 通过 VITE_TODO_BACKEND_URL 或默认本地 URL 配置",
        },
      ],
      when: [
        {
          en: "A user creates, completes, edits, or deletes a todo in the UI",
          "zh-CN": "用户在 UI 中创建、完成、编辑或删除 todo",
        },
      ],
      then: [
        {
          en: "The client sends the corresponding Todo-Backend HTTP request",
          "zh-CN": "client 会发送对应的 Todo-Backend HTTP request",
        },
        {
          en: "Reloading the client reflects backend state instead of local-only reducer state",
          "zh-CN": "重新加载 client 会反映 backend 状态，而不是本地 reducer 状态",
        },
      ],
      observes: [
        "examples/todo-backend/client/todomvc-react/src/api.js",
        "examples/todo-backend/client/todomvc-react/src/todo/App.jsx",
      ],
      failureMeaning: {
        en: "Users could interact with a polished TodoMVC UI while the backend implementations and Harness promises remain unproven.",
        "zh-CN":
          "用户可能操作了精致的 TodoMVC UI，但 backend implementations 和 Harness promises 并没有被证明。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.report.matrix_compares_implementations_by_promise",
      moduleId: "todo-backend-showcase",
      feature: "Todo-Backend / Harness Report",
      title: {
        en: "The matrix report compares implementations by promise",
        "zh-CN": "matrix report 按 promise 对比不同实现",
      },
      purpose: {
        en: "Protect the showcase value of the example by making behavior clarity visible, not just test execution.",
        "zh-CN": "保护这个 example 的展示价值：让行为清晰度可见，而不只是展示测试执行。",
      },
      priority: "P1",
      boundary: "e2e",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "Contract tests have run against the configured Todo-Backend implementations",
          "zh-CN": "contract tests 已经针对配置好的 Todo-Backend implementations 运行",
        },
      ],
      when: [
        {
          en: "The example renders or prints the implementation matrix",
          "zh-CN": "example 渲染或打印 implementation matrix",
        },
      ],
      then: [
        {
          en: "Each row is a canonical Todo-Backend promise",
          "zh-CN": "每一行都是一条 canonical Todo-Backend promise",
        },
        {
          en: "Each implementation column shows whether that promise is passing, failing, skipped, or unknown",
          "zh-CN":
            "每个 implementation 列都会展示该 promise 是 passing、failing、skipped 还是 unknown",
        },
      ],
      observes: [
        "examples/todo-backend/matrix.yaml",
        "examples/todo-backend/contract-tests/**",
        ".harness/results.yaml",
      ],
      failureMeaning: {
        en: "The example would still run tests, but it would not show how Harness makes the project easier to understand.",
        "zh-CN": "example 仍然能跑测试，但无法展示 Harness 如何让项目更容易理解。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.spec.official_spec_map_is_complete",
      moduleId: "todo-backend-api-contract",
      feature: "Todo-Backend / Spec Coverage",
      title: {
        en: "The official Todo-Backend spec is completely mapped to promises",
        "zh-CN": "官方 Todo-Backend spec 完整映射到 promises",
      },
      purpose: {
        en: 'Protect the meaning of "100% covered" by making every official Todo-Backend JavaScript spec case traceable to reviewed Harness promises.',
        "zh-CN":
          "保护“100% 覆盖”的含义：让官方 Todo-Backend JavaScript spec 的每个 case 都可以追溯到已 review 的 Harness promises。",
      },
      priority: "P0",
      boundary: "unit",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "The Todo-Backend example contains a spec-to-promise coverage map",
          "zh-CN": "Todo-Backend example 中存在 spec 到 promise 的 coverage map",
        },
        {
          en: "The example promise files define the canonical Todo-Backend promise ids",
          "zh-CN": "example promise files 定义了 canonical Todo-Backend promise ids",
        },
      ],
      when: [
        {
          en: "The spec-map checker validates the coverage map",
          "zh-CN": "spec-map checker 校验 coverage map",
        },
      ],
      then: [
        {
          en: "Every official spec case is listed exactly once",
          "zh-CN": "每条官方 spec case 都且只列出一次",
        },
        {
          en: "Every official spec case maps to at least one canonical promise id",
          "zh-CN": "每条官方 spec case 都映射到至少一个 canonical promise id",
        },
        {
          en: "Every mapped promise id exists in the example promise files",
          "zh-CN": "每个被映射的 promise id 都存在于 example promise files 中",
        },
      ],
      observes: [
        "examples/todo-backend/tests/spec-map.yaml",
        "examples/todo-backend/tools/check-spec-map.mjs",
        "examples/todo-backend/tests/promises/*.promises.yaml",
      ],
      failureMeaning: {
        en: "The example could claim full Todo-Backend coverage while silently missing or misbinding official behavior.",
        "zh-CN": "example 可能声称完整覆盖 Todo-Backend，但实际悄悄漏掉或错误绑定官方行为。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.rust_axum.server_implements_contract",
      moduleId: "todo-backend-rust-axum",
      feature: "Todo-Backend / Rust Axum",
      title: {
        en: "The Rust Axum backend implements the Todo-Backend contract",
        "zh-CN": "Rust Axum backend 实现 Todo-Backend contract",
      },
      purpose: {
        en: "Protect the Rust example as a real modern backend implementation that exercises the same promise model through a different language stack.",
        "zh-CN":
          "保护 Rust example，确保它是真实现代 backend implementation，并通过不同语言栈运行同一套 promise model。",
      },
      priority: "P0",
      boundary: "e2e",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "The Rust Axum implementation is started on its configured port",
          "zh-CN": "Rust Axum implementation 已在配置端口启动",
        },
      ],
      when: [
        {
          en: "The shared Todo-Backend contract tests run against it",
          "zh-CN": "共享 Todo-Backend contract tests 针对它运行",
        },
      ],
      then: [
        {
          en: "Every P0 Todo-Backend API promise has passing Harness evidence for that implementation",
          "zh-CN": "每个 P0 Todo-Backend API promise 都有该实现的 passing Harness evidence",
        },
        {
          en: "The TodoMVC client can switch from the TypeScript backend to the Rust backend by changing only the backend URL",
          "zh-CN":
            "TodoMVC client 只需改变 backend URL，就可以从 TypeScript backend 切到 Rust backend",
        },
      ],
      observes: [
        "examples/todo-backend/implementations/rust-axum/**",
        "examples/todo-backend/contract-tests/**",
        ".harness/results.yaml",
      ],
      failureMeaning: {
        en: "The example would not demonstrate that the Harness promise model survives a cross-language backend implementation.",
        "zh-CN": "example 无法证明 Harness promise model 可以跨语言 backend implementation 复用。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.rust_axum.native_tests_are_promise_bound",
      moduleId: "todo-backend-rust-axum",
      feature: "Todo-Backend / Rust Axum",
      title: {
        en: "Rust Axum native tests are bound to Todo-Backend promises",
        "zh-CN": "Rust Axum native tests 绑定到 Todo-Backend promises",
      },
      purpose: {
        en: "Protect the Rust implementation from being only black-box tested; native Cargo test evidence should still map back to the same reviewed promises.",
        "zh-CN":
          "避免 Rust implementation 只有黑盒测试；native Cargo test evidence 也应该映射回同一批已 review promises。",
      },
      priority: "P1",
      boundary: "adapter",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "The Rust Axum implementation has native Cargo tests",
          "zh-CN": "Rust Axum implementation 拥有 native Cargo tests",
        },
      ],
      when: [
        {
          en: "Those tests run through the Rust adapter",
          "zh-CN": "这些测试通过 Rust adapter 运行",
        },
      ],
      then: [
        {
          en: "Each native test emits adapter events using canonical Todo-Backend promise ids",
          "zh-CN": "每个 native test 都使用 canonical Todo-Backend promise ids 输出 adapter events",
        },
        {
          en: "The shared runtime can merge those events into the same Harness result model as the black-box contract tests",
          "zh-CN":
            "共享 runtime 可以把这些 events 合并到与黑盒 contract tests 相同的 Harness result model 中",
        },
      ],
      observes: [
        "examples/todo-backend/implementations/rust-axum/**",
        "crates/harness-adapter-rust/src/**",
        ".harness/runs/*/events/*.ndjson",
      ],
      failureMeaning: {
        en: "The example would show a working Rust server but not how native Cargo tests become Harness evidence.",
        "zh-CN":
          "example 会展示一个能工作的 Rust server，但无法展示 native Cargo tests 如何变成 Harness evidence。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.showcase.feature_map_covers_harness_capabilities",
      moduleId: "todo-backend-showcase",
      feature: "Todo-Backend / Harness Showcase",
      title: {
        en: "The Todo-Backend showcase maps every Harness capability",
        "zh-CN": "Todo-Backend showcase 映射每个 Harness 能力",
      },
      purpose: {
        en: "Protect the external demo from becoming a partial sample by requiring every canonical Harness module and promise to have an explicit Todo-Backend application path.",
        "zh-CN":
          "防止对外 demo 变成局部样例；要求每个 canonical Harness module 和 promise 都有明确的 Todo-Backend 应用路径。",
      },
      priority: "P0",
      boundary: "unit",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "The repository defines canonical Harness modules and promises",
          "zh-CN": "仓库定义了 canonical Harness modules 和 promises",
        },
        {
          en: "The Todo-Backend example defines a Harness feature map",
          "zh-CN": "Todo-Backend example 定义了 Harness feature map",
        },
      ],
      when: [
        {
          en: "The feature-map checker validates the Todo-Backend showcase",
          "zh-CN": "feature-map checker 校验 Todo-Backend showcase",
        },
      ],
      then: [
        {
          en: "Every canonical Harness module is represented exactly once",
          "zh-CN": "每个 canonical Harness module 都且只出现一次",
        },
        {
          en: "Every promise listed by those modules is represented in the matching feature entry",
          "zh-CN": "每个 module 列出的 promise 都出现在对应 feature entry 中",
        },
        {
          en: "Every showcase promise id referenced by the map exists in the Todo-Backend promise files",
          "zh-CN": "map 引用的每个 showcase promise id 都存在于 Todo-Backend promise files 中",
        },
      ],
      observes: [
        "examples/todo-backend/tests/harness-feature-map.yaml",
        "examples/todo-backend/tools/check-feature-map.mjs",
        "tests/modules/*.module.yaml",
        "tests/promises/**/*.promises.yaml",
      ],
      failureMeaning: {
        en: "The example could advertise the whole Harness while quietly omitting an important product capability.",
        "zh-CN": "example 可能宣传完整 Harness，但悄悄遗漏重要产品能力。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.showcase.one_command_runs_full_demo",
      moduleId: "todo-backend-showcase",
      feature: "Todo-Backend / Harness Showcase",
      title: {
        en: "One command runs the full Todo-Backend Harness demo",
        "zh-CN": "一条命令运行完整 Todo-Backend Harness demo",
      },
      purpose: {
        en: "Protect the demo ergonomics so users can see the complete promise-first workflow without hand-orchestrating backends, adapters, result collection, and reports.",
        "zh-CN":
          "保护 demo 的易用性，让用户无需手动编排 backend、adapter、result collection 和 report，就能看到完整 promise-first workflow。",
      },
      priority: "P0",
      boundary: "e2e",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "The TodoMVC client, TypeScript backend, Rust backend, contract tests, and Harness configuration are present",
          "zh-CN":
            "TodoMVC client、TypeScript backend、Rust backend、contract tests 和 Harness configuration 都已存在",
        },
      ],
      when: [
        {
          en: "A user runs the documented Todo-Backend showcase command",
          "zh-CN": "用户运行文档中的 Todo-Backend showcase command",
        },
      ],
      then: [
        {
          en: "The command validates promises and feature maps",
          "zh-CN": "命令会校验 promises 和 feature maps",
        },
        {
          en: "The command runs contract and native tests for the configured implementations",
          "zh-CN": "命令会为配置好的 implementations 运行 contract tests 和 native tests",
        },
        {
          en: "The command writes canonical Harness results and renders the report output",
          "zh-CN": "命令会写出 canonical Harness results 并渲染 report output",
        },
      ],
      observes: [
        "examples/todo-backend/tests/harness.yaml",
        "examples/todo-backend/tools/**",
        "examples/todo-backend/.harness/results.yaml",
      ],
      failureMeaning: {
        en: "The demo would require expert local setup and would not be credible as a public entry point.",
        "zh-CN": "demo 会要求用户具备专家级本地配置能力，无法成为可信的公开入口。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.showcase.cross_language_adapters_merge_evidence",
      moduleId: "todo-backend-showcase",
      feature: "Todo-Backend / Harness Showcase",
      title: {
        en: "Cross-language adapter evidence merges into one Harness result model",
        "zh-CN": "跨语言 adapter evidence 合并到同一个 Harness result model",
      },
      purpose: {
        en: "Protect the core marketing claim that TypeScript and Rust tests can prove the same reviewed promises through the shared protocol and adapter runtime.",
        "zh-CN":
          "保护核心宣传点：TypeScript 和 Rust tests 可以通过共享 protocol 和 adapter runtime 证明同一批已 review promises。",
      },
      priority: "P0",
      boundary: "e2e",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "The TypeScript Hono implementation emits Vitest adapter evidence",
          "zh-CN": "TypeScript Hono implementation 输出 Vitest adapter evidence",
        },
        {
          en: "The Rust Axum implementation emits Rust adapter evidence",
          "zh-CN": "Rust Axum implementation 输出 Rust adapter evidence",
        },
      ],
      when: [
        {
          en: "The shared adapter runtime collects the Todo-Backend run",
          "zh-CN": "共享 adapter runtime 收集 Todo-Backend run",
        },
      ],
      then: [
        {
          en: "Both languages contribute events using canonical Todo-Backend promise ids",
          "zh-CN": "两种语言都使用 canonical Todo-Backend promise ids 贡献 events",
        },
        {
          en: "The merged result file keeps implementation and framework evidence distinct while sharing the same promise ids",
          "zh-CN":
            "merged result file 保留 implementation 和 framework evidence 的区分，同时共享同一批 promise ids",
        },
      ],
      observes: [
        "examples/todo-backend/.harness/runs/*/events/*.ndjson",
        "examples/todo-backend/.harness/results.yaml",
        "examples/todo-backend/implementations/*/**",
      ],
      failureMeaning: {
        en: "The example would look like separate test suites instead of a language-agnostic Harness workflow.",
        "zh-CN": "example 会看起来像几套分离测试，而不是语言无关的 Harness workflow。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.showcase.cli_reports_bilingual_promise_status",
      moduleId: "todo-backend-showcase",
      feature: "Todo-Backend / Harness Showcase",
      title: {
        en: "The showcase renders bilingual promise status through the Harness CLI",
        "zh-CN": "showcase 通过 Harness CLI 渲染双语 promise status",
      },
      purpose: {
        en: "Protect the human-facing story of the demo by showing English and Chinese reviewers the same Todo-Backend promise status without reading source code.",
        "zh-CN":
          "保护 demo 面向人的叙事：英文和中文 reviewer 都可以不读源码，看到同一套 Todo-Backend promise status。",
      },
      priority: "P1",
      boundary: "e2e",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "Todo-Backend promises use LocalizedText fields",
          "zh-CN": "Todo-Backend promises 使用 LocalizedText fields",
        },
        {
          en: "Harness results have been collected for the Todo-Backend demo",
          "zh-CN": "Todo-Backend demo 的 Harness results 已经被收集",
        },
      ],
      when: [
        {
          en: "The documented report commands run in English and Chinese",
          "zh-CN": "文档中的 report commands 以英文和中文运行",
        },
      ],
      then: [
        {
          en: "The report renders promise titles, purposes, and status in the requested language",
          "zh-CN": "report 会用请求语言渲染 promise title、purpose 和 status",
        },
        {
          en: "Summary output remains compact enough for release notes, README snippets, and CI logs",
          "zh-CN": "summary output 足够紧凑，可用于 release notes、README snippets 和 CI logs",
        },
      ],
      observes: [
        "examples/todo-backend/tests/promises/*.promises.yaml",
        "examples/todo-backend/README.md",
        "examples/todo-backend/README.zh-CN.md",
        "examples/todo-backend/.harness/results.yaml",
      ],
      failureMeaning: {
        en: "The demo would prove tests ran but would not show the human-review advantage of the Harness.",
        "zh-CN": "demo 能证明测试运行过，但无法展示 Harness 的 human-review 优势。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.showcase.validation_guards_promise_and_module_coverage",
      moduleId: "todo-backend-showcase",
      feature: "Todo-Backend / Harness Showcase",
      title: {
        en: "Validation guards Todo-Backend promise and module coverage",
        "zh-CN": "validation 保护 Todo-Backend promise 和 module coverage",
      },
      purpose: {
        en: "Protect the showcase from drifting as files are added by requiring validation to catch unreadable promises, missing evidence, unknown bindings, and unmapped example areas.",
        "zh-CN":
          "防止 showcase 随文件增加而漂移；要求 validation 捕获不可读 promise、缺失 evidence、未知 binding 和未映射 example 区域。",
      },
      priority: "P1",
      boundary: "unit",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "The Todo-Backend example has modules, promises, contract tests, native tests, and result files",
          "zh-CN":
            "Todo-Backend example 拥有 modules、promises、contract tests、native tests 和 result files",
        },
      ],
      when: [
        {
          en: "The documented check command runs",
          "zh-CN": "文档中的 check command 运行",
        },
      ],
      then: [
        {
          en: "Unreadable promises fail validation before implementation is considered complete",
          "zh-CN": "不可读 promises 会在 implementation 被视为完成前让 validation 失败",
        },
        {
          en: "Unknown promise bindings and missing test results are visible in the report or check output",
          "zh-CN": "未知 promise bindings 和缺失 test results 会在 report 或 check output 中可见",
        },
        {
          en: "Example modules list the promises and source areas they own",
          "zh-CN": "example modules 会列出自己负责的 promises 和 source areas",
        },
      ],
      observes: [
        "examples/todo-backend/tests/modules/*.module.yaml",
        "examples/todo-backend/tests/promises/*.promises.yaml",
        "examples/todo-backend/tools/check-feature-map.mjs",
      ],
      failureMeaning: {
        en: "The public demo could decay into an impressive run command with weak review metadata.",
        "zh-CN": "公开 demo 可能退化成一个看起来很厉害的运行命令，但 review metadata 很弱。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.typescript_hono.server_implements_contract",
      moduleId: "todo-backend-typescript-hono",
      feature: "Todo-Backend / TypeScript Hono",
      title: {
        en: "The TypeScript Hono backend implements the Todo-Backend contract",
        "zh-CN": "TypeScript Hono backend 实现 Todo-Backend contract",
      },
      purpose: {
        en: "Protect the TypeScript example as a real modern backend implementation that can power the TodoMVC client and produce Harness evidence.",
        "zh-CN":
          "保护 TypeScript example，确保它是真实的现代 backend implementation，可以驱动 TodoMVC client 并产出 Harness evidence。",
      },
      priority: "P0",
      boundary: "e2e",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "The TypeScript Hono implementation is started on its configured port",
          "zh-CN": "TypeScript Hono implementation 已在配置端口启动",
        },
      ],
      when: [
        {
          en: "The shared Todo-Backend contract tests run against it",
          "zh-CN": "共享 Todo-Backend contract tests 针对它运行",
        },
      ],
      then: [
        {
          en: "Every P0 Todo-Backend API promise has passing Harness evidence for that implementation",
          "zh-CN": "每个 P0 Todo-Backend API promise 都有该实现的 passing Harness evidence",
        },
        {
          en: "The TodoMVC client can use that implementation without configuration changes beyond the backend URL",
          "zh-CN": "TodoMVC client 除 backend URL 外无需其它配置即可使用该实现",
        },
      ],
      observes: [
        "examples/todo-backend/implementations/typescript-hono/**",
        "examples/todo-backend/contract-tests/**",
        ".harness/results.yaml",
      ],
      failureMeaning: {
        en: "The TypeScript example would be a partial server rather than a working Todo-Backend implementation.",
        "zh-CN":
          "TypeScript example 会只是一个不完整 server，而不是真正可用的 Todo-Backend implementation。",
      },
      review: {
        state: "pending",
      },
    },
    {
      id: "todo_backend.typescript_hono.native_tests_are_promise_bound",
      moduleId: "todo-backend-typescript-hono",
      feature: "Todo-Backend / TypeScript Hono",
      title: {
        en: "TypeScript Hono native tests are bound to Todo-Backend promises",
        "zh-CN": "TypeScript Hono native tests 绑定到 Todo-Backend promises",
      },
      purpose: {
        en: "Protect the TypeScript implementation from being only black-box tested; native Vitest evidence should still map back to the same reviewed promises.",
        "zh-CN":
          "避免 TypeScript implementation 只有黑盒测试；native Vitest evidence 也应该映射回同一批已 review promises。",
      },
      priority: "P1",
      boundary: "adapter",
      lifecycle: "proposed",
      runStatus: "passing",
      given: [
        {
          en: "The TypeScript Hono implementation has native Vitest tests",
          "zh-CN": "TypeScript Hono implementation 拥有 native Vitest tests",
        },
      ],
      when: [
        {
          en: "Those tests run through the Vitest adapter",
          "zh-CN": "这些测试通过 Vitest adapter 运行",
        },
      ],
      then: [
        {
          en: "Each native test emits adapter events using canonical Todo-Backend promise ids",
          "zh-CN": "每个 native test 都使用 canonical Todo-Backend promise ids 输出 adapter events",
        },
        {
          en: "The shared runtime can merge those events into the same Harness result model as the black-box contract tests",
          "zh-CN":
            "共享 runtime 可以把这些 events 合并到与黑盒 contract tests 相同的 Harness result model 中",
        },
      ],
      observes: [
        "examples/todo-backend/implementations/typescript-hono/**",
        "packages/adapter-vitest/src/**",
        ".harness/runs/*/events/*.ndjson",
      ],
      failureMeaning: {
        en: "The example would show a working TypeScript server but not how native framework tests become Harness evidence.",
        "zh-CN":
          "example 会展示一个能工作的 TypeScript server，但无法展示 native framework tests 如何变成 Harness evidence。",
      },
      review: {
        state: "pending",
      },
    },
  ],
  reviewDrafts: [],
};
