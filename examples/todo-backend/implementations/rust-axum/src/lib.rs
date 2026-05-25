use axum::{
    extract::{Path, State},
    http::{header::HOST, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};
use tower_http::cors::CorsLayer;

const TODO_PATH: &str = "/todos";

#[derive(Clone, Default)]
pub struct TodoBackendState {
    inner: Arc<Mutex<TodoStore>>,
}

#[derive(Default)]
struct TodoStore {
    next_id: u64,
    todos: BTreeMap<u64, TodoState>,
}

#[derive(Clone)]
struct TodoState {
    completed: bool,
    id: u64,
    order: i64,
    title: String,
}

#[derive(Deserialize)]
struct TodoCreateInput {
    completed: Option<bool>,
    order: Option<i64>,
    title: Option<String>,
}

#[derive(Deserialize)]
struct TodoPatchInput {
    completed: Option<bool>,
    order: Option<i64>,
    title: Option<String>,
}

#[derive(Serialize)]
pub struct Todo {
    completed: bool,
    order: i64,
    title: String,
    url: String,
}

#[derive(Serialize)]
struct ErrorBody {
    error: &'static str,
}

pub fn create_app() -> Router {
    Router::new()
        .route(
            TODO_PATH,
            get(list_todos).post(create_todo).delete(delete_all),
        )
        .route(
            "/todos/{id}",
            get(get_todo).patch(patch_todo).delete(delete_todo),
        )
        .layer(CorsLayer::permissive())
        .with_state(TodoBackendState::default())
}

async fn list_todos(State(state): State<TodoBackendState>, headers: HeaderMap) -> Json<Vec<Todo>> {
    let store = state.inner.lock().expect("todo store lock poisoned");
    Json(
        store
            .todos
            .values()
            .map(|todo| serialize_todo(todo, &headers))
            .collect(),
    )
}

async fn create_todo(
    State(state): State<TodoBackendState>,
    headers: HeaderMap,
    Json(input): Json<TodoCreateInput>,
) -> (StatusCode, Json<Todo>) {
    let mut store = state.inner.lock().expect("todo store lock poisoned");
    store.next_id += 1;
    let todo = TodoState {
        completed: input.completed.unwrap_or(false),
        id: store.next_id,
        order: input.order.unwrap_or(0),
        title: input.title.unwrap_or_default(),
    };
    let response = serialize_todo(&todo, &headers);
    store.todos.insert(todo.id, todo);
    (StatusCode::CREATED, Json(response))
}

async fn delete_all(State(state): State<TodoBackendState>) -> StatusCode {
    state
        .inner
        .lock()
        .expect("todo store lock poisoned")
        .todos
        .clear();
    StatusCode::NO_CONTENT
}

async fn get_todo(
    State(state): State<TodoBackendState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
) -> Response {
    let store = state.inner.lock().expect("todo store lock poisoned");
    match store.todos.get(&id) {
        Some(todo) => Json(serialize_todo(todo, &headers)).into_response(),
        None => not_found(),
    }
}

async fn patch_todo(
    State(state): State<TodoBackendState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
    Json(input): Json<TodoPatchInput>,
) -> Response {
    let mut store = state.inner.lock().expect("todo store lock poisoned");
    let Some(todo) = store.todos.get_mut(&id) else {
        return not_found();
    };

    if let Some(title) = input.title {
        todo.title = title;
    }
    if let Some(completed) = input.completed {
        todo.completed = completed;
    }
    if let Some(order) = input.order {
        todo.order = order;
    }

    Json(serialize_todo(todo, &headers)).into_response()
}

async fn delete_todo(State(state): State<TodoBackendState>, Path(id): Path<u64>) -> StatusCode {
    state
        .inner
        .lock()
        .expect("todo store lock poisoned")
        .todos
        .remove(&id);
    StatusCode::NO_CONTENT
}

fn serialize_todo(todo: &TodoState, headers: &HeaderMap) -> Todo {
    Todo {
        completed: todo.completed,
        order: todo.order,
        title: todo.title.clone(),
        url: format!("{}{TODO_PATH}/{}", request_origin(headers), todo.id),
    }
}

fn request_origin(headers: &HeaderMap) -> String {
    let host = headers
        .get(HOST)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("127.0.0.1:3102");
    format!("http://{host}")
}

fn not_found() -> Response {
    (
        StatusCode::NOT_FOUND,
        Json(ErrorBody {
            error: "Todo not found",
        }),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::{header::CONTENT_TYPE, Method, Request},
    };
    use serde_json::{json, Value};
    use tower::ServiceExt;

    #[test]
    fn native_tests_are_bound_to_todo_backend_promises() {
        if std::env::var_os("TODO_BACKEND_RUST_NATIVE_TESTS").is_none() {
            return;
        }

        harness_adapter_rust::scenario_test!(
            "todo_backend.rust_axum.native_tests_are_promise_bound",
            "Rust Axum native tests exercise create, list, patch, and delete",
            {
                tokio::runtime::Runtime::new()
                    .expect("create Tokio runtime")
                    .block_on(async {
                        let app = create_app();

                        let created = request_json(
                            &app,
                            Method::POST,
                            TODO_PATH,
                            json!({ "title": "ship rust", "order": 1 }),
                        )
                        .await;
                        assert_eq!(created["title"], "ship rust");
                        assert_eq!(created["completed"], false);
                        assert_eq!(created["order"], 1);

                        let listed = request_json(&app, Method::GET, TODO_PATH, Value::Null).await;
                        assert_eq!(listed.as_array().expect("todo list").len(), 1);

                        let patched = request_json(
                            &app,
                            Method::PATCH,
                            "/todos/1",
                            json!({ "completed": true, "title": "ship elegant rust" }),
                        )
                        .await;
                        assert_eq!(patched["completed"], true);
                        assert_eq!(patched["title"], "ship elegant rust");

                        let delete_response = app
                            .clone()
                            .oneshot(request(Method::DELETE, TODO_PATH, Value::Null))
                            .await
                            .expect("delete all todos");
                        assert_eq!(delete_response.status(), StatusCode::NO_CONTENT);
                    });
            }
        );
    }

    async fn request_json(app: &Router, method: Method, path: &str, body: Value) -> Value {
        let response = app
            .clone()
            .oneshot(request(method, path, body))
            .await
            .expect("todo request");
        assert!(response.status().is_success(), "{}", response.status());
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("read response body");
        serde_json::from_slice(&bytes).expect("json response")
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
}
