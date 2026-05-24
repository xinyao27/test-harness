#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildSeedReport,
  checkSeedHarness,
  renderSeedReportMarkdown,
  type ValidationIssue,
} from "@test-harness/core";
import { Effect } from "effect";

type CliStreams = {
  readonly stderr: (message: string) => void;
  readonly stdout: (message: string) => void;
};

type CliOptions = {
  readonly cwd: string;
  readonly streams: CliStreams;
};

const defaultStreams: CliStreams = {
  stderr: (message) => console.error(message),
  stdout: (message) => console.log(message),
};

const usage = "Usage: harness <check|test|report|verify> [--lang <language>]";

type ParsedArgs = {
  readonly command?: string;
  readonly error?: string;
  readonly language?: string;
};

const parseArgs = (args: readonly string[]): ParsedArgs => {
  let command: string | undefined;
  let language: string | undefined;

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
    if (!arg?.startsWith("-") && command === undefined) {
      command = arg;
    }
  }

  return { command, language };
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

const runReport = (options: CliOptions, language?: string): Effect.Effect<number> =>
  buildSeedReport(options.cwd, { language }).pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.sync(() => {
          options.streams.stderr(formatFailure(error));
          return 1;
        }),
      onSuccess: (report) =>
        Effect.sync(() => {
          options.streams.stdout(renderSeedReportMarkdown(report).trimEnd());
          return report.summary.errors > 0 ? 1 : 0;
        }),
    }),
  );

export const runCli = (
  args: readonly string[],
  options: Partial<CliOptions> = {},
): Effect.Effect<number> => {
  const { command, error, language } = parseArgs(args);
  const resolvedOptions: CliOptions = {
    cwd: options.cwd ?? process.cwd(),
    streams: options.streams ?? defaultStreams,
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
      return runReport(resolvedOptions, language);
    case "test":
      return Effect.sync(() => {
        resolvedOptions.streams.stdout(
          "harness test will orchestrate Vitest in a later seed slice. For now, run vp run -r test.",
        );
        return 0;
      });
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
