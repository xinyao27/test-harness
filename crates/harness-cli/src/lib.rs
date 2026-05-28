use harness_core::{
    build_seed_report, check_seed_harness, load_harness_config, load_test_results_file,
    render_seed_report_markdown, render_seed_report_summary, HarnessError, SeedReportOptions,
    TestResult, ValidationIssue, ValidationSeverity, HARNESS_RESULTS_PATH, HARNESS_ROOT_ENV_VAR,
};
use std::env;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

pub mod studio;

const USAGE: &str =
    "Usage: harness <check|test|report|verify|studio> [--lang <language>] [--summary]\n\
     \n\
     Run `harness studio --help` for the daemon-backed subcommands (snapshot,\n\
     projects, save-module, save-promise, review, run, open).";

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

#[derive(Debug, Clone, Default)]
struct ParsedArgs {
    command: Option<String>,
    error: Option<String>,
    language: Option<String>,
    summary: bool,
}

struct Streams<'a> {
    stderr: Box<dyn FnMut(&str) + 'a>,
    stdout: Box<dyn FnMut(&str) + 'a>,
}

type ConfiguredTestRunner<'a> =
    dyn FnMut(&Path, &str, &[String]) -> io::Result<ConfiguredTestOutput> + 'a;

fn parse_args(args: &[String]) -> ParsedArgs {
    let mut parsed = ParsedArgs::default();
    let mut index = 0;
    while index < args.len() {
        let arg = &args[index];
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
        .promise_id
        .as_ref()
        .map(|promise_id| format!(" ({promise_id})"))
        .unwrap_or_default();
    format!(
        "[{}] {}{}: {}",
        issue.severity, issue.code, subject, issue.message
    )
}

fn render_check_summary(issues: &[ValidationIssue]) -> String {
    let mut lines = vec![
        "Seed Harness Check".to_string(),
        String::new(),
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
    match check_seed_harness(cwd) {
        Ok(result) => {
            (streams.stdout)(&render_check_summary(&result.issues));
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
    language: Option<String>,
    summary: bool,
    results: Option<Vec<TestResult>>,
) -> i32 {
    match build_seed_report(cwd, SeedReportOptions { language, results }) {
        Ok(report) => {
            let rendered = if summary {
                render_seed_report_summary(&report)
            } else {
                render_seed_report_markdown(&report)
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
    command: &str,
    args: &[String],
) -> io::Result<ConfiguredTestOutput> {
    let output = Command::new(command)
        .args(args)
        .current_dir(cwd)
        .env(HARNESS_ROOT_ENV_VAR, cwd)
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
    runner: &mut ConfiguredTestRunner<'_>,
) -> i32 {
    let config = match load_harness_config(cwd) {
        Ok(config) => config,
        Err(error) => {
            (streams.stderr)(&format_failure(&error));
            return 1;
        }
    };

    let output = match runner(cwd, &config.test.runner.command, &config.test.runner.args) {
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
    Found(Vec<TestResult>),
    Invalid,
    Missing,
}

fn require_results_file(
    cwd: &Path,
    streams: &mut Streams<'_>,
    log_missing: bool,
) -> ResultsFileCheck {
    match load_test_results_file(cwd) {
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
    summary: bool,
    runner: &mut ConfiguredTestRunner<'_>,
) -> i32 {
    if !clear_previous_results(cwd, streams) {
        return 1;
    }

    let test_exit_code = run_configured_test_runner(cwd, streams, runner);
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
        Some("test") => run_test(cwd, streams, parsed.language, parsed.summary, runner),
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
    mut runner: impl FnMut(&Path, &str, &[String]) -> io::Result<ConfiguredTestOutput>,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    const VALID_HARNESS_CONFIG: &str = r#"apiVersion: 1
test:
  runner:
    command: "true"
    args: []
"#;

    const VALID_PROMISE_YAML: &str = r#"apiVersion: 1
promises:
  - id: harness.promise_registry.load_canonical_yaml_promises
    feature: Seed Harness / Promise Registry
    title:
      en: Accepted promises are loaded from canonical YAML files
      zh-CN: 已接受的承诺会从 canonical YAML 文件中加载
    purpose:
      en: Protect the seed Harness's reviewed behavior promises.
      zh-CN: 保护 seed Harness 能读取自己已批准的行为承诺。
    priority: P0
    boundary: unit
    lifecycle: accepted
    given:
      - en: A promise file exists under the tests/promises root
        zh-CN: tests/promises/ 目录下存在一个 promise 文件
    when:
      - en: The seed Harness loads promise records
        zh-CN: seed Harness 加载 promise records
    then:
      - en: The promise is decoded into a PromiseRecord
        zh-CN: 该 promise 会被解码成 PromiseRecord
    observes:
      - tests/promises/**/*.promises.yaml
    failureMeaning:
      en: The Harness cannot trust its own reviewed behavior promises.
      zh-CN: Harness 无法信任自己已经 review 过的行为承诺。
    review:
      state: approved
      decidedBy: xinyao
      decidedAt: "2026-05-24"
      events:
        - action: approved
          by: xinyao
          at: "2026-05-24"
"#;

    fn write_minimal_workspace(root: &Path) {
        fs::create_dir_all(root.join("tests")).unwrap();
        fs::write(root.join("tests/harness.yaml"), VALID_HARNESS_CONFIG).unwrap();
        fs::create_dir_all(root.join("tests/promises/promise-registry")).unwrap();
        fs::write(
            root.join("tests/promises/promise-registry/promise-registry.promises.yaml"),
            VALID_PROMISE_YAML,
        )
        .unwrap();
    }

    fn repo_root() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(Path::parent)
            .unwrap()
            .to_path_buf()
    }

    #[test]
    fn check_succeeds_for_valid_promises() {
        let temp = tempdir().unwrap();
        write_minimal_workspace(temp.path());

        let result = run_cli_collect(&["check".to_string()], temp.path());
        assert_eq!(result.exit_code, 0, "{result:#?}");
        assert!(result.stdout.contains("Seed Harness Check"));
        assert!(result.stdout.contains("Errors: 0"));
    }

    #[test]
    fn verify_renders_readable_report() {
        let temp = tempdir().unwrap();
        write_minimal_workspace(temp.path());

        let result = run_cli_collect(&["verify".to_string()], temp.path());
        assert_eq!(result.exit_code, 0, "{result:#?}");
        assert!(result.stdout.contains("Seed Harness Report"));
        assert!(result
            .stdout
            .contains("Feature: Seed Harness / Promise Registry"));
        assert!(result.stdout.contains("Run Status: unknown"));
    }

    #[test]
    fn invalid_lang_argument_fails_with_usage() {
        let temp = tempdir().unwrap();
        write_minimal_workspace(temp.path());

        let result = run_cli_collect(&["verify".to_string(), "--lang".to_string()], temp.path());
        assert_eq!(result.exit_code, 1);
        assert!(result.stderr.contains("--lang requires a language value."));
        assert!(result.stderr.contains("Usage: harness"));
    }

    #[test]
    fn cli_contract_commands_are_enforced() {
        let contract = fs::read_to_string(repo_root().join("protocol/v1/cli.yaml")).unwrap();
        for command in ["check", "report", "verify", "test"] {
            assert!(
                contract.contains(&format!("  {command}:")),
                "protocol CLI contract should declare {command}"
            );
        }
        assert!(contract.contains("success: 0"));
        assert!(contract.contains("failure: 1"));

        let temp = tempdir().unwrap();
        write_minimal_workspace(temp.path());

        let success = run_cli_collect(&["check".to_string()], temp.path());
        assert_eq!(success.exit_code, 0, "{success:#?}");

        let failure = run_cli_collect(&["unknown".to_string()], temp.path());
        assert_eq!(failure.exit_code, 1, "{failure:#?}");
        assert!(failure.stdout.contains("Usage: harness"));
    }

    #[test]
    fn test_command_reads_runner_config() {
        let temp = tempdir().unwrap();
        write_minimal_workspace(temp.path());
        let mut received_command = None::<String>;
        let mut received_args = None::<Vec<String>>;
        let mut stdout = Vec::<String>::new();
        let mut stderr = Vec::<String>::new();

        let exit_code = {
            let mut streams = Streams {
                stderr: Box::new(|message| stderr.push(message.to_string())),
                stdout: Box::new(|message| stdout.push(message.to_string())),
            };
            run_configured_test_runner(temp.path(), &mut streams, &mut |_, command, args| {
                received_command = Some(command.to_string());
                received_args = Some(args.to_vec());
                Ok(ConfiguredTestOutput {
                    exit_code: 0,
                    stderr: Vec::new(),
                    stdout: b"configured runner\n".to_vec(),
                })
            })
        };

        assert_eq!(exit_code, 0);
        assert_eq!(received_command.as_deref(), Some("true"));
        assert_eq!(received_args.unwrap(), Vec::<String>::new());
        assert_eq!(stdout, vec!["configured runner".to_string()]);
        assert!(stderr.is_empty());
    }

    #[test]
    fn test_command_orchestrates_adapter_and_report_results() {
        let temp = tempdir().unwrap();
        write_minimal_workspace(temp.path());
        let mut called = false;

        let result = run_cli_collect_with_runner(
            &["test".to_string(), "--summary".to_string()],
            temp.path(),
            |cwd, command, args| {
                called = true;
                assert_eq!(cwd, temp.path());
                assert_eq!(command, "true");
                assert!(args.is_empty());

                let results = harness_core::create_test_results_file(
                    vec![TestResult {
                        file: "crates/harness-cli/src/lib.rs".to_string(),
                        labels: Default::default(),
                        promise_id: "harness.promise_registry.load_canonical_yaml_promises"
                            .to_string(),
                        status: harness_core::TestResultStatus::Passing,
                        test_name: "passes through injected runner".to_string(),
                        failure_message: None,
                    }],
                    "2026-05-25T00:00:00.000Z",
                );
                harness_core::write_test_results_file(cwd, &results).unwrap();

                Ok(ConfiguredTestOutput {
                    exit_code: 0,
                    stderr: Vec::new(),
                    stdout: b"runner ok\n".to_vec(),
                })
            },
        );

        assert!(called);
        assert_eq!(result.exit_code, 0, "{result:#?}");
        assert!(result.stdout.contains("runner ok"));
        assert!(result.stdout.contains("passing"));
    }
}
