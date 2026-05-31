@package:todo-backend-rust-axum
@module:todo-api
@feature:todo-backend.rust-axum.todo-api
@locale:en
Feature: Rust Axum Todo Backend API

  @rule:todo-backend.rust-axum.todo-lifecycle
  Rule: Todos move through create, list, patch, and clear

    @example:create-list-patch-clear
    Example: A todo moves through the core API lifecycle
      Given the Rust Axum Todo backend is running in memory
      When I create a todo titled "ship rust" with order 1
      Then the created todo is incomplete
      And the created todo has order 1
      When I list todos
      Then the todo list contains 1 todo
      When I mark todo 1 complete with title "ship elegant rust"
      Then todo 1 is complete
      And todo 1 has title "ship elegant rust"
      When I clear all todos
      Then the clear request succeeds
