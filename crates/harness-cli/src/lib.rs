use harness_project::{
    build_feature_report, check_feature_harness, load_harness_config, load_results_file,
    render_feature_report_markdown, render_feature_report_summary, ExampleResult, HarnessError,
    ValidationIssue, ValidationSeverity, HARNESS_RESULTS_PATH, HARNESS_ROOT_ENV_VAR,
};
use harness_protocol::HarnessRunnerSelection;
use harness_runner::selection_environment;
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

pub mod studio;

const USAGE: &str =
    "Usage: harness <check|test|report|verify|studio> [--lang <language>] [--summary]\n\
     \n\
     harness test may also receive --package, --module, --feature, --rule,\n\
     --example, and --locale to select a Cucumber behavior slice.\n\
     \n\
     Run `harness studio --help` for the daemon-backed subcommands (snapshot,\n\
     projects, run, open).";

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CliRunResult {
    pub exit_code: i32,
    pub stderr: String,
    pub stdout: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ConfiguredTestOutput {
    pub exit_code: i32,
    pub stderr: Vec<u8>,
    pub stdout: Vec<u8>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ConfiguredTestInvocation {
    pub args: Vec<String>,
    pub command: String,
    pub env: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Default)]
struct ParsedArgs {
    command: Option<String>,
    error: Option<String>,
    language: Option<String>,
    selection: HarnessRunnerSelection,
    summary: bool,
}

struct Streams<'a> {
    stderr: Box<dyn FnMut(&str) + 'a>,
    stdout: Box<dyn FnMut(&str) + 'a>,
}

type ConfiguredTestRunner<'a> =
    dyn FnMut(&Path, &ConfiguredTestInvocation) -> io::Result<ConfiguredTestOutput> + 'a;

fn parse_args(args: &[String]) -> ParsedArgs {
    let mut parsed = ParsedArgs::default();
    let mut index = 0;
    while index < args.len() {
        let arg = &args[index];
        if let Some((flag, value)) = arg.split_once('=') {
            if set_selection_flag(&mut parsed.selection, flag, value) {
                if value.is_empty() {
                    parsed.error = Some(format!("{flag} requires a value."));
                    return parsed;
                }
                index += 1;
                continue;
            }
        }
        if set_selection_flag(&mut parsed.selection, arg, "") {
            let value = args.get(index + 1);
            if value.is_none_or(|value| value.starts_with('-')) {
                parsed.error = Some(format!("{arg} requires a value."));
                return parsed;
            }
            set_selection_flag(&mut parsed.selection, arg, value.unwrap());
            index += 2;
            continue;
        }
        if arg == "--lang" {
            let value = args.get(index + 1);
            if value.is_none_or(|value| value.starts_with('-')) {
                parsed.error = Some("--lang requires a language value.".to_string());
                return parsed;
            }
            parsed.language = value.cloned();
            index += 2;
            continue;
        }
        if let Some(value) = arg.strip_prefix("--lang=") {
            if value.is_empty() {
                parsed.error = Some("--lang requires a language value.".to_string());
                return parsed;
            }
            parsed.language = Some(value.to_string());
            index += 1;
            continue;
        }
        if arg == "--summary" {
            parsed.summary = true;
            index += 1;
            continue;
        }
        if !arg.starts_with('-') && parsed.command.is_none() {
            parsed.command = Some(arg.clone());
        }
        index += 1;
    }
    parsed
}

fn set_selection_flag(selection: &mut HarnessRunnerSelection, flag: &str, value: &str) -> bool {
    match flag {
        "--package" => selection.package = Some(value.to_string()),
        "--module" => selection.module = Some(value.to_string()),
        "--feature" => selection.feature = Some(value.to_string()),
        "--rule" => selection.rule = Some(value.to_string()),
        "--example" => selection.example = Some(value.to_string()),
        "--locale" => selection.locale = Some(value.to_string()),
        _ => return false,
    }
    true
}

fn errors_count(issues: &[ValidationIssue]) -> usize {
    issues
        .iter()
        .filter(|issue| issue.severity == ValidationSeverity::Error)
        .count()
}

fn warnings_count(issues: &[ValidationIssue]) -> usize {
    issues
        .iter()
        .filter(|issue| issue.severity == ValidationSeverity::Warning)
        .count()
}

fn render_issue(issue: &ValidationIssue) -> String {
    let subject = issue
        .subject
        .as_ref()
        .map(|subject| format!(" ({:?}:{})", subject.kind, subject.id))
        .unwrap_or_default();
    format!(
        "[{}] {}{}: {}",
        issue.severity, issue.code, subject, issue.message
    )
}

fn render_check_summary(features_count: usize, issues: &[ValidationIssue]) -> String {
    let mut lines = vec![
        "Seed Harness Check".to_string(),
        String::new(),
        format!("Features: {features_count}"),
        format!("Errors: {}", errors_count(issues)),
        format!("Warnings: {}", warnings_count(issues)),
    ];

    if !issues.is_empty() {
        lines.push(String::new());
        lines.push("Issues:".to_string());
        for issue in issues {
            lines.push(format!("- {}", render_issue(issue)));
        }
    }

    lines.join("\n")
}

fn format_failure(error: &HarnessError) -> String {
    error.to_string().trim_end().to_string()
}

fn run_check(cwd: &Path, streams: &mut Streams<'_>) -> i32 {
    match check_feature_harness(cwd) {
        Ok(result) => {
            (streams.stdout)(&render_check_summary(result.features.len(), &result.issues));
            if errors_count(&result.issues) > 0 {
                1
            } else {
                0
            }
        }
        Err(error) => {
            (streams.stderr)(&format_failure(&error));
            1
        }
    }
}

fn run_report(
    cwd: &Path,
    streams: &mut Streams<'_>,
    _language: Option<String>,
    summary: bool,
    _results: Option<Vec<ExampleResult>>,
) -> i32 {
    match build_feature_report(cwd) {
        Ok(report) => {
            let rendered = if summary {
                render_feature_report_summary(&report)
            } else {
                render_feature_report_markdown(&report)
            };
            (streams.stdout)(rendered.trim_end());
            if report.summary.errors > 0 {
                1
            } else {
                0
            }
        }
        Err(error) => {
            (streams.stderr)(&format_failure(&error));
            1
        }
    }
}

fn spawn_configured_test_runner(
    cwd: &Path,
    invocation: &ConfiguredTestInvocation,
) -> io::Result<ConfiguredTestOutput> {
    let output = Command::new(&invocation.command)
        .args(&invocation.args)
        .current_dir(cwd)
        .env(HARNESS_ROOT_ENV_VAR, cwd)
        .envs(&invocation.env)
        .output()?;
    Ok(ConfiguredTestOutput {
        exit_code: output.status.code().unwrap_or(1),
        stderr: output.stderr,
        stdout: output.stdout,
    })
}

fn run_configured_test_runner(
    cwd: &Path,
    streams: &mut Streams<'_>,
    selection: HarnessRunnerSelection,
    runner: &mut ConfiguredTestRunner<'_>,
) -> i32 {
    let config = match load_harness_config(cwd) {
        Ok(config) => config,
        Err(error) => {
            (streams.stderr)(&format_failure(&error));
            return 1;
        }
    };

    let selection =
        merge_runner_selection(config.test.runner.selection.unwrap_or_default(), selection);
    let invocation = ConfiguredTestInvocation {
        args: config.test.runner.args,
        command: config.test.runner.command,
        env: selection_environment(&selection),
    };

    let output = match runner(cwd, &invocation) {
        Ok(output) => output,
        Err(error) => {
            (streams.stderr)(&error.to_string());
            return 1;
        }
    };

    forward_output(&output.stdout, &mut streams.stdout);
    forward_output(&output.stderr, &mut streams.stderr);
    output.exit_code
}

fn merge_runner_selection(
    mut base: HarnessRunnerSelection,
    override_selection: HarnessRunnerSelection,
) -> HarnessRunnerSelection {
    if override_selection.package.is_some() {
        base.package = override_selection.package;
    }
    if override_selection.module.is_some() {
        base.module = override_selection.module;
    }
    if override_selection.feature.is_some() {
        base.feature = override_selection.feature;
    }
    if override_selection.rule.is_some() {
        base.rule = override_selection.rule;
    }
    if override_selection.example.is_some() {
        base.example = override_selection.example;
    }
    if override_selection.locale.is_some() {
        base.locale = override_selection.locale;
    }
    base
}

fn forward_output(output: &[u8], write: &mut Box<dyn FnMut(&str) + '_>) {
    let text = String::from_utf8_lossy(output);
    let trimmed = text.trim_end_matches(['\r', '\n']);
    if trimmed.is_empty() {
        return;
    }
    for line in trimmed.lines() {
        write(line.trim_end_matches('\r'));
    }
}

enum ResultsFileCheck {
    Found(Vec<ExampleResult>),
    Invalid,
    Missing,
}

fn require_results_file(
    cwd: &Path,
    streams: &mut Streams<'_>,
    log_missing: bool,
) -> ResultsFileCheck {
    match load_results_file(cwd) {
        Ok(Some(file)) => ResultsFileCheck::Found(file.results),
        Ok(None) => {
            if log_missing {
                (streams.stderr)(&format!(
                    "No Harness result file found at {HARNESS_RESULTS_PATH} after the test command."
                ));
            }
            ResultsFileCheck::Missing
        }
        Err(error) => {
            (streams.stderr)(&format_failure(&error));
            ResultsFileCheck::Invalid
        }
    }
}

fn clear_previous_results(cwd: &Path, streams: &mut Streams<'_>) -> bool {
    let path = cwd.join(HARNESS_RESULTS_PATH);
    match fs::remove_file(&path) {
        Ok(()) => true,
        Err(error) if error.kind() == io::ErrorKind::NotFound => true,
        Err(error) => {
            (streams.stderr)(&error.to_string());
            false
        }
    }
}

fn run_test(
    cwd: &Path,
    streams: &mut Streams<'_>,
    language: Option<String>,
    selection: HarnessRunnerSelection,
    summary: bool,
    runner: &mut ConfiguredTestRunner<'_>,
) -> i32 {
    if !clear_previous_results(cwd, streams) {
        return 1;
    }

    let test_exit_code = run_configured_test_runner(cwd, streams, selection, runner);
    if test_exit_code != 0 {
        (streams.stderr)(&format!(
            "Test command failed with exit code {test_exit_code}."
        ));
    }

    let results_file_check = require_results_file(cwd, streams, test_exit_code == 0);
    if matches!(results_file_check, ResultsFileCheck::Missing) && test_exit_code != 0 {
        return 1;
    }

    let found_results = matches!(results_file_check, ResultsFileCheck::Found(_));
    let report_exit_code = match results_file_check {
        ResultsFileCheck::Invalid => 1,
        ResultsFileCheck::Found(results) => {
            run_report(cwd, streams, language, summary, Some(results))
        }
        ResultsFileCheck::Missing => run_report(cwd, streams, language, summary, Some(Vec::new())),
    };

    if test_exit_code != 0 || !found_results || report_exit_code != 0 {
        1
    } else {
        0
    }
}

fn run_with_streams(
    args: &[String],
    cwd: &Path,
    streams: &mut Streams<'_>,
    runner: &mut ConfiguredTestRunner<'_>,
) -> i32 {
    // `studio` subcommands have their own argument shape (positional + flags) and
    // are network-bound, so they bypass parse_args and write directly to the
    // process stdout/stderr — they're not captured by run_cli_collect.
    if matches!(args.first().map(String::as_str), Some("studio")) {
        let mut stdout = io::stdout().lock();
        let mut stderr = io::stderr().lock();
        return studio::run(&args[1..], &mut stdout, &mut stderr);
    }

    let parsed = parse_args(args);
    if let Some(error) = parsed.error {
        (streams.stderr)(&format!("{error}\n{USAGE}"));
        return 1;
    }

    match parsed.command.as_deref() {
        Some("check") => run_check(cwd, streams),
        Some("report") | Some("verify") => {
            run_report(cwd, streams, parsed.language, parsed.summary, None)
        }
        Some("test") => run_test(
            cwd,
            streams,
            parsed.language,
            parsed.selection,
            parsed.summary,
            runner,
        ),
        Some(_) => {
            (streams.stdout)(USAGE);
            1
        }
        None => {
            (streams.stdout)(USAGE);
            0
        }
    }
}

pub fn run_cli_collect(args: &[String], cwd: impl AsRef<Path>) -> CliRunResult {
    run_cli_collect_with_runner(args, cwd, spawn_configured_test_runner)
}

pub fn run_cli_collect_with_runner(
    args: &[String],
    cwd: impl AsRef<Path>,
    mut runner: impl FnMut(&Path, &ConfiguredTestInvocation) -> io::Result<ConfiguredTestOutput>,
) -> CliRunResult {
    let mut stdout = Vec::<String>::new();
    let mut stderr = Vec::<String>::new();
    let exit_code = {
        let mut streams = Streams {
            stderr: Box::new(|message| stderr.push(message.to_string())),
            stdout: Box::new(|message| stdout.push(message.to_string())),
        };
        run_with_streams(args, cwd.as_ref(), &mut streams, &mut runner)
    };
    CliRunResult {
        exit_code,
        stderr: stderr.join("\n"),
        stdout: stdout.join("\n"),
    }
}

pub fn run_cli_main() -> i32 {
    let args = env::args().skip(1).collect::<Vec<_>>();
    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mut runner = spawn_configured_test_runner;
    let mut streams = Streams {
        stderr: Box::new(|message| {
            let _ = writeln!(io::stderr(), "{message}");
        }),
        stdout: Box::new(|message| {
            let _ = writeln!(io::stdout(), "{message}");
        }),
    };
    run_with_streams(&args, &cwd, &mut streams, &mut runner)
}
