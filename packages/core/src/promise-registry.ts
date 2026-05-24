import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { Effect, Schema } from "effect";
import { parse } from "yaml";

import {
  PromiseFileReadError,
  PromiseRecordLoadErrors,
  type PromiseRecordLoadError,
  PromiseSchemaDecodeError,
  PromiseYamlParseError,
} from "./errors.ts";
import { type PromiseRecord, PromiseRecordSchema } from "./schema.ts";

const PROMISE_FILE_SUFFIX = ".promise.yaml";

type LoadPromiseRecordResult =
  | { readonly error: PromiseRecordLoadError; readonly type: "failure" }
  | { readonly record: PromiseRecord; readonly type: "success" };

const findPromiseFilesIn = (
  directory: string,
): Effect.Effect<readonly string[], PromiseFileReadError> =>
  Effect.tryPromise({
    try: () => collectPromiseFiles(directory),
    catch: (cause) => new PromiseFileReadError({ cause, path: directory }),
  });

const collectPromiseFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return await collectPromiseFiles(path);
      if (entry.isFile() && entry.name.endsWith(PROMISE_FILE_SUFFIX)) return [path];
      return [];
    }),
  );
  return nested.flat().sort();
};

export const findPromiseFiles = (
  rootDir: string,
): Effect.Effect<readonly string[], PromiseFileReadError> =>
  findPromiseFilesIn(join(rootDir, "promises")).pipe(
    Effect.catchTag("PromiseFileReadError", (error) => {
      const nodeError = error.cause as { readonly code?: string };
      if (nodeError.code === "ENOENT") return Effect.succeed([]);
      return Effect.fail(error);
    }),
  );

const readPromiseFile = (path: string): Effect.Effect<string, PromiseFileReadError> =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (cause) => new PromiseFileReadError({ cause, path }),
  });

const parsePromiseYaml = (
  path: string,
  raw: string,
): Effect.Effect<unknown, PromiseYamlParseError> =>
  Effect.try({
    try: () => parse(raw),
    catch: (cause) => new PromiseYamlParseError({ cause, path }),
  });

const decodePromiseRecord = (
  path: string,
  input: unknown,
): Effect.Effect<PromiseRecord, PromiseSchemaDecodeError> =>
  Schema.decodeUnknownEffect(PromiseRecordSchema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError((cause) => new PromiseSchemaDecodeError({ cause, path })),
  );

export const loadPromiseRecord = (
  path: string,
): Effect.Effect<PromiseRecord, PromiseRecordLoadError> =>
  Effect.gen(function* () {
    const raw = yield* readPromiseFile(path);
    const parsed = yield* parsePromiseYaml(path, raw);
    return yield* decodePromiseRecord(path, parsed);
  });

const loadPromiseRecordResult = (path: string): Effect.Effect<LoadPromiseRecordResult> =>
  loadPromiseRecord(path).pipe(
    Effect.matchEffect({
      onFailure: (error) => Effect.succeed({ error, type: "failure" as const }),
      onSuccess: (record) => Effect.succeed({ record, type: "success" as const }),
    }),
  );

export const loadPromiseRecords = (
  rootDir: string,
): Effect.Effect<readonly PromiseRecord[], PromiseFileReadError | PromiseRecordLoadErrors> =>
  Effect.gen(function* () {
    const files = yield* findPromiseFiles(rootDir);
    const results = yield* Effect.forEach(files, loadPromiseRecordResult, {
      concurrency: "unbounded",
    });
    const errors = results
      .filter((result) => result.type === "failure")
      .map((result) => result.error);
    if (errors.length > 0) return yield* Effect.fail(new PromiseRecordLoadErrors({ errors }));
    return results.filter((result) => result.type === "success").map((result) => result.record);
  });
