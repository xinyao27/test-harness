@package:todo-backend-rust-axum
@module:todo-api
@feature:todo-backend.rust-axum.todo-api
@locale:zh-CN
Feature: Rust Axum Todo Backend API

  @rule:todo-backend.rust-axum.todo-lifecycle
  Rule: Todos 会经过创建、列出、修改和清空

    @example:create-list-patch-clear
    Example: 一个 todo 会走过核心 API 生命周期
      Given 内存中的 Rust Axum Todo backend 已经启动
      When 我创建标题为 "ship rust"、顺序为 1 的 todo
      Then 创建出来的 todo 未完成
      And 创建出来的 todo 顺序为 1
      When 我列出 todos
      Then todo 列表包含 1 个 todo
      When 我把 todo 1 标记为完成，并把标题改为 "ship elegant rust"
      Then todo 1 已完成
      And todo 1 的标题是 "ship elegant rust"
      When 我清空所有 todos
      Then 清空请求成功
