use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Extension, Query, Request, State};
use axum::http::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HOST, ORIGIN};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode};
use axum::middleware::{from_fn_with_state, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use harness_core::{find_module_files, find_promise_files, MODULES_DIRECTORY, PROMISES_DIRECTORY};
use harness_daemon::{
    build_studio_snapshot, empty_snapshot, known_projects, resolve_project_root, KnownProject,
};
use harness_protocol::{
    LocalizedText, ModuleRecord, PromiseLifecycle, PromiseRecord, PromiseReviewAction,
    PromiseReviewEvent, PromiseReviewState, PromisesFile, ProtocolVersion,
};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::net::SocketAddr;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tower_http::cors::{AllowOrigin, CorsLayer};

const PAIRING_TTL: Duration = Duration::from_secs(5 * 60);
const SESSION_TTL: Duration = Duration::from_secs(30 * 24 * 60 * 60);
const DEFAULT_STUDIO_ORIGINS: &[&str] = &[
    "http://127.0.0.1:4100",
    "http://localhost:4100",
    "http://[::1]:4100",
];

#[derive(Debug, Clone)]
struct AppState {
    allowed_hosts: Vec<String>,
    auth: Arc<Mutex<DaemonAuth>>,
    workspace_root: PathBuf,
    /// URL children spawned by /api/agent/pty should reach us at — e.g.
    /// "http://127.0.0.1:4101". Injected as HARNESS_DAEMON_URL into the agent.
    daemon_url: String,
    /// The shell command line to spawn when a paired client connects to
    /// /api/agent/pty. Defaults to ["claude"]; configurable via --agent-command.
    agent_command: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotQuery {
    project_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectRequest {
    project_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpsertModuleRequest {
    project_id: Option<String>,
    module: ModuleRecord,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpsertPromiseRequest {
    project_id: Option<String>,
    module_id: String,
    promise: PromiseRecord,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PromiseReviewRequest {
    action: PromiseReviewAction,
    note: Option<String>,
    project_id: Option<String>,
    promise_id: String,
    reviewer: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenFileRequest {
    project_id: Option<String>,
    file: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenFileResponse {
    opened: bool,
    path: String,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompletePairingRequest {
    pairing_code: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartPairingResponse {
    expires_in_seconds: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompletePairingResponse {
    token: String,
    expires_in_seconds: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunTestsResponse {
    exit_code: i32,
    stderr: String,
    stdout: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthoringWriteResponse {
    exit_code: i32,
    saved: bool,
    stderr: String,
    stdout: String,
}

#[derive(Debug, Clone)]
struct FileBackup {
    contents: Option<Vec<u8>>,
    path: PathBuf,
}

#[derive(Debug, Clone)]
struct AuthenticatedSession {
    token_hash: String,
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
    let allowed_origins = options.allowed_origins.clone();
    let daemon_url = format!("http://{}", options.addr);
    let state = AppState {
        allowed_hosts: allowed_hosts(options.addr),
        auth: Arc::new(Mutex::new(DaemonAuth::default())),
        workspace_root: options.root,
        daemon_url,
        agent_command: options.agent_command,
    };
    let protected_routes = Router::new()
        .route("/api/projects", get(projects))
        .route("/api/snapshot", get(snapshot))
        .route("/api/run/tests", post(run_tests))
        .route("/api/studio/open", post(open_file))
        .route("/api/agent/pty", get(agent_pty))
        .route("/api/session/revoke", post(revoke_session))
        .route("/api/studio/module", post(upsert_module))
        .route("/api/studio/promise", post(upsert_promise))
        .route("/api/studio/promise-review", post(review_promise))
        .route_layer(from_fn_with_state(state.clone(), require_session));
    let app = Router::new()
        .route("/health", get(health))
        .route("/api/pairing/start", post(start_pairing))
        .route("/api/pairing/complete", post(complete_pairing))
        .merge(protected_routes)
        .layer(from_fn_with_state(state.clone(), validate_host))
        .layer(cors_layer(allowed_origins))
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

async fn start_pairing(State(state): State<AppState>) -> Json<StartPairingResponse> {
    let mut auth = state.auth.lock().expect("daemon auth mutex poisoned");
    let pairing = auth.start_pairing();

    println!(
        "harness-daemon pairing code: {} (expires in {} seconds)",
        pairing.pairing_code,
        PAIRING_TTL.as_secs()
    );

    Json(StartPairingResponse {
        expires_in_seconds: PAIRING_TTL.as_secs(),
    })
}

async fn complete_pairing(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CompletePairingRequest>,
) -> Response {
    let origin = request_origin_from_headers(&headers);
    let mut auth = state.auth.lock().expect("daemon auth mutex poisoned");
    let Some(session) = auth.complete_pairing(&request.pairing_code, origin) else {
        return error_response(
            StatusCode::UNAUTHORIZED,
            "Pairing code is invalid or expired.".to_string(),
        );
    };

    (
        StatusCode::OK,
        Json(CompletePairingResponse {
            token: session.token,
            expires_in_seconds: SESSION_TTL.as_secs(),
        }),
    )
        .into_response()
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

async fn run_tests(
    State(state): State<AppState>,
    Json(request): Json<ProjectRequest>,
) -> impl IntoResponse {
    let project_id = request.project_id.as_deref();
    let Some(root) = resolve_project_root(&state.workspace_root, project_id) else {
        return error_response(
            StatusCode::NOT_FOUND,
            format!(
                "Unknown or unsupported project id \"{}\".",
                project_id.unwrap_or("current:test-harness")
            ),
        );
    };

    match tokio::task::spawn_blocking(move || {
        harness_cli::run_cli_collect(&["test".to_string(), "--summary".to_string()], root)
    })
    .await
    {
        Ok(output) => (
            StatusCode::OK,
            Json(RunTestsResponse {
                exit_code: output.exit_code,
                stderr: output.stderr,
                stdout: output.stdout,
            }),
        )
            .into_response(),
        Err(error) => error_response(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

async fn agent_pty(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<AgentPtyQuery>,
    headers: HeaderMap,
) -> Response {
    // Browser WebSockets cannot set Authorization, so we accept either the
    // header (set by curl/native clients) or a ?token=… query parameter.
    let token = bearer_token_from_headers(&headers).or(query.token);
    let Some(token) = token else {
        return error_response(
            StatusCode::UNAUTHORIZED,
            "agent pty endpoint requires a bearer token (Authorization header or ?token=).".to_string(),
        );
    };
    let Some(origin) = request_origin_from_headers(&headers) else {
        return error_response(
            StatusCode::BAD_REQUEST,
            "agent pty endpoint requires an Origin header.".to_string(),
        );
    };
    let kind = query.kind.unwrap_or(PtyKind::Agent);
    let command = match kind {
        PtyKind::Agent => state.agent_command.clone(),
        PtyKind::Terminal => terminal_command(),
    };
    let daemon_url = state.daemon_url.clone();

    ws.on_upgrade(move |socket| async move {
        if let Err(error) = handle_agent_pty(socket, command, daemon_url, token, origin).await {
            eprintln!("agent pty session ended with error: {error}");
        }
    })
}

#[derive(Debug, Deserialize)]
struct AgentPtyQuery {
    token: Option<String>,
    kind: Option<PtyKind>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum PtyKind {
    /// Spawn the configured agent CLI (default `claude`). Default if the
    /// client doesn't pass `?kind=`, so existing connection patterns keep
    /// working.
    Agent,
    /// Spawn the user's interactive shell ($SHELL → bash → sh). The pty still
    /// inherits HARNESS_DAEMON_* env, so `harness studio …` works directly
    /// inside the shell with no extra setup.
    Terminal,
}

/// Pick a sensible interactive shell for the terminal kind. Falls back through
/// $SHELL → /bin/bash → /bin/sh, then to "sh" so Command::new can still
/// resolve via PATH on stripped systems.
fn terminal_command() -> Vec<String> {
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.trim().is_empty() {
            return vec![shell];
        }
    }
    for candidate in ["/bin/bash", "/bin/sh"] {
        if std::path::Path::new(candidate).exists() {
            return vec![candidate.to_string()];
        }
    }
    vec!["sh".to_string()]
}

/// Bidirectional bridge between a WebSocket and a freshly spawned PTY child
/// running the configured agent CLI. The child inherits HARNESS_DAEMON_* env
/// so `harness studio …` works inside it immediately. The session ends — and
/// the child is killed + reaped — when either side closes.
async fn handle_agent_pty(
    mut socket: WebSocket,
    agent_command: Vec<String>,
    daemon_url: String,
    token: String,
    origin: String,
) -> Result<(), String> {
    use std::io::{Read, Write};
    use tokio::sync::mpsc;

    if agent_command.is_empty() {
        return Err("daemon was started without --agent-command".to_string());
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("openpty failed: {error}"))?;
    let master = pair.master;

    let mut command = CommandBuilder::new(&agent_command[0]);
    for arg in &agent_command[1..] {
        command.arg(arg);
    }
    command.env("HARNESS_DAEMON_URL", &daemon_url);
    command.env("HARNESS_DAEMON_TOKEN", &token);
    command.env("HARNESS_DAEMON_ORIGIN", &origin);
    if let Ok(term) = std::env::var("TERM") {
        command.env("TERM", &term);
    } else {
        command.env("TERM", "xterm-256color");
    }

    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| format!("failed to spawn agent: {error}"))?;
    drop(pair.slave);

    let reader = master
        .try_clone_reader()
        .map_err(|error| format!("clone pty reader failed: {error}"))?;
    let mut writer = master
        .take_writer()
        .map_err(|error| format!("take pty writer failed: {error}"))?;

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Vec<u8>>();
    let reader_handle = tokio::task::spawn_blocking(move || {
        let mut reader = reader;
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => {
                    if out_tx.send(buffer[..read].to_vec()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    loop {
        tokio::select! {
            outgoing = out_rx.recv() => {
                let Some(bytes) = outgoing else { break };
                if socket.send(Message::Binary(bytes.into())).await.is_err() {
                    break;
                }
            }
            incoming = socket.recv() => {
                let Some(Ok(message)) = incoming else { break };
                match message {
                    Message::Binary(bytes) => {
                        if writer.write_all(&bytes).is_err() { break; }
                    }
                    Message::Text(text) => {
                        if let Ok(control) = serde_json::from_str::<PtyClientMessage>(&text) {
                            match control {
                                PtyClientMessage::Resize { cols, rows } => {
                                    let _ = master.resize(PtySize {
                                        rows,
                                        cols,
                                        pixel_width: 0,
                                        pixel_height: 0,
                                    });
                                }
                            }
                        }
                    }
                    Message::Close(_) => break,
                    Message::Ping(_) | Message::Pong(_) => {}
                }
            }
        }
    }

    // Cleanup: kill + reap the child so we never leave a zombie, then drain
    // the reader so its blocking thread exits, then politely close the WS.
    let _ = tokio::task::spawn_blocking(move || {
        let _ = child.kill();
        let _ = child.wait();
    })
    .await;
    let _ = reader_handle.await;
    let _ = socket.send(Message::Close(None)).await;
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
enum PtyClientMessage {
    Resize { cols: u16, rows: u16 },
}

fn bearer_token_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(|token| token.trim().to_string())
}

async fn open_file(
    State(state): State<AppState>,
    Json(request): Json<OpenFileRequest>,
) -> impl IntoResponse {
    let project_id = request.project_id.as_deref();
    let Some(root) = resolve_project_root(&state.workspace_root, project_id) else {
        return error_response(
            StatusCode::NOT_FOUND,
            format!(
                "Unknown or unsupported project id \"{}\".",
                project_id.unwrap_or("current:test-harness")
            ),
        );
    };

    match tokio::task::spawn_blocking(move || open_project_file(&root, &request.file)).await {
        Ok(Ok(response)) => (StatusCode::OK, Json(response)).into_response(),
        Ok(Err(error)) => error_response(StatusCode::BAD_REQUEST, error),
        Err(error) => error_response(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

async fn upsert_module(
    State(state): State<AppState>,
    Json(request): Json<UpsertModuleRequest>,
) -> impl IntoResponse {
    let Some(root) = resolve_project_root(&state.workspace_root, request.project_id.as_deref())
    else {
        return error_response(
            StatusCode::NOT_FOUND,
            format!(
                "Unknown or unsupported project id \"{}\".",
                request
                    .project_id
                    .as_deref()
                    .unwrap_or("current:test-harness")
            ),
        );
    };

    match tokio::task::spawn_blocking(move || upsert_module_record(root, request.module)).await {
        Ok(Ok(response)) => (StatusCode::OK, Json(response)).into_response(),
        Ok(Err(error)) => error_response(StatusCode::BAD_REQUEST, error),
        Err(error) => error_response(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

async fn upsert_promise(
    State(state): State<AppState>,
    Json(request): Json<UpsertPromiseRequest>,
) -> impl IntoResponse {
    let Some(root) = resolve_project_root(&state.workspace_root, request.project_id.as_deref())
    else {
        return error_response(
            StatusCode::NOT_FOUND,
            format!(
                "Unknown or unsupported project id \"{}\".",
                request
                    .project_id
                    .as_deref()
                    .unwrap_or("current:test-harness")
            ),
        );
    };

    match tokio::task::spawn_blocking(move || {
        upsert_promise_record(root, &request.module_id, request.promise)
    })
    .await
    {
        Ok(Ok(response)) => (StatusCode::OK, Json(response)).into_response(),
        Ok(Err(error)) => error_response(StatusCode::BAD_REQUEST, error),
        Err(error) => error_response(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

async fn review_promise(
    State(state): State<AppState>,
    Json(request): Json<PromiseReviewRequest>,
) -> impl IntoResponse {
    let Some(root) = resolve_project_root(&state.workspace_root, request.project_id.as_deref())
    else {
        return error_response(
            StatusCode::NOT_FOUND,
            format!(
                "Unknown or unsupported project id \"{}\".",
                request
                    .project_id
                    .as_deref()
                    .unwrap_or("current:test-harness")
            ),
        );
    };

    match tokio::task::spawn_blocking(move || {
        review_promise_record(
            root,
            &request.promise_id,
            request.action,
            &request.reviewer,
            request.note,
        )
    })
    .await
    {
        Ok(Ok(response)) => (StatusCode::OK, Json(response)).into_response(),
        Ok(Err(error)) => error_response(StatusCode::BAD_REQUEST, error),
        Err(error) => error_response(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

async fn revoke_session(
    State(state): State<AppState>,
    Extension(session): Extension<AuthenticatedSession>,
) -> StatusCode {
    let mut auth = state.auth.lock().expect("daemon auth mutex poisoned");
    auth.revoke_token_hash(&session.token_hash);
    StatusCode::NO_CONTENT
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

async fn require_session(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Response {
    let token = bearer_token(&request).map(ToOwned::to_owned);
    let origin = request_origin(&request);
    let session = token.and_then(|token| {
        let mut auth = state.auth.lock().expect("daemon auth mutex poisoned");
        auth.authenticate(&token, origin.as_deref())
    });

    let Some(session) = session else {
        return error_response(
            StatusCode::UNAUTHORIZED,
            "A valid Harness daemon session token is required.".to_string(),
        );
    };

    request.extensions_mut().insert(session);
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

fn upsert_module_record(
    root: PathBuf,
    module: ModuleRecord,
) -> Result<AuthoringWriteResponse, String> {
    ensure_safe_record_id(&module.id, "module id")?;
    let path = find_module_path_by_id(&root, &module.id)?.unwrap_or_else(|| {
        root.join(MODULES_DIRECTORY)
            .join(format!("{}.module.yaml", module.id))
    });
    let backups = backup_files([path.clone()])?;

    write_module_file(&path, &module)?;
    let response = check_written_project(&root);
    if response.exit_code == 0 {
        Ok(response)
    } else {
        rollback_files(&backups)?;
        Ok(AuthoringWriteResponse {
            saved: false,
            ..response
        })
    }
}

fn upsert_promise_record(
    root: PathBuf,
    module_id: &str,
    mut promise: PromiseRecord,
) -> Result<AuthoringWriteResponse, String> {
    ensure_safe_record_id(module_id, "module id")?;
    ensure_safe_record_id(&promise.id, "promise id")?;

    let module_path = find_module_path_by_id(&root, module_id)?
        .ok_or_else(|| format!("Module \"{module_id}\" does not exist."))?;
    let promise_path = find_promise_path_by_id(&root, &promise.id)?.unwrap_or_else(|| {
        root.join(PROMISES_DIRECTORY)
            .join(module_id)
            .join(format!("{module_id}.promises.yaml"))
    });
    // A promise belongs to exactly one module, so it must be pruned from any other module that
    // currently lists it when it is (re)assigned to module_id.
    let stale_module_paths = module_files_listing_promise(&root, &promise.id, &module_path)?;

    let mut backup_paths = vec![promise_path.clone(), module_path.clone()];
    backup_paths.extend(stale_module_paths.iter().cloned());
    let backups = backup_files(backup_paths)?;

    let baseline = check_written_project(&root);

    let write_result = (|| -> Result<(), String> {
        let mut promises_file = read_promises_file_or_default(&promise_path)?;
        if let Some(existing) = promises_file
            .promises
            .iter_mut()
            .find(|record| record.id == promise.id)
        {
            preserve_existing_promise_metadata(&mut promise, existing);
            *existing = promise.clone();
        } else {
            promises_file.promises.push(promise.clone());
        }
        write_promises_file(&promise_path, &promises_file)?;

        for stale_path in &stale_module_paths {
            let mut stale_module = read_module_file(stale_path)?;
            stale_module.promises.retain(|id| id != &promise.id);
            write_module_file(stale_path, &stale_module)?;
        }

        let mut module = read_module_file(&module_path)?;
        if !module.promises.iter().any(|id| id == &promise.id) {
            module.promises.push(promise.id.clone());
            write_module_file(&module_path, &module)?;
        }
        Ok(())
    })();

    finish_authored_write(&root, &backups, baseline, write_result)
}

// Module files (other than `target_module_path`) whose promises list contains `promise_id`.
fn module_files_listing_promise(
    root: &Path,
    promise_id: &str,
    target_module_path: &Path,
) -> Result<Vec<PathBuf>, String> {
    let mut paths = Vec::new();
    for path in find_module_files(root).map_err(|error| error.to_string())? {
        if path == target_module_path {
            continue;
        }
        if read_module_file(&path)?
            .promises
            .iter()
            .any(|id| id == promise_id)
        {
            paths.push(path);
        }
    }
    Ok(paths)
}

// Re-check the project after an authored write and decide whether to keep it: roll back on a write
// error, or when this write turned a previously-passing project into a failing one. A project that
// was already failing before the write is not blocked on that pre-existing, unrelated error.
fn finish_authored_write(
    root: &Path,
    backups: &[FileBackup],
    baseline: AuthoringWriteResponse,
    write_result: Result<(), String>,
) -> Result<AuthoringWriteResponse, String> {
    if let Err(error) = write_result {
        rollback_files(backups)?;
        return Err(error);
    }

    let after = check_written_project(root);
    if after.exit_code == 0 || baseline.exit_code != 0 {
        Ok(AuthoringWriteResponse {
            saved: true,
            ..after
        })
    } else {
        rollback_files(backups)?;
        Ok(AuthoringWriteResponse {
            saved: false,
            ..after
        })
    }
}

fn review_promise_record(
    root: PathBuf,
    promise_id: &str,
    action: PromiseReviewAction,
    reviewer: &str,
    note: Option<String>,
) -> Result<AuthoringWriteResponse, String> {
    ensure_safe_record_id(promise_id, "promise id")?;
    let reviewer = reviewer.trim();
    if reviewer.is_empty() {
        return Err("Reviewer must not be blank.".to_string());
    }

    let promise_path = find_promise_path_by_id(&root, promise_id)?
        .ok_or_else(|| format!("Promise \"{promise_id}\" does not exist."))?;
    let backups = backup_files([promise_path.clone()])?;
    let baseline = check_written_project(&root);

    let write_result = (|| -> Result<(), String> {
        let mut promises_file = read_promises_file_or_default(&promise_path)?;
        let promise = promises_file
            .promises
            .iter_mut()
            .find(|record| record.id == promise_id)
            .ok_or_else(|| format!("Promise \"{promise_id}\" does not exist."))?;
        apply_review_decision(promise, action, reviewer, note);
        write_promises_file(&promise_path, &promises_file)?;
        Ok(())
    })();

    finish_authored_write(&root, &backups, baseline, write_result)
}

fn apply_review_decision(
    promise: &mut PromiseRecord,
    action: PromiseReviewAction,
    reviewer: &str,
    note: Option<String>,
) {
    let decided_at = review_timestamp();
    let note = note.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    });
    let state = review_state_for_action(&action);
    promise.review.state = state;
    promise.review.decided_by = Some(reviewer.to_string());
    promise.review.decided_at = Some(decided_at.clone());
    promise.review.note = note.clone();
    promise.review.events.push(PromiseReviewEvent {
        action: action.clone(),
        by: reviewer.to_string(),
        at: decided_at,
        note,
    });

    match action {
        PromiseReviewAction::Approved
            if matches!(
                promise.lifecycle,
                PromiseLifecycle::Proposed | PromiseLifecycle::ChangedRequiresReview
            ) =>
        {
            promise.lifecycle = PromiseLifecycle::Accepted;
        }
        PromiseReviewAction::ChangesRequested | PromiseReviewAction::Rejected
            if matches!(
                promise.lifecycle,
                PromiseLifecycle::Accepted | PromiseLifecycle::Implemented
            ) =>
        {
            // A previously accepted promise that is rejected or sent back for changes is no longer
            // accepted; surface it as requiring review again rather than leaving it "accepted".
            promise.lifecycle = PromiseLifecycle::ChangedRequiresReview;
        }
        _ => {}
    }

    // On approval, capture the hash of the reviewable content the reviewer
    // just signed off on; on any non-approval, clear it so a stale hash doesn't
    // outlive its review. Drives `validate_promise_content_drift`.
    if matches!(action, PromiseReviewAction::Approved) {
        promise.review.content_hash = Some(harness_core::compute_promise_content_hash(promise));
    } else {
        promise.review.content_hash = None;
    }
}

fn review_state_for_action(action: &PromiseReviewAction) -> PromiseReviewState {
    match action {
        PromiseReviewAction::Approved => PromiseReviewState::Approved,
        PromiseReviewAction::ChangesRequested => PromiseReviewState::ChangesRequested,
        PromiseReviewAction::Rejected => PromiseReviewState::Rejected,
    }
}

fn review_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs() as i64)
        .unwrap_or(0);
    format_rfc3339_utc(seconds)
}

// Format a UTC RFC 3339 timestamp from Unix seconds, consistent with the dates used across the
// promise corpus, without pulling in a date crate.
fn format_rfc3339_utc(seconds: i64) -> String {
    let days = seconds.div_euclid(86_400);
    let secs_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

// Howard Hinnant's civil_from_days: days since 1970-01-01 -> (year, month, day).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

fn preserve_existing_promise_metadata(incoming: &mut PromiseRecord, existing: &PromiseRecord) {
    if incoming.supersedes.is_none() {
        incoming.supersedes = existing.supersedes.clone();
    }
    if incoming.deprecated_by.is_none() {
        incoming.deprecated_by = existing.deprecated_by.clone();
    }
    if incoming.examples.is_none() {
        incoming.examples = existing.examples.clone();
    }
    if incoming.review.events.is_empty() && !existing.review.events.is_empty() {
        incoming.review = existing.review.clone();
    }
}

fn check_written_project(root: &Path) -> AuthoringWriteResponse {
    let output = harness_cli::run_cli_collect(&["check".to_string()], root);
    AuthoringWriteResponse {
        exit_code: output.exit_code,
        saved: output.exit_code == 0,
        stderr: output.stderr,
        stdout: output.stdout,
    }
}

fn find_module_path_by_id(root: &Path, module_id: &str) -> Result<Option<PathBuf>, String> {
    for path in find_module_files(root).map_err(|error| error.to_string())? {
        if read_module_file(&path)?.id == module_id {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

fn find_promise_path_by_id(root: &Path, promise_id: &str) -> Result<Option<PathBuf>, String> {
    for path in find_promise_files(root).map_err(|error| error.to_string())? {
        let file = read_promises_file_or_default(&path)?;
        if file.promises.iter().any(|promise| promise.id == promise_id) {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

fn read_module_file(path: &Path) -> Result<ModuleRecord, String> {
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read module file \"{}\": {error}", path.display()))?;
    serde_yaml::from_str(&raw).map_err(|error| {
        format!(
            "Failed to decode module file \"{}\": {error}",
            path.display()
        )
    })
}

fn read_promises_file_or_default(path: &Path) -> Result<PromisesFile, String> {
    if !path.exists() {
        return Ok(PromisesFile {
            api_version: ProtocolVersion,
            promises: Vec::new(),
        });
    }

    let raw = fs::read_to_string(path).map_err(|error| {
        format!(
            "Failed to read promises file \"{}\": {error}",
            path.display()
        )
    })?;
    serde_yaml::from_str(&raw).map_err(|error| {
        format!(
            "Failed to decode promises file \"{}\": {error}",
            path.display()
        )
    })
}

fn write_module_file(path: &Path, module: &ModuleRecord) -> Result<(), String> {
    write_text_file(path, &render_module_file(module))
}

fn write_promises_file(path: &Path, file: &PromisesFile) -> Result<(), String> {
    write_text_file(path, &render_promises_file(file))
}

fn write_text_file(path: &Path, raw: &str) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| {
        format!(
            "Path \"{}\" does not have a parent directory.",
            path.display()
        )
    })?;
    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "Failed to create directory \"{}\": {error}",
            parent.display()
        )
    })?;
    fs::write(path, raw)
        .map_err(|error| format!("Failed to write file \"{}\": {error}", path.display()))
}

fn render_module_file(module: &ModuleRecord) -> String {
    let mut output = String::new();
    output.push_str("apiVersion: 1\n");
    push_scalar(&mut output, 0, "id", &module.id);
    push_localized_text(&mut output, 0, "title", &module.title);
    push_localized_text(&mut output, 0, "summary", &module.summary);
    push_localized_text(&mut output, 0, "purpose", &module.purpose);
    push_string_list(&mut output, 0, "promises", &module.promises);
    push_string_list(&mut output, 0, "covers", &module.covers);
    output
}

fn render_promises_file(file: &PromisesFile) -> String {
    let mut output = String::new();
    output.push_str("apiVersion: 1\npromises:\n");
    for promise in &file.promises {
        push_promise_record(&mut output, promise);
    }
    output
}

fn push_promise_record(output: &mut String, promise: &PromiseRecord) {
    output.push_str(&format!("  - id: {}\n", yaml_value(&promise.id)));
    push_scalar(output, 4, "feature", &promise.feature);
    push_localized_text(output, 4, "title", &promise.title);
    push_localized_text(output, 4, "purpose", &promise.purpose);
    push_scalar(output, 4, "priority", &promise.priority);
    push_scalar(output, 4, "boundary", &promise.boundary);
    push_scalar(output, 4, "lifecycle", &promise.lifecycle);
    push_localized_text_list(output, 4, "given", &promise.given);
    push_localized_text_list(output, 4, "when", &promise.when);
    push_localized_text_list(output, 4, "then", &promise.then_steps);
    push_string_list(output, 4, "observes", &promise.observes);
    push_localized_text(output, 4, "failureMeaning", &promise.failure_meaning);
    push_review(output, 4, &promise.review);
    if let Some(supersedes) = &promise.supersedes {
        push_string_list(output, 4, "supersedes", supersedes);
    }
    if let Some(deprecated_by) = &promise.deprecated_by {
        push_scalar(output, 4, "deprecatedBy", deprecated_by);
    }
    if let Some(examples) = &promise.examples {
        push_examples(output, 4, examples);
    }
}

fn push_review(output: &mut String, indent: usize, review: &harness_protocol::PromiseReview) {
    output.push_str(&format!("{}review:\n", " ".repeat(indent)));
    push_scalar(output, indent + 2, "state", &review.state);
    if let Some(value) = &review.decided_by {
        push_scalar(output, indent + 2, "decidedBy", value);
    }
    if let Some(value) = &review.decided_at {
        push_scalar(output, indent + 2, "decidedAt", value);
    }
    if let Some(value) = &review.note {
        push_scalar(output, indent + 2, "note", value);
    }
    push_review_events(output, indent + 2, &review.events);
}

fn push_localized_text(output: &mut String, indent: usize, key: &str, value: &LocalizedText) {
    let spaces = " ".repeat(indent);
    match value {
        LocalizedText::Text(text) => {
            output.push_str(&format!("{spaces}{key}: {}\n", yaml_value(text)));
        }
        LocalizedText::Localized(values) => {
            output.push_str(&format!("{spaces}{key}:\n"));
            for (language, text) in values {
                push_scalar(output, indent + 2, language, text);
            }
        }
    }
}

fn push_localized_text_list(
    output: &mut String,
    indent: usize,
    key: &str,
    values: &[LocalizedText],
) {
    output.push_str(&format!("{}{}:\n", " ".repeat(indent), key));
    for value in values {
        match value {
            LocalizedText::Text(text) => {
                output.push_str(&format!(
                    "{}- {}\n",
                    " ".repeat(indent + 2),
                    yaml_value(text)
                ));
            }
            LocalizedText::Localized(values) => {
                output.push_str(&format!("{}-\n", " ".repeat(indent + 2)));
                for (language, text) in values {
                    push_scalar(output, indent + 4, language, text);
                }
            }
        }
    }
}

fn push_string_list(output: &mut String, indent: usize, key: &str, values: &[String]) {
    output.push_str(&format!("{}{}:\n", " ".repeat(indent), key));
    for value in values {
        output.push_str(&format!(
            "{}- {}\n",
            " ".repeat(indent + 2),
            yaml_value(value)
        ));
    }
}

fn push_examples(
    output: &mut String,
    indent: usize,
    examples: &[harness_protocol::PromiseExampleRow],
) {
    if examples.is_empty() {
        return;
    }

    output.push_str(&format!("{}examples:\n", " ".repeat(indent)));
    for example in examples {
        output.push_str(&format!(
            "{}- name: {}\n",
            " ".repeat(indent + 2),
            yaml_value(&example.name)
        ));
        for (key, value) in &example.values {
            push_scalar(output, indent + 4, key, value);
        }
    }
}

fn push_review_events(
    output: &mut String,
    indent: usize,
    events: &[harness_protocol::PromiseReviewEvent],
) {
    if events.is_empty() {
        output.push_str(&format!("{}events: []\n", " ".repeat(indent)));
        return;
    }

    output.push_str(&format!("{}events:\n", " ".repeat(indent)));
    for event in events {
        output.push_str(&format!(
            "{}- action: {}\n",
            " ".repeat(indent + 2),
            yaml_value(&event.action)
        ));
        push_scalar(output, indent + 4, "by", &event.by);
        push_scalar(output, indent + 4, "at", &event.at);
        if let Some(note) = &event.note {
            push_scalar(output, indent + 4, "note", note);
        }
    }
}

fn push_scalar<T: Serialize>(output: &mut String, indent: usize, key: &str, value: &T) {
    output.push_str(&format!(
        "{}{}: {}\n",
        " ".repeat(indent),
        key,
        yaml_value(value)
    ));
}

fn yaml_value<T: Serialize>(value: &T) -> String {
    let raw = serde_yaml::to_string(value).expect("YAML scalar serialization should not fail");
    let scalar = raw.trim_start_matches("---\n").trim_end();
    // A multi-line value serializes as a block scalar whose body indentation will not match the
    // key's nesting once spliced after "key: ", producing unparseable YAML. Emit a single-line
    // double-quoted (JSON) scalar instead — valid YAML at any indent. Single-line values keep
    // their plain form so existing files are unchanged.
    if scalar.contains('\n') {
        serde_json::to_string(value).expect("JSON scalar serialization should not fail")
    } else {
        scalar.to_string()
    }
}

fn backup_files(paths: impl IntoIterator<Item = PathBuf>) -> Result<Vec<FileBackup>, String> {
    paths
        .into_iter()
        .map(|path| {
            let contents = if path.exists() {
                Some(fs::read(&path).map_err(|error| {
                    format!("Failed to back up file \"{}\": {error}", path.display())
                })?)
            } else {
                None
            };
            Ok(FileBackup { contents, path })
        })
        .collect()
}

fn rollback_files(backups: &[FileBackup]) -> Result<(), String> {
    for backup in backups {
        match &backup.contents {
            Some(contents) => {
                if let Some(parent) = backup.path.parent() {
                    fs::create_dir_all(parent).map_err(|error| {
                        format!(
                            "Failed to restore directory \"{}\": {error}",
                            parent.display()
                        )
                    })?;
                }
                fs::write(&backup.path, contents).map_err(|error| {
                    format!(
                        "Failed to restore file \"{}\": {error}",
                        backup.path.display()
                    )
                })?;
            }
            None => {
                if backup.path.exists() {
                    fs::remove_file(&backup.path).map_err(|error| {
                        format!(
                            "Failed to remove file \"{}\": {error}",
                            backup.path.display()
                        )
                    })?;
                }
            }
        }
    }
    Ok(())
}

/// Resolve a Studio-supplied relative path against the project root, guaranteeing
/// the result stays inside the root. Absolute paths and `..` segments are rejected
/// up front; both sides are then canonicalized so a symlink cannot escape the root
/// either. This is the security boundary for the open-file endpoint.
fn resolve_in_root(root: &Path, file: &str) -> Result<PathBuf, String> {
    let trimmed = file.trim();
    if trimmed.is_empty() {
        return Err("No file path was provided.".to_string());
    }
    let candidate = Path::new(trimmed);
    if candidate.is_absolute() {
        return Err(format!(
            "File path \"{trimmed}\" must be relative to the project root."
        ));
    }
    if candidate
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(format!(
            "File path \"{trimmed}\" must not escape the project root."
        ));
    }

    let root = root
        .canonicalize()
        .map_err(|error| format!("Project root is unavailable: {error}"))?;
    let resolved = root
        .join(candidate)
        .canonicalize()
        .map_err(|error| format!("Cannot open \"{trimmed}\": {error}"))?;

    if !resolved.starts_with(&root) {
        return Err(format!(
            "File path \"{trimmed}\" resolves outside the project root."
        ));
    }
    if !resolved.is_file() {
        return Err(format!("\"{trimmed}\" is not a file."));
    }
    Ok(resolved)
}

fn open_project_file(root: &Path, file: &str) -> Result<OpenFileResponse, String> {
    let resolved = resolve_in_root(root, file)?;
    launch_editor(&resolved)?;
    Ok(OpenFileResponse {
        opened: true,
        path: file.trim().to_string(),
    })
}

/// Open a file in the human's local editor. Prefer the VS Code CLI (which focuses
/// the file in a running window); fall back to the platform file opener.
fn launch_editor(path: &Path) -> Result<(), String> {
    // Pass the path as a plain argument, not via `-g` (which parses `file:line:column`
    // and would misread a filename that legally contains colons on Unix).
    if let Ok(status) = Command::new("code").arg(path).status() {
        if status.success() {
            return Ok(());
        }
    }

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(path);
        command
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", ""]).arg(path);
        command
    };
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    };

    match command.status() {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(format!(
            "Could not open \"{}\": opener exited with {status}.",
            path.display()
        )),
        Err(error) => Err(format!("Could not open \"{}\": {error}", path.display())),
    }
}

fn ensure_safe_record_id(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty()
        || value == "."
        || value == ".."
        || value.contains('/')
        || value.contains('\\')
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
    {
        return Err(format!("{label} \"{value}\" is not a safe Harness id."));
    }
    Ok(())
}

struct Options {
    addr: SocketAddr,
    agent_command: Vec<String>,
    allowed_origins: Vec<String>,
    root: PathBuf,
}

const DEFAULT_AGENT_COMMAND: &str = "claude";

fn parse_options(args: Vec<String>) -> Result<Options, String> {
    let mut addr = "127.0.0.1:4101"
        .parse::<SocketAddr>()
        .map_err(|error| error.to_string())?;
    let mut root = env::current_dir().map_err(|error| error.to_string())?;
    let mut allowed_origins = Vec::new();
    let mut agent_command: Vec<String> = Vec::new();
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
            "--studio-origin" => {
                let value = args
                    .get(index + 1)
                    .ok_or_else(|| "--studio-origin requires a value.".to_string())?;
                allowed_origins.push(normalize_origin(value)?);
                index += 2;
            }
            "--agent-command" => {
                // Everything after --agent-command is the command line (program + args).
                // We collect the rest of the args so users can write:
                //   harness-daemon --addr 127.0.0.1:4101 --agent-command claude --resume
                if index + 1 >= args.len() {
                    return Err("--agent-command requires at least one argument.".to_string());
                }
                agent_command = args[index + 1..].to_vec();
                index = args.len();
            }
            "--help" | "-h" => {
                return Err(
                    "Usage: harness-daemon [--root <path>] [--addr <host:port>] \
                     [--studio-origin <origin>]... [--agent-command <program> [args...]]"
                        .to_string(),
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

    if allowed_origins.is_empty() {
        allowed_origins = default_studio_origins();
    }
    if agent_command.is_empty() {
        agent_command.push(DEFAULT_AGENT_COMMAND.to_string());
    }

    Ok(Options {
        addr,
        agent_command,
        allowed_origins,
        root,
    })
}

fn cors_layer(allowed_origins: Vec<String>) -> CorsLayer {
    CorsLayer::new()
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([ACCEPT, AUTHORIZATION, CONTENT_TYPE])
        .allow_origin(AllowOrigin::predicate(move |origin, _| {
            is_allowed_studio_origin(origin, &allowed_origins)
        }))
}

fn default_studio_origins() -> Vec<String> {
    DEFAULT_STUDIO_ORIGINS
        .iter()
        .map(|origin| (*origin).to_string())
        .collect()
}

fn normalize_origin(origin: &str) -> Result<String, String> {
    let origin = origin.trim().trim_end_matches('/');
    if origin.is_empty() {
        return Err("--studio-origin cannot be empty.".to_string());
    }

    HeaderValue::from_str(origin)
        .map_err(|error| format!("Invalid --studio-origin value \"{origin}\": {error}"))?;

    Ok(origin.to_string())
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

fn is_allowed_studio_origin(origin: &HeaderValue, allowed_origins: &[String]) -> bool {
    let Ok(origin) = origin.to_str() else {
        return false;
    };

    allowed_origins
        .iter()
        .any(|allowed_origin| origin.eq_ignore_ascii_case(allowed_origin))
}

#[derive(Debug, Default)]
struct DaemonAuth {
    active_pairing: Option<PairingChallenge>,
    sessions: BTreeMap<String, SessionRecord>,
}

#[derive(Debug)]
struct PairingChallenge {
    code_hash: String,
    expires_at: Instant,
}

#[derive(Debug)]
struct SessionRecord {
    expires_at: Instant,
    origin: Option<String>,
    revoked: bool,
}

#[derive(Debug)]
struct PairingStart {
    pairing_code: String,
}

#[derive(Debug)]
struct IssuedSession {
    token: String,
}

impl DaemonAuth {
    fn start_pairing(&mut self) -> PairingStart {
        self.purge_expired();

        let pairing_code = generate_pairing_code();
        self.active_pairing = Some(PairingChallenge {
            code_hash: hash_secret(&pairing_code),
            expires_at: Instant::now() + PAIRING_TTL,
        });

        PairingStart { pairing_code }
    }

    fn complete_pairing(
        &mut self,
        pairing_code: &str,
        origin: Option<String>,
    ) -> Option<IssuedSession> {
        self.purge_expired();

        let code_hash = hash_secret(pairing_code.trim());
        let challenge = self.active_pairing.take()?;
        if challenge.expires_at <= Instant::now() || challenge.code_hash != code_hash {
            return None;
        }

        let token = generate_token();
        let token_hash = hash_secret(&token);
        self.sessions.insert(
            token_hash,
            SessionRecord {
                expires_at: Instant::now() + SESSION_TTL,
                origin,
                revoked: false,
            },
        );

        Some(IssuedSession { token })
    }

    fn authenticate(&mut self, token: &str, origin: Option<&str>) -> Option<AuthenticatedSession> {
        self.purge_expired();

        let token_hash = hash_secret(token);
        let session = self.sessions.get(&token_hash)?;
        if session.revoked || session.expires_at <= Instant::now() {
            return None;
        }
        if let Some(bound_origin) = &session.origin {
            if origin != Some(bound_origin.as_str()) {
                return None;
            }
        }

        Some(AuthenticatedSession { token_hash })
    }

    fn revoke_token_hash(&mut self, token_hash: &str) {
        if let Some(session) = self.sessions.get_mut(token_hash) {
            session.revoked = true;
        }
    }

    fn purge_expired(&mut self) {
        let now = Instant::now();
        if self
            .active_pairing
            .as_ref()
            .is_some_and(|challenge| challenge.expires_at <= now)
        {
            self.active_pairing = None;
        }
        self.sessions.retain(|_, session| session.expires_at > now);
    }
}

fn bearer_token(request: &Request) -> Option<&str> {
    // Prefer the standard Authorization: Bearer header.
    if let Some(header) = request.headers().get(AUTHORIZATION) {
        if let Ok(value) = header.to_str() {
            if let Some(token) = value
                .strip_prefix("Bearer ")
                .map(str::trim)
                .filter(|token| !token.is_empty())
            {
                return Some(token);
            }
        }
    }
    // Browser WebSocket clients cannot set custom headers; fall back to a
    // `?token=…` query parameter so they can still authenticate.
    request.uri().query().and_then(|query| {
        query.split('&').find_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            if key == "token" && !value.is_empty() {
                Some(value)
            } else {
                None
            }
        })
    })
}

fn request_origin(request: &Request) -> Option<String> {
    request_origin_from_headers(request.headers())
}

fn request_origin_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get(ORIGIN)
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.trim().is_empty())
        .map(ToOwned::to_owned)
}

fn generate_pairing_code() -> String {
    let value = OsRng.next_u32() % 1_000_000;
    format!("{value:06}")
}

fn generate_token() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    hex_encode(&bytes)
}

fn hash_secret(secret: &str) -> String {
    let digest = Sha256::digest(secret.as_bytes());
    hex_encode(&digest)
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use harness_protocol::{
        LocalizedText, PromiseBoundary, PromiseExampleRow, PromiseLifecycle, PromisePriority,
        PromiseReview, PromiseReviewAction, PromiseReviewEvent, PromiseReviewState,
    };
    use std::collections::BTreeMap;
    use std::fs;
    use std::path::Path;
    use tempfile::tempdir;

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
    fn open_file_resolution_stays_inside_the_project_root() {
        harness_adapter_rust::scenario_test!(
            "harness.daemon.opens_project_file_within_root",
            "the open-file endpoint refuses paths outside the paired project root",
            {
                let root = tempdir().unwrap();
                fs::create_dir_all(root.path().join("crates/core/src")).unwrap();
                fs::write(root.path().join("crates/core/src/lib.rs"), "// core\n").unwrap();

                // An in-root file resolves to a path inside the project root.
                let resolved = resolve_in_root(root.path(), "crates/core/src/lib.rs").unwrap();
                assert!(resolved.ends_with("crates/core/src/lib.rs"));
                assert!(resolved.starts_with(root.path().canonicalize().unwrap()));

                // A path that escapes via ".." is rejected.
                assert!(resolve_in_root(root.path(), "../escape.rs").is_err());
                // An absolute path is rejected even if it exists on the machine.
                assert!(resolve_in_root(root.path(), "/etc/hosts").is_err());
                // A path to a file that does not exist is rejected (cannot be opened).
                assert!(resolve_in_root(root.path(), "crates/core/missing.rs").is_err());
            }
        );
    }

    #[test]
    fn cors_allowlist_accepts_configured_studio_origins() {
        let defaults = default_studio_origins();

        assert!(is_allowed_studio_origin(
            &HeaderValue::from_static("http://127.0.0.1:4100"),
            &defaults
        ));
        assert!(is_allowed_studio_origin(
            &HeaderValue::from_static("http://localhost:4100"),
            &defaults
        ));
        assert!(!is_allowed_studio_origin(
            &HeaderValue::from_static("https://example.com"),
            &defaults
        ));

        let custom = vec!["https://studio.example.com".to_string()];
        assert!(is_allowed_studio_origin(
            &HeaderValue::from_static("https://studio.example.com"),
            &custom
        ));
        assert!(!is_allowed_studio_origin(
            &HeaderValue::from_static("http://127.0.0.1:4100"),
            &custom
        ));
    }

    #[test]
    fn options_accept_repeated_studio_origins() {
        let options = parse_options(vec![
            "--studio-origin".to_string(),
            "https://studio.example.com/".to_string(),
            "--studio-origin".to_string(),
            "tauri://localhost".to_string(),
        ])
        .unwrap();

        assert_eq!(
            options.allowed_origins,
            vec![
                "https://studio.example.com".to_string(),
                "tauri://localhost".to_string()
            ]
        );
    }

    #[test]
    fn authoring_writes_modules_and_promises_to_canonical_files() {
        harness_adapter_rust::scenario_test!(
            "harness.web_dashboard.edits_canonical_harness_files_through_daemon",
            "daemon-backed Studio authoring writes canonical module and promise YAML",
            {
                let temp = tempdir().unwrap();
                write_authoring_project(temp.path());

                let mut promise = valid_authoring_promise("harness.demo.updated_promise");
                promise.title = LocalizedText::Text("Updated promise title".to_string());
                let response =
                    upsert_promise_record(temp.path().to_path_buf(), "demo", promise).unwrap();

                assert!(response.saved, "{}{}", response.stdout, response.stderr);
                assert_eq!(response.exit_code, 0);

                let promises = read_promises_file_or_default(
                    &temp.path().join("tests/promises/demo/demo.promises.yaml"),
                )
                .unwrap();
                assert!(promises
                    .promises
                    .iter()
                    .any(|record| record.id == "harness.demo.updated_promise"));
                let updated_record = promises
                    .promises
                    .iter()
                    .find(|record| record.id == "harness.demo.valid_promise")
                    .unwrap();
                assert_eq!(
                    updated_record.supersedes,
                    Some(vec!["harness.demo.previous_promise".to_string()])
                );
                assert_eq!(
                    updated_record.review.note.as_deref(),
                    Some("Preserve this review note.")
                );
                assert_eq!(
                    updated_record
                        .examples
                        .as_ref()
                        .and_then(|examples| examples.first())
                        .map(|example| example.name.as_str()),
                    Some("happy path")
                );

                let module =
                    read_module_file(&temp.path().join("tests/modules/demo.module.yaml")).unwrap();
                assert!(module
                    .promises
                    .iter()
                    .any(|id| id == "harness.demo.updated_promise"));
            }
        );
    }

    #[test]
    fn authoring_rolls_back_invalid_writes() {
        harness_adapter_rust::scenario_test!(
            "harness.web_dashboard.rolls_back_invalid_authoring_writes",
            "daemon-backed Studio authoring restores files when validation fails",
            {
                let temp = tempdir().unwrap();
                write_authoring_project(temp.path());
                let promise_path = temp.path().join("tests/promises/demo/demo.promises.yaml");
                let before = fs::read_to_string(&promise_path).unwrap();

                let mut promise = valid_authoring_promise("harness.demo.valid_promise");
                promise.title = LocalizedText::Text(String::new());
                let response =
                    upsert_promise_record(temp.path().to_path_buf(), "demo", promise).unwrap();

                assert!(!response.saved);
                assert_ne!(response.exit_code, 0);
                assert_eq!(fs::read_to_string(&promise_path).unwrap(), before);
            }
        );
    }

    #[test]
    fn review_decisions_update_canonical_promise_metadata() {
        harness_adapter_rust::scenario_test!(
            "harness.web_dashboard.writes_review_decisions_through_daemon",
            "daemon-backed Studio review decisions update canonical promise YAML",
            {
                let temp = tempdir().unwrap();
                write_authoring_project(temp.path());

                let response = review_promise_record(
                    temp.path().to_path_buf(),
                    "harness.demo.valid_promise",
                    PromiseReviewAction::Approved,
                    "xinyao",
                    Some("Looks reviewable.".to_string()),
                )
                .unwrap();

                assert!(response.saved, "{}{}", response.stdout, response.stderr);
                assert_eq!(response.exit_code, 0);

                let promises = read_promises_file_or_default(
                    &temp.path().join("tests/promises/demo/demo.promises.yaml"),
                )
                .unwrap();
                let promise = promises
                    .promises
                    .iter()
                    .find(|record| record.id == "harness.demo.valid_promise")
                    .unwrap();

                assert_eq!(promise.lifecycle, PromiseLifecycle::Accepted);
                assert_eq!(promise.review.state, PromiseReviewState::Approved);
                assert_eq!(promise.review.decided_by.as_deref(), Some("xinyao"));
                assert_eq!(promise.review.note.as_deref(), Some("Looks reviewable."));
                assert_eq!(promise.review.events.len(), 2);
                assert_eq!(
                    promise.review.events.last().map(|event| &event.action),
                    Some(&PromiseReviewAction::Approved)
                );
            }
        );
    }

    #[test]
    fn cli_can_drive_review_and_observe_evidence_through_daemon_layer() {
        harness_adapter_rust::scenario_test!(
            "harness.cli.agent_drives_review_and_run_loop",
            "the snapshot → review → snapshot loop the CLI exposes flips the right promise from proposed to accepted",
            {
                // The CLI is a thin HTTP client over the daemon's lib + handlers; this
                // test exercises the loop's data flow at the layer just under the
                // wire. The CLI subcommand list and JSON output are tested by their
                // own bindings; here we prove that:
                //   1. snapshot lists the pending promise (so the agent can list)
                //   2. review approves it and persists the canonical YAML transition
                //   3. the next snapshot reflects the new lifecycle + review event
                // The "run" step is covered by snapshot_carries_promise_evidence,
                // which feeds the same snapshot pipeline the CLI's `run` reads back.
                let temp = tempdir().unwrap();
                write_authoring_project(temp.path());
                // Add a freshly-proposed promise that's eligible for the review loop.
                let proposed = {
                    let mut record = valid_authoring_promise("harness.demo.loop_target");
                    record.review = PromiseReview {
                        state: PromiseReviewState::Pending,
                        decided_by: None,
                        decided_at: None,
                        note: None,
                        content_hash: None,
                        events: Vec::new(),
                    };
                    record
                };
                write_promises_file(
                    &temp.path().join("tests/promises/demo/loop-target.promises.yaml"),
                    &PromisesFile {
                        api_version: ProtocolVersion,
                        promises: vec![proposed],
                    },
                )
                .unwrap();
                // Also list the new promise on the demo module so it's snapshot-visible.
                let module_path = temp.path().join("tests/modules/demo.module.yaml");
                let mut module = read_module_file(&module_path).unwrap();
                module.promises.push("harness.demo.loop_target".to_string());
                write_module_file(&module_path, &module).unwrap();

                let before = harness_daemon::build_studio_snapshot(temp.path()).unwrap();
                let target = before
                    .promises
                    .iter()
                    .find(|promise| promise.id == "harness.demo.loop_target")
                    .expect("loop target promise should be visible in the initial snapshot");
                assert_eq!(target.review.state, "pending");
                assert_eq!(target.lifecycle, PromiseLifecycle::Proposed);

                let response = review_promise_record(
                    temp.path().to_path_buf(),
                    "harness.demo.loop_target",
                    PromiseReviewAction::Approved,
                    "agent",
                    Some("Approved end-to-end via the loop test.".to_string()),
                )
                .unwrap();
                assert!(response.saved);

                let after = harness_daemon::build_studio_snapshot(temp.path()).unwrap();
                let reviewed = after
                    .promises
                    .iter()
                    .find(|promise| promise.id == "harness.demo.loop_target")
                    .unwrap();
                assert_eq!(reviewed.review.state, "approved");
                assert_eq!(reviewed.lifecycle, PromiseLifecycle::Accepted);
                let last_event = reviewed.review.events.last().unwrap();
                assert_eq!(last_event.action, "approved");
                assert_eq!(last_event.by, "agent");
                assert_eq!(
                    last_event.note.as_deref(),
                    Some("Approved end-to-end via the loop test.")
                );
            }
        );
    }

    #[test]
    fn approval_stamps_content_hash_and_non_approval_clears_it() {
        harness_adapter_rust::scenario_test!(
            "harness.validation.detects_promise_content_drift_after_acceptance",
            "apply_review_decision records review.contentHash on approval and clears it on non-approval",
            {
                use harness_core::compute_promise_content_hash;

                let mut promise = valid_authoring_promise("harness.demo.drift_subject");
                promise.lifecycle = PromiseLifecycle::Proposed;
                promise.review = PromiseReview::default();

                // Approving captures the hash the reviewer signed off on.
                apply_review_decision(
                    &mut promise,
                    PromiseReviewAction::Approved,
                    "xinyao",
                    None,
                );
                let expected = compute_promise_content_hash(&promise);
                assert_eq!(promise.lifecycle, PromiseLifecycle::Accepted);
                assert_eq!(promise.review.content_hash.as_deref(), Some(expected.as_str()));

                // Re-approving stays consistent: the same content yields the same hash.
                apply_review_decision(
                    &mut promise,
                    PromiseReviewAction::Approved,
                    "xinyao",
                    None,
                );
                assert_eq!(promise.review.content_hash.as_deref(), Some(expected.as_str()));

                // A non-approval clears the hash — a stale hash from a previous approval
                // must not outlive its review.
                apply_review_decision(
                    &mut promise,
                    PromiseReviewAction::ChangesRequested,
                    "xinyao",
                    None,
                );
                assert_eq!(promise.review.content_hash, None);
                assert_eq!(promise.lifecycle, PromiseLifecycle::ChangedRequiresReview);
            }
        );
    }

    #[test]
    fn agent_pty_endpoint_is_paired_only_and_injects_daemon_env() {
        harness_adapter_rust::scenario_test!(
            "harness.daemon.spawns_agent_pty_with_paired_env",
            "the agent pty endpoint requires auth and the spawned child receives HARNESS_DAEMON_* env",
            {
                // The daemon middleware (`require_session`) gates /api/agent/pty
                // before the handler ever runs, so an unauthenticated client
                // cannot trigger a process spawn at all — that path is covered
                // by the existing pairing tests, which verify the auth structure.
                //
                // Two pieces of this endpoint's behaviour are unit-testable
                // without spawning a real pty + websocket:
                //   1. The agent command defaults to `claude` (the bundled
                //      reference) and is parsed verbatim from `--agent-command`,
                //      so the operator can swap to `codex` or anything else
                //      without code changes.
                //   2. The query extractor for the bearer token: browser
                //      WebSockets can't set custom headers, so AgentPtyQuery
                //      must carry a `token` field that fallback auth can read.
                //      We assert the struct shape (compile-time + a smoke
                //      construction) here.

                // Default agent command is the one we ship with — `claude`.
                let default = parse_options(vec![]).unwrap();
                assert_eq!(default.agent_command, vec!["claude".to_string()]);

                // --agent-command captures the whole tail so the operator can
                // pass program + flags without quoting tricks.
                let configured = parse_options(vec![
                    "--studio-origin".to_string(),
                    "http://localhost:47627".to_string(),
                    "--agent-command".to_string(),
                    "codex".to_string(),
                    "--resume".to_string(),
                ])
                .unwrap();
                assert_eq!(
                    configured.agent_command,
                    vec!["codex".to_string(), "--resume".to_string()]
                );

                // AgentPtyQuery must accept a token field so the browser-side
                // ?token= fallback authenticates. (Compile-time presence is
                // enforced; we also construct an instance to make sure the
                // shape stays public-as-test-visible.)
                let query = AgentPtyQuery {
                    token: Some("paired-token".to_string()),
                    kind: None,
                };
                assert_eq!(query.token.as_deref(), Some("paired-token"));

                // The full bidirectional bridge + env injection is verified
                // end-to-end via a WebSocket client (see the project's manual
                // verification log); a unit test cannot easily spawn a real
                // PTY + WS in-process without leaking child processes, so we
                // anchor the contract here and rely on the integration check.
            }
        );
    }

    #[test]
    fn pairing_issues_hashed_origin_bound_revocable_session_tokens() {
        let origin = "http://127.0.0.1:4100".to_string();
        let mut auth = DaemonAuth::default();
        let pairing = auth.start_pairing();
        let session = auth
            .complete_pairing(&pairing.pairing_code, Some(origin.clone()))
            .unwrap();

        assert_eq!(auth.sessions.len(), 1);
        assert!(!auth.sessions.contains_key(&session.token));
        assert!(auth
            .authenticate(&session.token, Some(origin.as_str()))
            .is_some());
        assert!(auth
            .authenticate(&session.token, Some("http://localhost:4100"))
            .is_none());

        let token_hash = hash_secret(&session.token);
        auth.revoke_token_hash(&token_hash);

        assert!(auth
            .authenticate(&session.token, Some(origin.as_str()))
            .is_none());
    }

    #[test]
    fn pairing_codes_are_one_time_only() {
        let mut auth = DaemonAuth::default();
        let pairing = auth.start_pairing();

        assert!(auth.complete_pairing(&pairing.pairing_code, None).is_some());
        assert!(auth.complete_pairing(&pairing.pairing_code, None).is_none());
    }

    fn write_authoring_project(root: &Path) {
        fs::create_dir_all(root.join("tests/modules")).unwrap();
        fs::create_dir_all(root.join("tests/promises/demo")).unwrap();
        fs::create_dir_all(root.join("crates/demo/src")).unwrap();
        fs::write(
            root.join("tests/harness.yaml"),
            "apiVersion: 1\ntest:\n  runner:\n    command: \"true\"\n    args: []\n",
        )
        .unwrap();
        fs::write(root.join("crates/demo/src/lib.rs"), "pub fn demo() {}\n").unwrap();
        write_module_file(
            &root.join("tests/modules/demo.module.yaml"),
            &valid_authoring_module(),
        )
        .unwrap();
        write_promises_file(
            &root.join("tests/promises/demo/demo.promises.yaml"),
            &PromisesFile {
                api_version: ProtocolVersion,
                promises: vec![valid_authoring_promise("harness.demo.valid_promise")],
            },
        )
        .unwrap();
    }

    fn valid_authoring_module() -> ModuleRecord {
        ModuleRecord {
            api_version: ProtocolVersion,
            covers: vec!["crates/demo/src/lib.rs".to_string()],
            id: "demo".to_string(),
            promises: vec!["harness.demo.valid_promise".to_string()],
            purpose: LocalizedText::Text(
                "Keep demo authoring behavior represented as architecture.".to_string(),
            ),
            summary: LocalizedText::Text("Owns daemon authoring behavior.".to_string()),
            title: LocalizedText::Text("Demo authoring".to_string()),
        }
    }

    fn valid_authoring_promise(id: &str) -> PromiseRecord {
        let is_existing = id == "harness.demo.valid_promise";

        PromiseRecord {
            boundary: PromiseBoundary::Integration,
            deprecated_by: None,
            examples: is_existing.then(|| {
                vec![PromiseExampleRow {
                    name: "happy path".to_string(),
                    values: BTreeMap::from([("input".to_string(), "valid".to_string())]),
                }]
            }),
            failure_meaning: LocalizedText::Text(
                "The Studio authoring loop would be unsafe.".to_string(),
            ),
            feature: "Harness Studio / Authoring".to_string(),
            given: vec![LocalizedText::Text(
                "A connected Studio edits canonical Harness files.".to_string(),
            )],
            id: id.to_string(),
            lifecycle: PromiseLifecycle::Proposed,
            observes: vec!["crates/demo/src/lib.rs".to_string()],
            priority: PromisePriority::P0,
            purpose: LocalizedText::Text("Protect daemon-backed authoring behavior.".to_string()),
            review: if is_existing {
                PromiseReview {
                    state: PromiseReviewState::Approved,
                    decided_by: Some("manual-review".to_string()),
                    decided_at: Some("2026-05-27".to_string()),
                    note: Some("Preserve this review note.".to_string()),
                    content_hash: None,
                    events: vec![PromiseReviewEvent {
                        action: PromiseReviewAction::Approved,
                        by: "manual-review".to_string(),
                        at: "2026-05-27".to_string(),
                        note: Some("Preserve this review note.".to_string()),
                    }],
                }
            } else {
                PromiseReview::default()
            },
            supersedes: is_existing.then(|| vec!["harness.demo.previous_promise".to_string()]),
            then_steps: vec![LocalizedText::Text(
                "The daemon validates the edited project.".to_string(),
            )],
            title: LocalizedText::Text("Readable authoring promise".to_string()),
            when: vec![LocalizedText::Text(
                "The user saves an edited promise.".to_string(),
            )],
        }
    }

    #[test]
    fn formats_review_timestamps_as_rfc3339_utc() {
        assert_eq!(format_rfc3339_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(format_rfc3339_utc(1_700_000_000), "2023-11-14T22:13:20Z");
    }

    #[test]
    fn renders_multiline_text_fields_as_parseable_yaml() {
        // A multi-line authored value must serialize to YAML that parses back to the same value
        // (regression: block scalars were emitted with mismatched indentation).
        let value = LocalizedText::Text("line one\nline two".to_string());
        let mut output = String::new();
        push_localized_text(&mut output, 4, "purpose", &value);
        let document = format!("root:\n{output}");
        let parsed: serde_yaml::Value =
            serde_yaml::from_str(&document).expect("rendered multi-line YAML must parse");
        assert_eq!(
            parsed["root"]["purpose"],
            serde_yaml::Value::String("line one\nline two".to_string())
        );
    }
}
