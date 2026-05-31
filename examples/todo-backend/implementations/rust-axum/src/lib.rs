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
