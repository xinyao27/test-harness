use axum::extract::{Query, Request, State};
use axum::http::header::{ACCEPT, CONTENT_TYPE, HOST};
use axum::http::{HeaderValue, Method, StatusCode};
use axum::middleware::{from_fn_with_state, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use harness_daemon::{
    build_studio_snapshot, empty_snapshot, known_projects, resolve_project_root, KnownProject,
};
use serde::{Deserialize, Serialize};
use std::env;
use std::net::SocketAddr;
use std::path::PathBuf;
use tower_http::cors::{AllowOrigin, CorsLayer};

#[derive(Debug, Clone)]
struct AppState {
    allowed_hosts: Vec<String>,
    workspace_root: PathBuf,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotQuery {
    project_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    message: String,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: ErrorBody,
}

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let options = parse_options(env::args().skip(1).collect())?;
    let state = AppState {
        allowed_hosts: allowed_hosts(options.addr),
        workspace_root: options.root,
    };
    let app = Router::new()
        .route("/health", get(health))
        .route("/api/projects", get(projects))
        .route("/api/snapshot", get(snapshot))
        .layer(from_fn_with_state(state.clone(), validate_host))
        .layer(cors_layer())
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(options.addr)
        .await
        .map_err(|error| format!("Failed to bind {}: {error}", options.addr))?;

    println!("harness-daemon listening on http://{}", options.addr);
    axum::serve(listener, app)
        .await
        .map_err(|error| format!("harness-daemon server failed: {error}"))
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

async fn projects(State(state): State<AppState>) -> Json<Vec<KnownProject>> {
    Json(known_projects(state.workspace_root))
}

async fn snapshot(
    State(state): State<AppState>,
    Query(query): Query<SnapshotQuery>,
) -> impl IntoResponse {
    let project_id = query.project_id.as_deref();
    let Some(root) = resolve_project_root(&state.workspace_root, project_id) else {
        if project_id == Some("none") {
            return (StatusCode::OK, Json(empty_snapshot("No project"))).into_response();
        }
        return error_response(
            StatusCode::NOT_FOUND,
            format!(
                "Unknown or unsupported project id \"{}\".",
                project_id.unwrap_or("current:test-harness")
            ),
        );
    };

    match tokio::task::spawn_blocking(move || build_studio_snapshot(root)).await {
        Ok(Ok(snapshot)) => (StatusCode::OK, Json(snapshot)).into_response(),
        Ok(Err(error)) => error_response(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
        Err(error) => error_response(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

async fn validate_host(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let host = request
        .headers()
        .get(HOST)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if !is_allowed_host(host, &state.allowed_hosts) {
        return error_response(
            StatusCode::FORBIDDEN,
            "Requests must target the local Harness daemon host.".to_string(),
        );
    }

    next.run(request).await
}

fn error_response(status: StatusCode, message: String) -> Response {
    (
        status,
        Json(ErrorResponse {
            error: ErrorBody { message },
        }),
    )
        .into_response()
}

struct Options {
    addr: SocketAddr,
    root: PathBuf,
}

fn parse_options(args: Vec<String>) -> Result<Options, String> {
    let mut addr = "127.0.0.1:4101"
        .parse::<SocketAddr>()
        .map_err(|error| error.to_string())?;
    let mut root = env::current_dir().map_err(|error| error.to_string())?;
    let mut index = 0;

    while index < args.len() {
        match args[index].as_str() {
            "--addr" => {
                let value = args
                    .get(index + 1)
                    .ok_or_else(|| "--addr requires a value.".to_string())?;
                addr = value
                    .parse::<SocketAddr>()
                    .map_err(|error| format!("Invalid --addr value \"{value}\": {error}"))?;
                index += 2;
            }
            "--root" => {
                let value = args
                    .get(index + 1)
                    .ok_or_else(|| "--root requires a value.".to_string())?;
                root = PathBuf::from(value);
                index += 2;
            }
            "--help" | "-h" => {
                return Err(
                    "Usage: harness-daemon [--root <path>] [--addr <host:port>]".to_string()
                );
            }
            value => {
                return Err(format!("Unknown argument \"{value}\"."));
            }
        }
    }

    let root = root
        .canonicalize()
        .map_err(|error| format!("Invalid --root value \"{}\": {error}", root.display()))?;

    Ok(Options { addr, root })
}

fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_methods([Method::GET])
        .allow_headers([ACCEPT, CONTENT_TYPE])
        .allow_origin(AllowOrigin::predicate(|origin, _| {
            is_allowed_studio_origin(origin)
        }))
}

fn allowed_hosts(addr: SocketAddr) -> Vec<String> {
    let port = addr.port();
    vec![
        format!("127.0.0.1:{port}"),
        format!("localhost:{port}"),
        format!("[::1]:{port}"),
    ]
}

fn is_allowed_host(host: &str, allowed_hosts: &[String]) -> bool {
    allowed_hosts
        .iter()
        .any(|allowed_host| host.eq_ignore_ascii_case(allowed_host))
}

fn is_allowed_studio_origin(origin: &HeaderValue) -> bool {
    let Ok(origin) = origin.to_str() else {
        return false;
    };

    matches!(
        origin,
        "http://127.0.0.1:4100" | "http://localhost:4100" | "http://[::1]:4100"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_allowlist_accepts_only_local_daemon_hosts() {
        let allowed = allowed_hosts("127.0.0.1:4101".parse().unwrap());

        assert!(is_allowed_host("127.0.0.1:4101", &allowed));
        assert!(is_allowed_host("localhost:4101", &allowed));
        assert!(is_allowed_host("[::1]:4101", &allowed));
        assert!(!is_allowed_host("example.com:4101", &allowed));
        assert!(!is_allowed_host("127.0.0.1:4100", &allowed));
    }

    #[test]
    fn cors_allowlist_accepts_only_studio_origins() {
        assert!(is_allowed_studio_origin(&HeaderValue::from_static(
            "http://127.0.0.1:4100"
        )));
        assert!(is_allowed_studio_origin(&HeaderValue::from_static(
            "http://localhost:4100"
        )));
        assert!(!is_allowed_studio_origin(&HeaderValue::from_static(
            "https://example.com"
        )));
    }
}
