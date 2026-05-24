import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { Effect, Schema } from "effect";
import { parse, stringify } from "yaml";

import {
  TestResultsFileReadError,
  type TestResultsLoadError,
  TestResultsSchemaDecodeError,
  TestResultsYamlParseError,
} from "./errors.ts";
import type { PromiseRunStatus } from "./schema.ts";

export const harnessResultsPath = ".harness/results.yaml";
export const harnessRootEnvVar = "HARNESS_ROOT_DIR";

export const TestResultStatusSchema = Schema.Literals(["passing", "failing", "skipped"]);

export const TestResultSchema = Schema.Struct({
  failureMessage: Schema.optionalKey(Schema.String),
  file: Schema.String,
  promiseId: Schema.String,
  status: TestResultStatusSchema,
  testName: Schema.String,
});

export const TestResultsFileSchema = Schema.Struct({
  generatedAt: Schema.String,
  results: Schema.Array(TestResultSchema),
});

export type TestResult = Schema.Schema.Type<typeof TestResultSchema>;
export type TestResultsFile = Schema.Schema.Type<typeof TestResultsFileSchema>;
export type TestResultStatus = Schema.Schema.Type<typeof TestResultStatusSchema>;

const resolveResultsPath = (rootDir: string): string => join(rootDir, harnessResultsPath);

const readResultsFile = (path: string): Effect.Effect<string, TestResultsFileReadError> =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (cause) => new TestResultsFileReadError({ cause, path }),
  });

const parseResultsYaml = (
  path: string,
  raw: string,
): Effect.Effect<unknown, TestResultsYamlParseError> =>
  Effect.try({
    try: () => parse(raw),
    catch: (cause) => new TestResultsYamlParseError({ cause, path }),
  });

const decodeResultsFile = (
  path: string,
  input: unknown,
): Effect.Effect<TestResultsFile, TestResultsSchemaDecodeError> =>
  Schema.decodeUnknownEffect(TestResultsFileSchema)(input).pipe(
    Effect.mapError((cause) => new TestResultsSchemaDecodeError({ cause, path })),
  );

export const loadTestResultsFile = (
  rootDir: string,
): Effect.Effect<TestResultsFile | undefined, TestResultsLoadError> => {
  const path = resolveResultsPath(rootDir);
  return Effect.gen(function* () {
    const raw = yield* readResultsFile(path).pipe(
      Effect.catchTag("TestResultsFileReadError", (error) => {
        const nodeError = error.cause as { readonly code?: string };
        if (nodeError.code === "ENOENT") return Effect.succeed(undefined);
        return Effect.fail(error);
      }),
    );
    if (raw === undefined) return undefined;
    const parsed = yield* parseResultsYaml(path, raw);
    return yield* decodeResultsFile(path, parsed);
  });
};

export const loadTestResults = (
  rootDir: string,
): Effect.Effect<readonly TestResult[], TestResultsLoadError> =>
  loadTestResultsFile(rootDir).pipe(Effect.map((file) => file?.results ?? []));

export const writeTestResultsFile = async (
  rootDir: string,
  file: TestResultsFile,
): Promise<void> => {
  const path = resolveResultsPath(rootDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    stringify(file, {
      lineWidth: 0,
    }),
  );
};

export const createTestResultsFile = (
  results: readonly TestResult[],
  generatedAt = new Date().toISOString(),
): TestResultsFile => ({
  generatedAt,
  results: [...results].sort((left, right) => {
    const byPromise = left.promiseId.localeCompare(right.promiseId);
    if (byPromise !== 0) return byPromise;
    const byFile = left.file.localeCompare(right.file);
    if (byFile !== 0) return byFile;
    return left.testName.localeCompare(right.testName);
  }),
});

export const getPromiseRunStatus = (
  promiseId: string,
  results: readonly TestResult[],
): PromiseRunStatus => {
  const matched = results.filter((result) => result.promiseId === promiseId);
  if (matched.length === 0) return "unknown";
  if (matched.some((result) => result.status === "failing")) return "failing";
  if (matched.some((result) => result.status === "skipped")) return "skipped";
  return "passing";
};
