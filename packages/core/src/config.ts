import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Effect, Schema } from "effect";
import { parse } from "yaml";

import {
  HarnessConfigFileReadError,
  type HarnessConfigLoadError,
  HarnessConfigSchemaDecodeError,
  HarnessConfigYamlParseError,
} from "./errors.ts";
import { HarnessConfigSchema, type HarnessConfig } from "./schema.ts";

export const harnessConfigPath = "harness.yaml";

const resolveConfigPath = (rootDir: string): string => join(rootDir, harnessConfigPath);

const readHarnessConfigFile = (path: string): Effect.Effect<string, HarnessConfigFileReadError> =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (cause) => new HarnessConfigFileReadError({ cause, path }),
  });

const parseHarnessConfigYaml = (
  path: string,
  raw: string,
): Effect.Effect<unknown, HarnessConfigYamlParseError> =>
  Effect.try({
    try: () => parse(raw),
    catch: (cause) => new HarnessConfigYamlParseError({ cause, path }),
  });

const decodeHarnessConfig = (
  path: string,
  input: unknown,
): Effect.Effect<HarnessConfig, HarnessConfigSchemaDecodeError> =>
  Schema.decodeUnknownEffect(HarnessConfigSchema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError((cause) => new HarnessConfigSchemaDecodeError({ cause, path })),
  );

export const loadHarnessConfig = (
  rootDir: string,
): Effect.Effect<HarnessConfig, HarnessConfigLoadError> => {
  const path = resolveConfigPath(rootDir);
  return readHarnessConfigFile(path).pipe(
    Effect.flatMap((raw) => parseHarnessConfigYaml(path, raw)),
    Effect.flatMap((parsed) => decodeHarnessConfig(path, parsed)),
  );
};
