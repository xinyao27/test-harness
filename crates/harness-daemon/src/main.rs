use axum::extract::{Extension, Query, Request, State};
use axum::http::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HOST, ORIGIN};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode};
use axum::middleware::{from_fn_with_state, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use harness_daemon::{
    build_studio_snapshot, empty_snapshot, known_projects, resolve_project_root, KnownProject,
};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::env;
use std::net::SocketAddr;
use std::path::PathBuf;
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
    let state = AppState {
        allowed_hosts: allowed_hosts(options.addr),
        auth: Arc::new(Mutex::new(DaemonAuth::default())),
        workspace_root: options.root,
    };
    let protected_routes = Router::new()
        .route("/api/projects", get(projects))
        .route("/api/snapshot", get(snapshot))
        .route("/api/run/tests", post(run_tests))
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

struct Options {
    addr: SocketAddr,
    allowed_origins: Vec<String>,
    root: PathBuf,
}

fn parse_options(args: Vec<String>) -> Result<Options, String> {
    let mut addr = "127.0.0.1:4101"
        .parse::<SocketAddr>()
        .map_err(|error| error.to_string())?;
    let mut root = env::current_dir().map_err(|error| error.to_string())?;
    let mut allowed_origins = Vec::new();
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
            "--help" | "-h" => {
                return Err(
                    "Usage: harness-daemon [--root <path>] [--addr <host:port>] [--studio-origin <origin>]..."
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
    request
        .headers()
        .get(AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|token| !token.is_empty())
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
}
