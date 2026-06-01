//! `harness studio …` subcommands — a thin HTTP client over the local daemon.
//!
//! Every Studio operation exposed via daemon HTTP has a matching CLI subcommand
//! here; writes route through the daemon so backup/rollback/checker run exactly
//! once, in one place. The Cucumber rewrite keeps this surface read/run/open
//! oriented until Feature/Rule state editing is redesigned.

use std::collections::BTreeMap;
use std::env;
use std::io::{IsTerminal, Write};

const ENV_DAEMON_URL: &str = "HARNESS_DAEMON_URL";
const ENV_DAEMON_TOKEN: &str = "HARNESS_DAEMON_TOKEN";
const ENV_DAEMON_ORIGIN: &str = "HARNESS_DAEMON_ORIGIN";

const USAGE: &str = "Usage: harness studio <subcommand> [flags]\n\
                     \n\
                     Subcommands:\n\
                       snapshot      [--project ID] [--json]\n\
                       projects      [--json]\n\
                       run           [--project ID] [--json]\n\
                       open          FILE [--project ID]";

/// Entry point: dispatched from `run_cli_main` when the user runs `harness studio …`.
pub fn run(args: &[String], stdout: &mut dyn Write, stderr: &mut dyn Write) -> i32 {
    let Some(subcommand) = args.first() else {
        let _ = writeln!(stderr, "{USAGE}");
        return 2;
    };
    let rest = &args[1..];

    match subcommand.as_str() {
        "snapshot" => cmd_snapshot(rest, stdout, stderr),
        "projects" => cmd_projects(rest, stdout, stderr),
        "run" => cmd_run(rest, stdout, stderr),
        "open" => cmd_open(rest, stdout, stderr),
        "--help" | "-h" | "help" => {
            let _ = writeln!(stdout, "{USAGE}");
            0
        }
        other => {
            let _ = writeln!(stderr, "Unknown studio subcommand: {other}\n\n{USAGE}");
            2
        }
    }
}

// -------------------------------------------------------------------------
// Daemon config (env-based, never re-pairs)
// -------------------------------------------------------------------------

#[derive(Debug)]
struct DaemonConfig {
    url: String,
    token: String,
    origin: String,
}

fn load_daemon_config() -> Result<DaemonConfig, String> {
    let url = require_env(ENV_DAEMON_URL)?;
    let token = require_env(ENV_DAEMON_TOKEN)?;
    let origin = require_env(ENV_DAEMON_ORIGIN)?;
    Ok(DaemonConfig { url, token, origin })
}

fn require_env(name: &str) -> Result<String, String> {
    match env::var(name) {
        Ok(value) if !value.trim().is_empty() => Ok(value),
        _ => Err(format!(
            "{name} is not set or is empty. Open Studio → Settings → Daemon to pair this \
             machine, then re-launch the agent panel so the env vars get injected."
        )),
    }
}

// -------------------------------------------------------------------------
// Tiny HTTP helpers (ureq, blocking)
// -------------------------------------------------------------------------

fn http_get(
    config: &DaemonConfig,
    path: &str,
    query: &[(&str, String)],
) -> Result<serde_json::Value, String> {
    let url = format!("{}{path}", config.url.trim_end_matches('/'));
    let mut req = ureq::get(&url)
        .set("Accept", "application/json")
        .set("Authorization", &format!("Bearer {}", config.token))
        .set("Origin", &config.origin);
    for (key, value) in query {
        req = req.query(key, value);
    }
    finish_request(req.call())
}

fn http_post(
    config: &DaemonConfig,
    path: &str,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let url = format!("{}{path}", config.url.trim_end_matches('/'));
    let req = ureq::post(&url)
        .set("Accept", "application/json")
        .set("Authorization", &format!("Bearer {}", config.token))
        .set("Origin", &config.origin)
        .set("Content-Type", "application/json");
    finish_request(req.send_string(&body.to_string()))
}

fn finish_request(
    result: Result<ureq::Response, ureq::Error>,
) -> Result<serde_json::Value, String> {
    match result {
        Ok(response) => response
            .into_json::<serde_json::Value>()
            .map_err(|error| format!("daemon response was not valid JSON: {error}")),
        Err(ureq::Error::Status(status, response)) => {
            let body = response.into_string().unwrap_or_default();
            // Surface the daemon's structured error message if present.
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                if let Some(message) = json
                    .get("error")
                    .and_then(|err| err.get("message"))
                    .and_then(|message| message.as_str())
                {
                    return Err(format!("daemon HTTP {status}: {message}"));
                }
            }
            Err(format!("daemon HTTP {status}: {body}"))
        }
        Err(ureq::Error::Transport(transport)) => {
            let url = transport
                .url()
                .map(|url| url.as_str().to_string())
                .unwrap_or_else(|| "?".to_string());
            Err(format!(
                "daemon at {url} is unreachable: {transport}\nIs the harness daemon running?"
            ))
        }
    }
}

// -------------------------------------------------------------------------
// Output: machine-parseable JSON when piped or --json, human-readable otherwise
// -------------------------------------------------------------------------

fn should_emit_json(json_flag: bool, stdout_is_terminal: bool) -> bool {
    json_flag || !stdout_is_terminal
}

fn emit_json(value: &serde_json::Value, out: &mut dyn Write) {
    let rendered = serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string());
    let _ = writeln!(out, "{rendered}");
}

fn fail(stderr: &mut dyn Write, message: impl std::fmt::Display) -> i32 {
    let _ = writeln!(stderr, "error: {message}");
    1
}

// -------------------------------------------------------------------------
// Tiny flag/positional parser shared by all subcommands
// -------------------------------------------------------------------------

#[derive(Debug, Default)]
struct Parsed {
    positionals: Vec<String>,
    flags: BTreeMap<String, String>,
    bool_flags: BTreeMap<String, bool>,
}

/// Parse a subcommand's arguments. `value_flags` are flags that take a value
/// (`--flag VALUE` or `--flag=VALUE`); everything else recognized is treated as
/// a boolean (`--json`).
fn parse_flags(
    args: &[String],
    value_flags: &[&str],
    bool_flags: &[&str],
) -> Result<Parsed, String> {
    let value_set: std::collections::HashSet<&str> = value_flags.iter().copied().collect();
    let bool_set: std::collections::HashSet<&str> = bool_flags.iter().copied().collect();
    let mut parsed = Parsed::default();
    let mut index = 0;
    while index < args.len() {
        let arg = &args[index];
        if let Some(equals) = arg.find('=') {
            let key = &arg[..equals];
            let value = &arg[equals + 1..];
            if value_set.contains(key) {
                parsed.flags.insert(key.to_string(), value.to_string());
                index += 1;
                continue;
            }
        }
        if value_set.contains(arg.as_str()) {
            let value = args
                .get(index + 1)
                .ok_or_else(|| format!("{arg} requires a value"))?;
            parsed.flags.insert(arg.clone(), value.clone());
            index += 2;
            continue;
        }
        if bool_set.contains(arg.as_str()) {
            parsed.bool_flags.insert(arg.clone(), true);
            index += 1;
            continue;
        }
        if arg.starts_with("--") {
            return Err(format!("unknown flag {arg}"));
        }
        parsed.positionals.push(arg.clone());
        index += 1;
    }
    Ok(parsed)
}

// -------------------------------------------------------------------------
// Subcommands
// -------------------------------------------------------------------------

fn cmd_snapshot(args: &[String], out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    let parsed = match parse_flags(args, &["--project"], &["--json"]) {
        Ok(p) => p,
        Err(error) => return fail(err, error),
    };
    let config = match load_daemon_config() {
        Ok(c) => c,
        Err(error) => return fail(err, error),
    };
    let mut query: Vec<(&str, String)> = Vec::new();
    if let Some(project) = parsed.flags.get("--project") {
        query.push(("projectId", project.clone()));
    }
    let body = match http_get(&config, "/api/snapshot", &query) {
        Ok(body) => body,
        Err(error) => return fail(err, error),
    };

    let want_json = should_emit_json(parsed.bool_flags.contains_key("--json"), out_is_terminal());
    if want_json {
        emit_json(&body, out);
    } else {
        render_snapshot_human(&body, out);
    }
    0
}

fn cmd_projects(args: &[String], out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    let parsed = match parse_flags(args, &[], &["--json"]) {
        Ok(p) => p,
        Err(error) => return fail(err, error),
    };
    let config = match load_daemon_config() {
        Ok(c) => c,
        Err(error) => return fail(err, error),
    };
    let body = match http_get(&config, "/api/projects", &[]) {
        Ok(body) => body,
        Err(error) => return fail(err, error),
    };
    let want_json = should_emit_json(parsed.bool_flags.contains_key("--json"), out_is_terminal());
    if want_json {
        emit_json(&body, out);
    } else {
        render_projects_human(&body, out);
    }
    0
}

fn cmd_run(args: &[String], out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    let parsed = match parse_flags(args, &["--project"], &["--json"]) {
        Ok(p) => p,
        Err(error) => return fail(err, error),
    };
    let config = match load_daemon_config() {
        Ok(c) => c,
        Err(error) => return fail(err, error),
    };
    let mut payload = serde_json::Map::new();
    if let Some(project) = parsed.flags.get("--project") {
        payload.insert(
            "projectId".to_string(),
            serde_json::Value::from(project.clone()),
        );
    }
    let body = match http_post(
        &config,
        "/api/run/tests",
        serde_json::Value::Object(payload),
    ) {
        Ok(body) => body,
        Err(error) => return fail(err, error),
    };
    let want_json = should_emit_json(parsed.bool_flags.contains_key("--json"), out_is_terminal());
    let exit_code = body
        .get("exitCode")
        .and_then(|value| value.as_i64())
        .unwrap_or(1) as i32;
    if want_json {
        emit_json(&body, out);
    } else {
        render_run_result_human(&body, out);
    }
    exit_code
}

fn cmd_open(args: &[String], out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    let parsed = match parse_flags(args, &["--project"], &[]) {
        Ok(p) => p,
        Err(error) => return fail(err, error),
    };
    let Some(file) = parsed.positionals.first() else {
        return fail(
            err,
            "open requires a FILE path (relative to the project root)",
        );
    };
    let config = match load_daemon_config() {
        Ok(c) => c,
        Err(error) => return fail(err, error),
    };
    let mut payload = serde_json::Map::new();
    payload.insert("file".to_string(), serde_json::Value::from(file.clone()));
    if let Some(project) = parsed.flags.get("--project") {
        payload.insert(
            "projectId".to_string(),
            serde_json::Value::from(project.clone()),
        );
    }
    let body = match http_post(
        &config,
        "/api/studio/open",
        serde_json::Value::Object(payload),
    ) {
        Ok(body) => body,
        Err(error) => return fail(err, error),
    };
    if body.get("opened") == Some(&serde_json::Value::Bool(true)) {
        let _ = writeln!(out, "opened {file}");
        0
    } else {
        fail(err, "daemon did not confirm the file was opened")
    }
}

// -------------------------------------------------------------------------
// Human-readable renderers (only used when stdout is a TTY and no --json)
// -------------------------------------------------------------------------

fn render_snapshot_human(snapshot: &serde_json::Value, out: &mut dyn Write) {
    let project_name = snapshot
        .pointer("/project/name")
        .and_then(localized_text)
        .unwrap_or_else(|| "(unnamed)".to_string());
    let _ = writeln!(out, "Project: {project_name}");

    let modules = snapshot
        .get("modules")
        .and_then(|value| value.as_array())
        .map(|array| array.len())
        .unwrap_or(0);
    let features = snapshot
        .get("features")
        .and_then(|value| value.as_array())
        .map(|array| array.len())
        .unwrap_or(0);
    let _ = writeln!(out, "Modules: {modules}    Feature files: {features}");
    if let Some(generated_at) = snapshot
        .get("resultsGeneratedAt")
        .and_then(|value| value.as_str())
    {
        let _ = writeln!(out, "Last run: {generated_at}");
    } else {
        let _ = writeln!(out, "Last run: (never)");
    }
    let _ = writeln!(out);

    let reviewable: Vec<&serde_json::Value> = snapshot
        .get("reviewDrafts")
        .and_then(|value| value.as_array())
        .map(|array| array.iter().collect())
        .unwrap_or_default();
    if reviewable.is_empty() {
        let _ = writeln!(out, "Review queue: 0");
    } else {
        let _ = writeln!(out, "Review queue ({}):", reviewable.len());
        for draft in reviewable.iter().take(20) {
            let id = draft
                .get("id")
                .and_then(|value| value.as_str())
                .unwrap_or("?");
            let title = draft
                .get("title")
                .and_then(localized_text)
                .unwrap_or_else(|| "(no title)".to_string());
            let _ = writeln!(out, "  {id}\n       {title}");
        }
        if reviewable.len() > 20 {
            let _ = writeln!(out, "  ... and {} more", reviewable.len() - 20);
        }
    }
}

fn render_projects_human(value: &serde_json::Value, out: &mut dyn Write) {
    let Some(projects) = value.as_array() else {
        emit_json(value, out);
        return;
    };
    for project in projects {
        let id = project
            .get("id")
            .and_then(|value| value.as_str())
            .unwrap_or("?");
        let name = project
            .get("name")
            .and_then(|value| value.as_str())
            .unwrap_or("?");
        let path = project
            .get("path")
            .and_then(|value| value.as_str())
            .unwrap_or("?");
        let _ = writeln!(out, "{id}\t{name}\t{path}");
    }
}

fn render_run_result_human(body: &serde_json::Value, out: &mut dyn Write) {
    let exit_code = body
        .get("exitCode")
        .and_then(|value| value.as_i64())
        .unwrap_or(-1);
    let _ = writeln!(out, "exit code {exit_code}");
    if let Some(stdout) = body.get("stdout").and_then(|value| value.as_str()) {
        if !stdout.is_empty() {
            let _ = writeln!(out, "{stdout}");
        }
    }
    if let Some(stderr) = body.get("stderr").and_then(|value| value.as_str()) {
        if !stderr.is_empty() {
            let _ = writeln!(out, "--- stderr ---\n{stderr}");
        }
    }
}

fn localized_text(value: &serde_json::Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    // Prefer en, then zh-CN, then any value.
    let object = value.as_object()?;
    if let Some(text) = object.get("en").and_then(|value| value.as_str()) {
        return Some(text.to_string());
    }
    if let Some(text) = object.get("zh-CN").and_then(|value| value.as_str()) {
        return Some(text.to_string());
    }
    object
        .values()
        .find_map(|value| value.as_str().map(|s| s.to_string()))
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

fn out_is_terminal() -> bool {
    std::io::stdout().is_terminal()
}
