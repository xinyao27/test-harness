#!/usr/bin/env node
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSeedReport,
  checkSeedHarness,
  harnessResultsPath,
  loadTestResultsFile,
  renderSeedReportMarkdown,
  renderSeedReportSummary,
  type TestResult,
  type TestResultsFile,
  type ValidationIssue,
} from "@test-harness/core";
import { Effect } from "effect";

type CliStreams = {
  readonly stderr: (message: string) => void;
  readonly stdout: (message: string) => void;
};

type TestRunnerOptions = {
  readonly cwd: string;
  readonly streams: CliStreams;
};

type TestRunner = (options: TestRunnerOptions) => Promise<number>;

type CliOptions = {
  readonly cwd: string;
  readonly streams: CliStreams;
  readonly testRunner: TestRunner;
};

const defaultStreams: CliStreams = {
  stderr: (message) => console.error(message),
  stdout: (message) => console.log(message),
};

const harnessRootEnvVar = "HARNESS_ROOT_DIR";

const createLineForwarder = (write: (message: string) => void) => {
  let pending = "";
  return {
    flush() {
      if (pending.length === 0) return;
      write(pending);
      pending = "";
    },
    write(chunk: Buffer) {
      pending += chunk.toString();
      let newlineIndex = pending.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = pending.slice(0, newlineIndex).replace(/\r$/, "");
        write(line);
        pending = pending.slice(newlineIndex + 1);
        newlineIndex = pending.indexOf("\n");
      }
    },
  };
};

const runDefaultTestRunner: TestRunner = ({ cwd, streams }) =>
  new Promise((resolve, reject) => {
    const stdout = createLineForwarder(streams.stdout);
    const stderr = createLineForwarder(streams.stderr);
    const child = spawn("vp", ["test"], {
      cwd,
      env: { ...process.env, [harnessRootEnvVar]: cwd },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk: Buffer) => stdout.write(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.write(chunk));
    child.on("error", reject);
    child.on("close", (exitCode) => {
      stdout.flush();
      stderr.flush();
      resolve(exitCode ?? 1);
    });
  });

const usage = "Usage: harness <check|test|report|verify> [--lang <language>] [--summary]";

type ParsedArgs = {
  readonly command?: string;
  readonly error?: string;
  readonly language?: string;
  readonly summary?: boolean;
};

const parseArgs = (args: readonly string[]): ParsedArgs => {
  let command: string | undefined;
  let language: string | undefined;
  let summary = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--lang") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { command, error: "--lang requires a language value." };
      }
      language = value;
      index += 1;
      continue;
    }
    if (arg?.startsWith("--lang=")) {
      const value = arg.slice("--lang=".length);
      if (!value) return { command, error: "--lang requires a language value." };
      language = value;
      continue;
    }
    if (arg === "--summary") {
      summary = true;
      continue;
    }
    if (!arg?.startsWith("-") && command === undefined) {
      command = arg;
    }
  }

  return { command, language, summary };
};

const errorsOf = (issues: readonly ValidationIssue[]): readonly ValidationIssue[] =>
  issues.filter((issue) => issue.severity === "error");

const warningsOf = (issues: readonly ValidationIssue[]): readonly ValidationIssue[] =>
  issues.filter((issue) => issue.severity === "warning");

const renderIssue = (issue: ValidationIssue): string => {
  const subject = issue.promiseId ? ` (${issue.promiseId})` : "";
  return `[${issue.severity}] ${issue.code}${subject}: ${issue.message}`;
};

const formatUnknown = (value: unknown): string => {
  if (value instanceof Error) return value.stack ?? value.message;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "symbol") return value.description ?? "symbol";
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  try {
    const serialized = JSON.stringify(value, null, 2);
    if (serialized) return serialized;
  } catch {
    return Object.prototype.toString.call(value);
  }

  return Object.prototype.toString.call(value);
};

const renderCheckSummary = (issues: readonly ValidationIssue[]): string => {
  const errors = errorsOf(issues);
  const warnings = warningsOf(issues);
  const lines = [
    "Seed Harness Check",
    "",
    `Errors: ${errors.length}`,
    `Warnings: ${warnings.length}`,
  ];

  if (issues.length > 0) {
    lines.push("", "Issues:");
    for (const issue of issues) {
      lines.push(`- ${renderIssue(issue)}`);
    }
  }

  return lines.join("\n");
};

const formatFailure = (error: unknown): string => {
  if (typeof error === "object" && error !== null && "_tag" in error) {
    const tagged = error as {
      readonly _tag: string;
      readonly cause?: unknown;
      readonly errors?: readonly unknown[];
      readonly path?: string;
    };
    if (tagged._tag === "PromiseRecordLoadErrors" && tagged.errors) {
      return [tagged._tag, ...tagged.errors.map(formatFailure)].join("\n");
    }
    const path = tagged.path ? ` ${tagged.path}` : "";
    const cause = tagged.cause === undefined ? "" : `\n${formatUnknown(tagged.cause)}`;
    return `${tagged._tag}${path}${cause}`;
  }
  return formatUnknown(error);
};

const runCheck = (options: CliOptions): Effect.Effect<number> =>
  checkSeedHarness(options.cwd).pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.sync(() => {
          options.streams.stderr(formatFailure(error));
          return 1;
        }),
      onSuccess: (result) =>
        Effect.sync(() => {
          options.streams.stdout(renderCheckSummary(result.issues));
          return errorsOf(result.issues).length > 0 ? 1 : 0;
        }),
    }),
  );

type ReportOptions = {
  readonly language?: string;
  readonly results?: readonly TestResult[];
  readonly summary?: boolean;
};

const runReport = (options: CliOptions, reportOptions: ReportOptions = {}): Effect.Effect<number> =>
  buildSeedReport(options.cwd, {
    language: reportOptions.language,
    results: reportOptions.results,
  }).pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.sync(() => {
          options.streams.stderr(formatFailure(error));
          return 1;
        }),
      onSuccess: (report) =>
        Effect.sync(() => {
          const rendered = reportOptions.summary
            ? renderSeedReportSummary(report)
            : renderSeedReportMarkdown(report);
          options.streams.stdout(rendered.trimEnd());
          return report.summary.errors > 0 ? 1 : 0;
        }),
    }),
  );

const clearPreviousResults = (cwd: string): Effect.Effect<void, unknown> =>
  Effect.tryPromise({
    try: () => rm(join(cwd, harnessResultsPath), { force: true }),
    catch: (cause) => cause,
  });

type ResultsFileCheck =
  | { readonly file: TestResultsFile; readonly type: "found" }
  | { readonly type: "invalid" }
  | { readonly type: "missing" };

const requireResultsFile = (
  options: CliOptions,
  logMissing: boolean,
): Effect.Effect<ResultsFileCheck> =>
  loadTestResultsFile(options.cwd).pipe(
    Effect.match({
      onFailure: (error) => {
        options.streams.stderr(formatFailure(error));
        return { type: "invalid" };
      },
      onSuccess: (file) => {
        if (!file) {
          if (logMissing) {
            options.streams.stderr(
              `No Harness result file found at ${harnessResultsPath} after the test command.`,
            );
          }
          return { type: "missing" };
        }
        return { file, type: "found" };
      },
    }),
  );

const runTest = (options: CliOptions, reportOptions: ReportOptions = {}): Effect.Effect<number> =>
  Effect.gen(function* () {
    const cleared = yield* clearPreviousResults(options.cwd).pipe(
      Effect.match({
        onFailure: (error) => {
          options.streams.stderr(formatFailure(error));
          return false;
        },
        onSuccess: () => true,
      }),
    );
    if (!cleared) return 1;

    const testExitCode = yield* Effect.tryPromise({
      try: () => options.testRunner({ cwd: options.cwd, streams: options.streams }),
      catch: (cause) => cause,
    }).pipe(
      Effect.match({
        onFailure: (error) => {
          options.streams.stderr(formatFailure(error));
          return 1;
        },
        onSuccess: (exitCode) => exitCode,
      }),
    );

    if (testExitCode !== 0) {
      options.streams.stderr(`Test command failed with exit code ${testExitCode}.`);
    }

    const resultsFileCheck = yield* requireResultsFile(options, testExitCode === 0);
    if (resultsFileCheck.type === "missing" && testExitCode !== 0) return 1;

    const reportExitCode =
      resultsFileCheck.type === "invalid"
        ? 1
        : yield* runReport(options, {
            language: reportOptions.language,
            results: resultsFileCheck.type === "found" ? resultsFileCheck.file.results : [],
            summary: reportOptions.summary,
          });
    return testExitCode !== 0 || resultsFileCheck.type !== "found" || reportExitCode !== 0 ? 1 : 0;
  });

export const runCli = (
  args: readonly string[],
  options: Partial<CliOptions> = {},
): Effect.Effect<number> => {
  const { command, error, language, summary } = parseArgs(args);
  const resolvedOptions: CliOptions = {
    cwd: options.cwd ?? process.cwd(),
    streams: options.streams ?? defaultStreams,
    testRunner: options.testRunner ?? runDefaultTestRunner,
  };

  if (error) {
    return Effect.sync(() => {
      resolvedOptions.streams.stderr(`${error}\n${usage}`);
      return 1;
    });
  }

  switch (command) {
    case "check":
      return runCheck(resolvedOptions);
    case "report":
    case "verify":
      return runReport(resolvedOptions, { language, summary });
    case "test":
      return runTest(resolvedOptions, { language, summary });
    default:
      return Effect.sync(() => {
        resolvedOptions.streams.stdout(usage);
        return command ? 1 : 0;
      });
  }
};

const isMain = (() => {
  try {
    const entrypoint = process.argv[1];
    if (!entrypoint) return false;
    return realpathSync(entrypoint) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  void Effect.runPromise(runCli(process.argv.slice(2)))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(formatFailure(error));
      process.exitCode = 1;
    });
}
