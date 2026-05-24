import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import { Effect, Schema } from "effect";
import { describe, expect } from "vite-plus/test";
import { parse } from "yaml";

import { scenarioTest } from "../../adapter-vitest/src/index.ts";
import {
  ModuleRecordSchema,
  PromiseRecordSchema,
  SeedReportSchema,
  TestResultsFileSchema,
} from "../src/index.ts";

const rootDir = process.cwd();

const loadYaml = async (path: string): Promise<unknown> => parse(await readFile(path, "utf8"));

const loadValidator = async (schemaName: string) => {
  const schema = await loadYaml(join(rootDir, "protocol", "v1", schemaName));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  return ajv.compile(schema as Parameters<Ajv2020["compile"]>[0]);
};

const fixturePaths = async (
  kind: "modules" | "promises" | "reports" | "results",
  validity: "invalid" | "valid",
) => {
  const directory = join(rootDir, "protocol", "fixtures", kind, validity);
  const files = await readdir(directory);
  return files.map((file) => join(directory, file)).sort();
};

const assertConformance = async <A>(
  schemaName: string,
  fixtureKind: "modules" | "promises" | "reports" | "results",
  effectSchema: Schema.Schema<A>,
) => {
  const validate = await loadValidator(schemaName);
  const decode = Schema.decodeUnknownEffect(effectSchema, { onExcessProperty: "error" });

  for (const path of await fixturePaths(fixtureKind, "valid")) {
    const input = await loadYaml(path);
    expect(validate(input), `${path}: ${JSON.stringify(validate.errors)}`).toBe(true);
    await expect(
      Effect.runPromise(decode(input) as Effect.Effect<A, unknown, never>),
    ).resolves.toBeDefined();
  }

  for (const path of await fixturePaths(fixtureKind, "invalid")) {
    const input = await loadYaml(path);
    expect(validate(input), `${path} should fail protocol validation`).toBe(false);
    await expect(
      Effect.runPromise(decode(input) as Effect.Effect<A, unknown, never>),
    ).rejects.toBeDefined();
  }
};

describe("protocol conformance", () => {
  scenarioTest(
    "harness.protocol.module_schema_is_portable",
    "keeps module fixtures aligned between protocol schema and Effect Schema",
    async () => {
      await assertConformance("module.schema.yaml", "modules", ModuleRecordSchema);
    },
  );

  scenarioTest(
    "harness.protocol.conformance_fixtures_lock_reference_behavior",
    "keeps promise fixtures aligned between protocol schema and Effect Schema",
    async () => {
      await assertConformance("promise.schema.yaml", "promises", PromiseRecordSchema);
    },
  );

  scenarioTest(
    "harness.protocol.conformance_fixtures_lock_reference_behavior",
    "keeps result fixtures aligned between protocol schema and Effect Schema",
    async () => {
      await assertConformance("results.schema.yaml", "results", TestResultsFileSchema);
    },
  );

  scenarioTest(
    "harness.protocol.conformance_fixtures_lock_reference_behavior",
    "keeps report fixtures aligned between protocol schema and Effect Schema",
    async () => {
      await assertConformance("report.schema.yaml", "reports", SeedReportSchema);
    },
  );

  scenarioTest(
    "harness.protocol.cli_contract_is_versioned_and_enforced",
    "keeps the CLI protocol contract versioned and explicit",
    async () => {
      const contract = await loadYaml(join(rootDir, "protocol", "v1", "cli.yaml"));

      expect(contract).toMatchObject({
        apiVersion: 1,
        commands: {
          check: {
            reads: [
              "promises/**/*.promises.yaml",
              "modules/**/*.module.yaml",
              "packages/**",
              "apps/**",
              "protocol/**",
            ],
            writes: [],
          },
          report: {
            reads: [
              "promises/**/*.promises.yaml",
              "modules/**/*.module.yaml",
              "packages/**",
              "apps/**",
              "protocol/**",
              ".harness/results.yaml",
            ],
            writes: [],
          },
          test: {
            reads: [
              "promises/**/*.promises.yaml",
              "modules/**/*.module.yaml",
              "packages/**",
              "apps/**",
              "protocol/**",
              ".harness/results.yaml",
            ],
            writes: [".harness/results.yaml"],
          },
          verify: {
            reads: [
              "promises/**/*.promises.yaml",
              "modules/**/*.module.yaml",
              "packages/**",
              "apps/**",
              "protocol/**",
              ".harness/results.yaml",
            ],
            writes: [],
          },
        },
        environment: {
          HARNESS_ROOT_DIR:
            "The workspace root adapters should use when writing .harness/results.yaml.",
        },
        exitCodes: {
          failure: 1,
          success: 0,
        },
        kind: "harness-cli-contract",
      });
    },
  );
});
