use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Extension, Query, Request, State};
use axum::http::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HOST, ORIGIN};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode};
use axum::middleware::{from_fn_with_state, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use harness_daemon::{
    build_studio_snapshot, empty_snapshot, known_projects, resolve_project_root, review_rule,
    KnownProject, StudioRuleReviewInput,
};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::env;
use std::net::SocketAddr;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
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
    /// Per-tool command lines for /api/agent/pty?kind=agent&agent=…. Each
    /// tool is identified by its `AgentTool` variant and resolved to the
    /// binary the daemon should spawn (defaults to the tool's own name).
    agent_commands: AgentCommands,
}

/// The set of agent CLIs the daemon knows how to spawn. Each entry is the
/// command line for one tool; the studio picks which one to launch on a
/// per-card basis via `?agent=…`.
#[derive(Debug, Clone)]
struct AgentCommands {
    claude: Vec<String>,
    codex: Vec<String>,
    cursor: Vec<String>,
}

impl AgentCommands {
    fn default_for(tool: AgentTool) -> Vec<String> {
        match tool {
            AgentTool::Claude => vec!["claude".to_string()],
            AgentTool::Codex => vec!["codex".to_string()],
            AgentTool::Cursor => vec!["cursor-agent".to_string()],
        }
    }

    fn defaults() -> Self {
        Self {
            claude: Self::default_for(AgentTool::Claude),
            codex: Self::default_for(AgentTool::Codex),
            cursor: Self::default_for(AgentTool::Cursor),
        }
    }

    fn for_tool(&self, tool: AgentTool) -> Vec<String> {
        match tool {
            AgentTool::Claude => self.claude.clone(),
            AgentTool::Codex => self.codex.clone(),
            AgentTool::Cursor => self.cursor.clone(),
        }
    }
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
struct OpenFileRequest {
    project_id: Option<String>,
    file: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviewRuleRequest {
    project_id: Option<String>,
    #[serde(flatten)]
    input: StudioRuleReviewInput,
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
        agent_commands: options.agent_commands,
    };
    let protected_routes = Router::new()
        .route("/api/projects", get(projects))
        .route("/api/snapshot", get(snapshot))
        .route("/api/run/tests", post(run_tests))
        .route("/api/studio/review-rule", post(review_rule_action))
        .route("/api/studio/open", post(open_file))
        .route("/api/agent/pty", get(agent_pty))
        .route("/api/session/revoke", post(revoke_session))
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

async fn review_rule_action(
    State(state): State<AppState>,
    Json(request): Json<ReviewRuleRequest>,
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

    match tokio::task::spawn_blocking(move || review_rule(root, request.input)).await {
        Ok(Ok(outcome)) => (StatusCode::OK, Json(outcome)).into_response(),
        Ok(Err(error)) => error_response(StatusCode::BAD_REQUEST, error),
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
            "agent pty endpoint requires a bearer token (Authorization header or ?token=)."
                .to_string(),
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
        // `kind=agent` always pairs with a specific `agent=…` choice; default
        // to Claude when the client omits it so the toolbar's bare "agent"
        // entry still has somewhere to go.
        PtyKind::Agent => state
            .agent_commands
            .for_tool(query.agent.unwrap_or(AgentTool::Claude)),
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
    /// Only meaningful when `kind=agent` — picks which CLI to spawn. Ignored
    /// for `kind=terminal`, which always spawns the user's shell.
    agent: Option<AgentTool>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum PtyKind {
    /// Spawn the agent CLI selected by the companion `agent` query param
    /// (claude / codex / cursor). Default if the client doesn't pass
    /// `?kind=`, so the toolbar's "Hand to Agent" path keeps working.
    Agent,
    /// Spawn the user's interactive shell ($SHELL → bash → sh). The pty still
    /// inherits HARNESS_DAEMON_* env, so `harness studio …` works directly
    /// inside the shell with no extra setup.
    Terminal,
}

/// Which agent CLI to spawn when `kind=agent`. Each variant maps to a
/// `Vec<String>` command line on `AgentCommands`; the daemon picks the
/// command, the studio picks the kind.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum AgentTool {
    Claude,
    Codex,
    Cursor,
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

struct Options {
    addr: SocketAddr,
    agent_commands: AgentCommands,
    allowed_origins: Vec<String>,
    root: PathBuf,
}

fn parse_options(args: Vec<String>) -> Result<Options, String> {
    let mut addr = "127.0.0.1:4101"
        .parse::<SocketAddr>()
        .map_err(|error| error.to_string())?;
    let mut root = env::current_dir().map_err(|error| error.to_string())?;
    let mut allowed_origins = Vec::new();
    let mut agent_commands = AgentCommands::defaults();
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
            // Per-tool overrides. Each takes a single whitespace-separated
            // command line (e.g. `--claude-command "claude --resume"`) — kept
            // single-arg so the operator can mix and match overrides on the
            // same command line without one flag swallowing another's tail.
            flag @ ("--claude-command" | "--codex-command" | "--cursor-command") => {
                let value = args
                    .get(index + 1)
                    .ok_or_else(|| format!("{flag} requires a value."))?;
                let parts: Vec<String> = value
                    .split_whitespace()
                    .map(|part| part.to_string())
                    .collect();
                if parts.is_empty() {
                    return Err(format!("{flag} value is empty."));
                }
                match flag {
                    "--claude-command" => agent_commands.claude = parts,
                    "--codex-command" => agent_commands.codex = parts,
                    "--cursor-command" => agent_commands.cursor = parts,
                    _ => unreachable!(),
                }
                index += 2;
            }
            "--help" | "-h" => {
                return Err(
                    "Usage: harness-daemon [--root <path>] [--addr <host:port>] \
                     [--studio-origin <origin>]... \
                     [--claude-command <cmd>] [--codex-command <cmd>] [--cursor-command <cmd>]"
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

    Ok(Options {
        addr,
        agent_commands,
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
