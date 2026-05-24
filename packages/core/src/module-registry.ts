import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { Effect, Schema } from "effect";
import { parse } from "yaml";

import {
  ModuleFileReadError,
  ModuleRecordLoadErrors,
  type ModuleRecordLoadError,
  ModuleSchemaDecodeError,
  ModuleYamlParseError,
  SourceFileScanError,
} from "./errors.ts";
import { type ModuleRecord, ModuleRecordSchema } from "./schema.ts";

const MODULE_FILE_SUFFIX = ".module.yaml";
const MODULES_DIR = "modules";

const SOURCE_SCAN_ROOTS: readonly string[] = ["packages", "apps", "protocol"];
const SOURCE_SCAN_EXTENSIONS: readonly string[] = [".ts", ".yaml"];
const SOURCE_SCAN_EXCLUDE_DIRS = new Set(["node_modules", "dist", "build", "tests", ".vite-hooks"]);
const SOURCE_SCAN_EXCLUDE_FILE_PATTERNS: readonly RegExp[] = [
  /\.test\.ts$/,
  /\.config\.ts$/,
  /(?:^|\/)vite\.config\.ts$/,
];

type LoadModuleRecordResult =
  | { readonly error: ModuleRecordLoadError; readonly type: "failure" }
  | { readonly record: ModuleRecord; readonly type: "success" };

const collectModuleFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return await collectModuleFiles(path);
      if (entry.isFile() && entry.name.endsWith(MODULE_FILE_SUFFIX)) return [path];
      return [];
    }),
  );
  return nested.flat().sort();
};

const findModuleFilesIn = (
  directory: string,
): Effect.Effect<readonly string[], ModuleFileReadError> =>
  Effect.tryPromise({
    try: () => collectModuleFiles(directory),
    catch: (cause) => new ModuleFileReadError({ cause, path: directory }),
  });

export const findModuleFiles = (
  rootDir: string,
): Effect.Effect<readonly string[], ModuleFileReadError> =>
  findModuleFilesIn(join(rootDir, MODULES_DIR)).pipe(
    Effect.catchTag("ModuleFileReadError", (error) => {
      const nodeError = error.cause as { readonly code?: string };
      if (nodeError.code === "ENOENT") return Effect.succeed([]);
      return Effect.fail(error);
    }),
  );

const readModuleFile = (path: string): Effect.Effect<string, ModuleFileReadError> =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (cause) => new ModuleFileReadError({ cause, path }),
  });

const parseModuleYaml = (path: string, raw: string): Effect.Effect<unknown, ModuleYamlParseError> =>
  Effect.try({
    try: () => parse(raw),
    catch: (cause) => new ModuleYamlParseError({ cause, path }),
  });

const decodeModuleRecord = (
  path: string,
  input: unknown,
): Effect.Effect<ModuleRecord, ModuleSchemaDecodeError> =>
  Schema.decodeUnknownEffect(ModuleRecordSchema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError((cause) => new ModuleSchemaDecodeError({ cause, path })),
  );

export const loadModuleRecord = (
  path: string,
): Effect.Effect<ModuleRecord, ModuleRecordLoadError> =>
  Effect.gen(function* () {
    const raw = yield* readModuleFile(path);
    const parsed = yield* parseModuleYaml(path, raw);
    return yield* decodeModuleRecord(path, parsed);
  });

const loadModuleRecordResult = (path: string): Effect.Effect<LoadModuleRecordResult> =>
  loadModuleRecord(path).pipe(
    Effect.matchEffect({
      onFailure: (error) => Effect.succeed({ error, type: "failure" as const }),
      onSuccess: (record) => Effect.succeed({ record, type: "success" as const }),
    }),
  );

export const loadModuleRecords = (
  rootDir: string,
): Effect.Effect<readonly ModuleRecord[], ModuleFileReadError | ModuleRecordLoadErrors> =>
  Effect.gen(function* () {
    const files = yield* findModuleFiles(rootDir);
    const results = yield* Effect.forEach(files, loadModuleRecordResult, {
      concurrency: "unbounded",
    });
    const errors = results
      .filter((result) => result.type === "failure")
      .map((result) => result.error);
    if (errors.length > 0) return yield* Effect.fail(new ModuleRecordLoadErrors({ errors }));
    return results.filter((result) => result.type === "success").map((result) => result.record);
  });

const isExcludedFile = (relativePath: string): boolean =>
  SOURCE_SCAN_EXCLUDE_FILE_PATTERNS.some((pattern) => pattern.test(relativePath));

const hasScanExtension = (name: string): boolean =>
  SOURCE_SCAN_EXTENSIONS.some((extension) => name.endsWith(extension));

const collectSourceFilesIn = async (
  rootDir: string,
  directory: string,
): Promise<readonly string[]> => {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (cause) {
    const nodeError = cause as { readonly code?: string };
    if (nodeError.code === "ENOENT") return [];
    throw cause;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      if (SOURCE_SCAN_EXCLUDE_DIRS.has(entry.name)) return [];
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return await collectSourceFilesIn(rootDir, path);
      if (!entry.isFile() || !hasScanExtension(entry.name)) return [];
      const relativePath = relative(rootDir, path).split(sep).join("/");
      if (isExcludedFile(relativePath)) return [];
      return [relativePath];
    }),
  );
  return nested.flat().sort();
};

export const findSourceFiles = (
  rootDir: string,
): Effect.Effect<readonly string[], SourceFileScanError> =>
  Effect.tryPromise({
    try: async () => {
      const groups = await Promise.all(
        SOURCE_SCAN_ROOTS.map((root) => collectSourceFilesIn(rootDir, join(rootDir, root))),
      );
      return groups.flat().sort();
    },
    catch: (cause) => new SourceFileScanError({ cause, path: rootDir }),
  });
