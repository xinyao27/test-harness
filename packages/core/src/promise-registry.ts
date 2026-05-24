import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { Effect, Schema } from "effect";
import { parse } from "yaml";

import {
  PromiseFileReadError,
  PromiseRecordLoadErrors,
  type PromiseRecordLoadError,
  PromiseSchemaDecodeError,
  PromisesFileSchemaDecodeError,
  PromiseYamlParseError,
} from "./errors.ts";
import { HarnessProtocolVersionSchema, type PromiseRecord, PromiseRecordSchema } from "./schema.ts";

const PROMISES_FILE_SUFFIX = ".promises.yaml";

const PromisesFileEnvelopeSchema = Schema.Struct({
  apiVersion: HarnessProtocolVersionSchema,
  promises: Schema.Array(Schema.Unknown).check(Schema.isNonEmpty()),
});

type FileLoadResult = {
  readonly errors: readonly PromiseRecordLoadError[];
  readonly records: readonly PromiseRecord[];
};

type PerRecordResult =
  | { readonly error: PromiseSchemaDecodeError; readonly type: "failure" }
  | { readonly record: PromiseRecord; readonly type: "success" };

const collectPromiseFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return await collectPromiseFiles(path);
      if (entry.isFile() && entry.name.endsWith(PROMISES_FILE_SUFFIX)) return [path];
      return [];
    }),
  );
  return nested.flat().sort();
};

const findPromiseFilesIn = (
  directory: string,
): Effect.Effect<readonly string[], PromiseFileReadError> =>
  Effect.tryPromise({
    try: () => collectPromiseFiles(directory),
    catch: (cause) => new PromiseFileReadError({ cause, path: directory }),
  });

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

const decodeWrapperEnvelope = (
  path: string,
  input: unknown,
): Effect.Effect<readonly unknown[], PromisesFileSchemaDecodeError> =>
  Schema.decodeUnknownEffect(PromisesFileEnvelopeSchema)(input).pipe(
    Effect.map((envelope) => envelope.promises),
    Effect.mapError((cause) => new PromisesFileSchemaDecodeError({ cause, path })),
  );

const decodePromiseRecord = (
  path: string,
  index: number,
  input: unknown,
): Effect.Effect<PromiseRecord, PromiseSchemaDecodeError> =>
  Schema.decodeUnknownEffect(PromiseRecordSchema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError((cause) => new PromiseSchemaDecodeError({ cause, index, path })),
  );

const loadPromisesFile = (path: string): Effect.Effect<FileLoadResult> => {
  const loadEnvelope = readPromiseFile(path).pipe(
    Effect.flatMap((raw) => parsePromiseYaml(path, raw)),
    Effect.flatMap((parsed) => decodeWrapperEnvelope(path, parsed)),
  );

  return loadEnvelope.pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.succeed({
          errors: [error] as readonly PromiseRecordLoadError[],
          records: [] as readonly PromiseRecord[],
        }),
      onSuccess: (items) =>
        Effect.forEach(
          items,
          (item, index) =>
            decodePromiseRecord(path, index, item).pipe(
              Effect.matchEffect({
                onFailure: (error) => Effect.succeed({ error, type: "failure" as const }),
                onSuccess: (record) => Effect.succeed({ record, type: "success" as const }),
              }),
            ),
          { concurrency: "unbounded" },
        ).pipe(
          Effect.map((perRecord) => {
            const errors: PromiseRecordLoadError[] = [];
            const records: PromiseRecord[] = [];
            for (const result of perRecord as readonly PerRecordResult[]) {
              if (result.type === "failure") errors.push(result.error);
              else records.push(result.record);
            }
            return { errors, records };
          }),
        ),
    }),
  );
};

export const loadPromiseRecords = (
  rootDir: string,
): Effect.Effect<readonly PromiseRecord[], PromiseFileReadError | PromiseRecordLoadErrors> =>
  Effect.gen(function* () {
    const files = yield* findPromiseFiles(rootDir);
    const fileResults = yield* Effect.forEach(files, loadPromisesFile, {
      concurrency: "unbounded",
    });
    const errors = fileResults.flatMap((result) => result.errors);
    if (errors.length > 0) return yield* Effect.fail(new PromiseRecordLoadErrors({ errors }));
    return fileResults.flatMap((result) => result.records);
  });
