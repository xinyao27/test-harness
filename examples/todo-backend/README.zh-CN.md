# Todo-Backend 示例

这个 example 正在重写到新的 Cucumber-based Harness 模型上。

第一条已经迁移的链路是 Rust Axum Todo Backend。它的行为由多语言 Cucumber feature 文件描述，并由 cucumber-rs 直接针对真实的内存 Axum 应用执行。

## Feature 文件

```text
features/implementations/rust-axum/todo-api.feature
features/implementations/rust-axum/todo-api.zh-CN.feature
```

两个语言版本复用同一组稳定 tags：

```text
@package:todo-backend-rust-axum
@module:todo-api
@feature:todo-backend.rust-axum.todo-api
@rule:todo-backend.rust-axum.todo-lifecycle
@example:create-list-patch-clear
```

英文和中文描述是给人 review 的文本。tags 才是 Harness 用来连接 Package、Module、Feature、Rule、Example、Rule state 和执行证据的稳定身份。

## 运行 Cucumber 示例

```bash
pnpm example:todo:test
```

也可以直接运行 Rust test：

```bash
cargo test -p todo-backend-rust-axum --test rust_axum_cucumber
```

Cucumber runner 会加载两个语言版本的 feature 文件，并验证 Rust Axum 实现里的 create、list、patch、clear 完整流程。

`harness test` 已经可以调用配置好的 runner，但把 Cucumber Example 结果归一化写入 `tests/harness.results.yaml` 仍然是下一步 harness-runner 工作。

## Harness 元数据

```text
tests/harness.locales.yaml
tests/harness.packages.yaml
tests/harness.modules.yaml
tests/harness.behavior.yaml
tests/harness.review-log.yaml
```

这些文件描述 example 的 review 语言、package/module 归属、Rule state 和 review 历史。它们故意和 `.feature` 文件分开，避免把人的 Rule state 塞进 Cucumber 语法里。

## 当前重写边界

TypeScript implementation 和 TodoMVC client 仍然是有用的 example application code，但重写前的 Vitest/browser test harness 已经不再是 canonical path。新的 example 行为应该先写成 Cucumber feature，再绑定到可执行的 Cucumber evidence。

## Attribution

UI 基于 TasteJS TodoMVC 的 React example：

```text
https://github.com/tastejs/todomvc/tree/master/examples/react
```

源码已经被重构成 Vite app，并从本地 reducer state 改成 Todo-Backend HTTP API client。
