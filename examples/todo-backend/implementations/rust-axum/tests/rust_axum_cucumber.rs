use axum::{
    body::{to_bytes, Body},
    http::{header::CONTENT_TYPE, header::HOST, Method, Request, StatusCode},
    Router,
};
use cucumber::{given, then, when, World as _};
use serde_json::{json, Value};
use std::{fmt, path::PathBuf};
use todo_backend_rust_axum::create_app;
use tower::ServiceExt;

#[derive(cucumber::World)]
struct TodoWorld {
    app: Router,
    last_json: Value,
    last_list: Vec<Value>,
    last_status: Option<StatusCode>,
}

impl Default for TodoWorld {
    fn default() -> Self {
        Self {
            app: create_app(),
            last_json: Value::Null,
            last_list: Vec::new(),
            last_status: None,
        }
    }
}

impl fmt::Debug for TodoWorld {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("TodoWorld")
            .field("last_json", &self.last_json)
            .field("last_list", &self.last_list)
            .field("last_status", &self.last_status)
            .finish_non_exhaustive()
    }
}

#[given("the Rust Axum Todo backend is running in memory")]
#[given("内存中的 Rust Axum Todo backend 已经启动")]
async fn backend_is_running(world: &mut TodoWorld) {
    *world = TodoWorld::default();
}

#[when(regex = r#"^I create a todo titled "([^"]+)" with order (\d+)$"#)]
#[when(regex = r#"^我创建标题为 "([^"]+)"、顺序为 (\d+) 的 todo$"#)]
async fn create_todo(world: &mut TodoWorld, title: String, order: i64) {
    let (status, json) = request_json(
        &world.app,
        Method::POST,
        "/todos",
        json!({ "title": title, "order": order }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    world.last_status = Some(status);
    world.last_json = json;
}

#[then("the created todo is incomplete")]
#[then("创建出来的 todo 未完成")]
fn created_todo_is_incomplete(world: &mut TodoWorld) {
    assert_eq!(world.last_json["completed"], false);
}

#[then(expr = "the created todo has order {int}")]
#[then(regex = r"^创建出来的 todo 顺序为 (\d+)$")]
fn created_todo_has_order(world: &mut TodoWorld, order: i64) {
    assert_eq!(world.last_json["order"], order);
}

#[when("I list todos")]
#[when("我列出 todos")]
async fn list_todos(world: &mut TodoWorld) {
    let (status, json) = request_json(&world.app, Method::GET, "/todos", Value::Null).await;
    assert_eq!(status, StatusCode::OK);
    world.last_status = Some(status);
    world.last_list = json.as_array().expect("todo list").clone();
    world.last_json = json;
}

#[then(expr = "the todo list contains {int} todo")]
#[then(regex = r"^todo 列表包含 (\d+) 个 todo$")]
fn todo_list_contains(world: &mut TodoWorld, count: usize) {
    assert_eq!(world.last_list.len(), count);
}

#[when(regex = r#"^I mark todo (\d+) complete with title "([^"]+)"$"#)]
#[when(regex = r#"^我把 todo (\d+) 标记为完成，并把标题改为 "([^"]+)"$"#)]
async fn mark_todo_complete(world: &mut TodoWorld, id: u64, title: String) {
    let (status, json) = request_json(
        &world.app,
        Method::PATCH,
        &format!("/todos/{id}"),
        json!({ "completed": true, "title": title }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    world.last_status = Some(status);
    world.last_json = json;
}

#[then(regex = r"^todo (\d+) is complete$")]
#[then(regex = r"^todo (\d+) 已完成$")]
fn todo_is_complete(world: &mut TodoWorld, _id: u64) {
    assert_eq!(world.last_json["completed"], true);
}

#[then(regex = r#"^todo (\d+) has title "([^"]+)"$"#)]
#[then(regex = r#"^todo (\d+) 的标题是 "([^"]+)"$"#)]
fn todo_has_title(world: &mut TodoWorld, _id: u64, title: String) {
    assert_eq!(world.last_json["title"], title);
}

#[when("I clear all todos")]
#[when("我清空所有 todos")]
async fn clear_all_todos(world: &mut TodoWorld) {
    let (status, json) = request_json(&world.app, Method::DELETE, "/todos", Value::Null).await;
    world.last_status = Some(status);
    world.last_json = json;
    world.last_list.clear();
}

#[then("the clear request succeeds")]
#[then("清空请求成功")]
fn clear_succeeds(world: &mut TodoWorld) {
    assert_eq!(world.last_status, Some(StatusCode::NO_CONTENT));
}

async fn request_json(
    app: &Router,
    method: Method,
    path: &str,
    body: Value,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(request(method, path, body))
        .await
        .expect("todo request");
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("read response body");
    let json = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).expect("json response")
    };
    (status, json)
}

fn request(method: Method, path: &str, body: Value) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(path)
        .header(HOST, "127.0.0.1:3102");

    let body = if body.is_null() {
        Body::empty()
    } else {
        builder = builder.header(CONTENT_TYPE, "application/json");
        Body::from(body.to_string())
    };

    builder.body(body).expect("request body")
}

#[tokio::main]
async fn main() {
    harness_cucumber_rs::apply_harness_filter_to_cucumber_rs_env();
    let features =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../features/implementations/rust-axum");
    TodoWorld::run(features).await;
}
