import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect } from "vite-plus/test";

import {
  validPromiseRecordYaml,
  validPromiseYaml,
  wrapPromisesFile,
} from "../../../tests/fixtures/promise-fixtures.ts";
import { scenarioTest } from "../../adapter-vitest/src/index.ts";
import {
  buildSeedReport,
  createTestResultsFile,
  createScenarioRegistry,
  generateSeedReport,
  getPromiseRunStatus,
  loadModuleRecords,
  loadTestResults,
  loadTestResultsFile,
  loadPromiseRecords,
  type ModuleRecord,
  type PromiseRecord,
  renderSeedReportMarkdown,
  resetScenarioBindings,
  resolveLocalizedText,
  scenario,
  validateModuleCoverage,
  validatePromiseRecords,
  validateScenarioBindings,
  validateTestResults,
  writeTestResultsFile,
} from "../src/index.ts";
import { findPromiseFiles } from "../src/promise-registry.ts";

const withTempWorkspace = async (files: Record<string, string>) => {
  const root = await mkdtemp(join(tmpdir(), "seed-harness-"));
  await mkdir(join(root, "promises", "promise-registry"), { recursive: true });
  await Promise.all(
    Object.entries(files).map(([name, content]) =>
      writeFile(join(root, "promises", "promise-registry", name), content),
    ),
  );
  return {
    async cleanup() {
      await rm(root, { force: true, recursive: true });
    },
    root,
  };
};

const withTempRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), "seed-harness-empty-"));
  return {
    async cleanup() {
      await rm(root, { force: true, recursive: true });
    },
    root,
  };
};

describe("seed promise registry", () => {
  scenarioTest(
    "harness.promise_registry.load_canonical_yaml_promises",
    "loads canonical YAML promises with Effect Schema",
    async () => {
      const workspace = await withTempWorkspace({
        "promise-registry.promises.yaml": validPromiseYaml,
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        expect(records).toHaveLength(1);
        expect(records[0]?.id).toBe("harness.promise_registry.load_canonical_yaml_promises");
        expect(records[0]?.lifecycle).toBe("accepted");
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.protocol.promise_files_are_versioned",
    "requires promise files to declare the supported protocol version",
    async () => {
      const validWorkspace = await withTempWorkspace({
        "promise-registry.promises.yaml": validPromiseYaml,
      });
      const invalidWorkspace = await withTempWorkspace({
        "promise-registry.promises.yaml": validPromiseYaml.replace("apiVersion: 1\n", ""),
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(validWorkspace.root));
        expect(records).toHaveLength(1);
        await expect(
          Effect.runPromise(loadPromiseRecords(invalidWorkspace.root)),
        ).rejects.toMatchObject({
          _tag: "PromiseRecordLoadErrors",
          errors: [expect.objectContaining({ _tag: "PromisesFileSchemaDecodeError" })],
        });
      } finally {
        await validWorkspace.cleanup();
        await invalidWorkspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.promise_registry.load_canonical_yaml_promises",
    "returns an empty registry when the promises directory does not exist",
    async () => {
      const workspace = await withTempRoot();

      try {
        await expect(Effect.runPromise(findPromiseFiles(workspace.root))).resolves.toEqual([]);
        await expect(Effect.runPromise(loadPromiseRecords(workspace.root))).resolves.toEqual([]);
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.promise.schema_defines_required_fields",
    "keeps plain string natural language fields valid for untranslated promises",
    async () => {
      const workspace = await withTempWorkspace({
        "promise-registry.promises.yaml": wrapPromisesFile([
          `id: harness.promise_registry.load_plain_string_promises
feature: Seed Harness / Promise Registry
title: Plain string promise fields remain valid
purpose: Keep translation optional for small promises.
priority: P1
boundary: unit
lifecycle: accepted
given:
  - A promise uses plain string natural language fields
when:
  - The seed Harness decodes that promise
then:
  - The promise is still valid
observes:
  - promises/**/*.promises.yaml
failureMeaning: Translation became mandatory by accident.
review:
  approvedBy: xinyao
`,
        ]),
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        expect(validatePromiseRecords(records)).toEqual([]);
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.promise.canonical_file_is_grouped",
    "fails with a typed error when YAML cannot be parsed",
    async () => {
      const workspace = await withTempWorkspace({
        "broken.promises.yaml": "id: [",
      });

      try {
        await expect(Effect.runPromise(loadPromiseRecords(workspace.root))).rejects.toMatchObject({
          _tag: "PromiseRecordLoadErrors",
          errors: [expect.objectContaining({ _tag: "PromiseYamlParseError" })],
        });
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.promise.schema_defines_required_fields",
    "fails with a typed error when schema decoding fails",
    async () => {
      const workspace = await withTempWorkspace({
        "invalid.promises.yaml": validPromiseYaml.replace("lifecycle: accepted", "lifecycle: done"),
      });

      try {
        await expect(Effect.runPromise(loadPromiseRecords(workspace.root))).rejects.toMatchObject({
          _tag: "PromiseRecordLoadErrors",
          errors: [expect.objectContaining({ _tag: "PromiseSchemaDecodeError" })],
        });
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.promise.schema_defines_required_fields",
    "fails with a typed error when required promise fields are missing",
    async () => {
      const workspace = await withTempWorkspace({
        "missing-title.promises.yaml": wrapPromisesFile([
          validPromiseRecordYaml.replace(
            `title:
  en: Accepted promises are loaded from canonical YAML files
  zh-CN: 已接受的承诺会从 canonical YAML 文件中加载
`,
            "",
          ),
        ]),
      });

      try {
        await expect(Effect.runPromise(loadPromiseRecords(workspace.root))).rejects.toMatchObject({
          _tag: "PromiseRecordLoadErrors",
          errors: [expect.objectContaining({ _tag: "PromiseSchemaDecodeError" })],
        });
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.validation.rejects_unreadable_promises",
    "rejects promise ids that do not match the protocol pattern",
    async () => {
      const workspace = await withTempWorkspace({
        "invalid-id.promises.yaml": validPromiseYaml.replace(
          "harness.promise_registry.load_canonical_yaml_promises",
          "Harness.Promise Registry",
        ),
      });

      try {
        await expect(Effect.runPromise(loadPromiseRecords(workspace.root))).rejects.toMatchObject({
          _tag: "PromiseRecordLoadErrors",
          errors: [expect.objectContaining({ _tag: "PromiseSchemaDecodeError" })],
        });
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.validation.rejects_unreadable_promises",
    "reports duplicate promise ids as validation issues",
    async () => {
      const workspace = await withTempWorkspace({
        "another-registry.promises.yaml": validPromiseYaml,
        "promise-registry.promises.yaml": validPromiseYaml,
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        const issues = validatePromiseRecords(records);
        expect(issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "duplicate_promise_id",
              severity: "error",
            }),
          ]),
        );
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.validation.rejects_unreadable_promises",
    "reports blank observes items as validation issues",
    async () => {
      const workspace = await withTempWorkspace({
        "blank-observes.promises.yaml": wrapPromisesFile([
          validPromiseRecordYaml.replace("  - promises/**/*.promises.yaml", '  - ""'),
        ]),
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        const issues = validatePromiseRecords(records);
        expect(issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "blank_required_list_item",
              message: expect.stringContaining("observes[0]"),
            }),
          ]),
        );
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.validation.rejects_unreadable_promises",
    "reports vague titles as validation issues",
    async () => {
      const workspace = await withTempWorkspace({
        "vague-title.promises.yaml": wrapPromisesFile([
          validPromiseRecordYaml.replace(
            `title:
  en: Accepted promises are loaded from canonical YAML files
  zh-CN: 已接受的承诺会从 canonical YAML 文件中加载
`,
            "title: works\n",
          ),
        ]),
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        const issues = validatePromiseRecords(records);
        expect(issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "vague_title",
              severity: "error",
            }),
          ]),
        );
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.promise_registry.surfaces_per_record_decode_errors",
    "accumulates load errors across promise files",
    async () => {
      const workspace = await withTempWorkspace({
        "invalid-lifecycle.promises.yaml": validPromiseYaml.replace(
          "lifecycle: accepted",
          "lifecycle: done",
        ),
        "invalid-yaml.promises.yaml": "id: [",
      });

      try {
        await expect(Effect.runPromise(loadPromiseRecords(workspace.root))).rejects.toMatchObject({
          _tag: "PromiseRecordLoadErrors",
          errors: expect.arrayContaining([
            expect.objectContaining({ _tag: "PromiseSchemaDecodeError" }),
            expect.objectContaining({ _tag: "PromiseYamlParseError" }),
          ]),
        });
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.validation.rejects_unreadable_promises",
    "warns when an accepted promise is missing review approval metadata",
    async () => {
      const workspace = await withTempWorkspace({
        "missing-review.promises.yaml": wrapPromisesFile([
          validPromiseRecordYaml.replace("  approvedBy: xinyao\n", ""),
        ]),
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        const issues = validatePromiseRecords(records);
        expect(issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "missing_review_metadata",
              severity: "warning",
            }),
          ]),
        );
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.promise.canonical_file_is_grouped",
    "ignores legacy single-record .promise.yaml files",
    async () => {
      const workspace = await withTempWorkspace({
        "legacy.promise.yaml": validPromiseRecordYaml,
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        expect(records).toEqual([]);
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.promise.canonical_file_is_grouped",
    "rejects grouped wrappers with an empty promises array",
    async () => {
      const workspace = await withTempWorkspace({
        "empty.promises.yaml": "apiVersion: 1\npromises: []\n",
      });

      try {
        await expect(Effect.runPromise(loadPromiseRecords(workspace.root))).rejects.toMatchObject({
          _tag: "PromiseRecordLoadErrors",
          errors: [expect.objectContaining({ _tag: "PromisesFileSchemaDecodeError" })],
        });
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.promise_registry.surfaces_per_record_decode_errors",
    "surfaces every per-record decode error in one pass with file path and index",
    async () => {
      const badLifecycle = validPromiseRecordYaml
        .replace(
          "id: harness.promise_registry.load_canonical_yaml_promises",
          "id: harness.test.bad_lifecycle",
        )
        .replace("lifecycle: accepted", "lifecycle: done");
      const badId = validPromiseRecordYaml.replace(
        "harness.promise_registry.load_canonical_yaml_promises",
        "Harness.Bad Id",
      );

      const workspace = await withTempWorkspace({
        "mixed.promises.yaml": wrapPromisesFile([validPromiseRecordYaml, badLifecycle, badId]),
      });

      try {
        await expect(Effect.runPromise(loadPromiseRecords(workspace.root))).rejects.toMatchObject({
          _tag: "PromiseRecordLoadErrors",
          errors: expect.arrayContaining([
            expect.objectContaining({ _tag: "PromiseSchemaDecodeError", index: 1 }),
            expect.objectContaining({ _tag: "PromiseSchemaDecodeError", index: 2 }),
          ]),
        });
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.promise.schema_supports_example_variants",
    "accepts a non-empty examples table where each row carries a name and string-valued columns",
    async () => {
      const recordWithExamples = validPromiseRecordYaml.replace(
        "failureMeaning:",
        `examples:
  - { name: "uppercase host", input: "Foo@BAR.com", expected: "foo@bar.com" }
  - { name: "leading whitespace", input: "  a@b.com  ", expected: "a@b.com" }
failureMeaning:`,
      );
      const workspace = await withTempWorkspace({
        "examples.promises.yaml": wrapPromisesFile([recordWithExamples]),
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        expect(records).toHaveLength(1);
        expect(records[0]?.examples).toEqual([
          { expected: "foo@bar.com", input: "Foo@BAR.com", name: "uppercase host" },
          { expected: "a@b.com", input: "  a@b.com  ", name: "leading whitespace" },
        ]);
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.promise.schema_supports_example_variants",
    "rejects an empty examples array at decode time",
    async () => {
      const recordWithEmptyExamples = validPromiseRecordYaml.replace(
        "failureMeaning:",
        `examples: []
failureMeaning:`,
      );
      const workspace = await withTempWorkspace({
        "empty-examples.promises.yaml": wrapPromisesFile([recordWithEmptyExamples]),
      });

      try {
        await expect(Effect.runPromise(loadPromiseRecords(workspace.root))).rejects.toMatchObject({
          _tag: "PromiseRecordLoadErrors",
          errors: [expect.objectContaining({ _tag: "PromiseSchemaDecodeError" })],
        });
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.promise.schema_supports_example_variants",
    "rejects example rows missing the required name key at decode time",
    async () => {
      const recordWithNamelessRow = validPromiseRecordYaml.replace(
        "failureMeaning:",
        `examples:
  - { input: "x", expected: "y" }
failureMeaning:`,
      );
      const workspace = await withTempWorkspace({
        "nameless.promises.yaml": wrapPromisesFile([recordWithNamelessRow]),
      });

      try {
        await expect(Effect.runPromise(loadPromiseRecords(workspace.root))).rejects.toMatchObject({
          _tag: "PromiseRecordLoadErrors",
          errors: [expect.objectContaining({ _tag: "PromiseSchemaDecodeError" })],
        });
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.validation.checks_examples_table_shape",
    "flags example rows whose name is blank",
    async () => {
      const recordWithBlankName = validPromiseRecordYaml.replace(
        "failureMeaning:",
        `examples:
  - { name: "good", input: "x" }
  - { name: "   ", input: "y" }
failureMeaning:`,
      );
      const workspace = await withTempWorkspace({
        "blank-name.promises.yaml": wrapPromisesFile([recordWithBlankName]),
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        const issues = validatePromiseRecords(records);
        expect(issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "blank_example_row_name",
              promiseId: "harness.promise_registry.load_canonical_yaml_promises",
              severity: "error",
            }),
          ]),
        );
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.validation.checks_examples_table_shape",
    "flags example rows whose column set differs from the first row",
    async () => {
      const recordWithDifferingColumns = validPromiseRecordYaml.replace(
        "failureMeaning:",
        `examples:
  - { name: "row-a", input: "x", expected: "y" }
  - { name: "row-b", input: "z", output: "w" }
failureMeaning:`,
      );
      const workspace = await withTempWorkspace({
        "mismatch.promises.yaml": wrapPromisesFile([recordWithDifferingColumns]),
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        const issues = validatePromiseRecords(records);
        expect(issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "inconsistent_example_columns",
              promiseId: "harness.promise_registry.load_canonical_yaml_promises",
              severity: "error",
            }),
          ]),
        );
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.validation.checks_examples_table_shape",
    "flags duplicate example row names within one promise",
    async () => {
      const recordWithDuplicateNames = validPromiseRecordYaml.replace(
        "failureMeaning:",
        `examples:
  - { name: "shared", input: "x" }
  - { name: "shared", input: "y" }
failureMeaning:`,
      );
      const workspace = await withTempWorkspace({
        "duplicate.promises.yaml": wrapPromisesFile([recordWithDuplicateNames]),
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        const issues = validatePromiseRecords(records);
        expect(issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "duplicate_example_row_name",
              promiseId: "harness.promise_registry.load_canonical_yaml_promises",
              severity: "error",
            }),
          ]),
        );
      } finally {
        await workspace.cleanup();
      }
    },
  );
});

describe("scenario bindings", () => {
  scenarioTest(
    "harness.adapters.vitest.scenario_helper.binds_tests_to_canonical_promises",
    "creates a scenario binding for a canonical promise id",
    async () => {
      resetScenarioBindings();
      const binding = await Effect.runPromise(
        scenario({
          evidence: ["promises/**/*.promises.yaml"],
          id: "harness.promise_registry.load_canonical_yaml_promises",
        }),
      );

      expect(binding).toEqual({
        evidence: ["promises/**/*.promises.yaml"],
        id: "harness.promise_registry.load_canonical_yaml_promises",
      });
    },
  );

  scenarioTest(
    "harness.adapters.vitest.scenario_helper.binds_tests_to_canonical_promises",
    "supports explicit scenario registries for isolated binding collection",
    async () => {
      resetScenarioBindings();
      const registry = createScenarioRegistry();

      await Effect.runPromise(
        scenario(
          {
            id: "harness.promise_registry.load_canonical_yaml_promises",
          },
          { registry },
        ),
      );

      expect(registry.get()).toEqual([
        { id: "harness.promise_registry.load_canonical_yaml_promises" },
      ]);
      expect(validateScenarioBindings([], registry.get())).toEqual([
        expect.objectContaining({
          code: "unknown_scenario_binding",
        }),
      ]);
    },
  );

  scenarioTest(
    "harness.adapters.vitest.scenario_helper.binds_tests_to_canonical_promises",
    "fails with a typed error when scenario id is missing",
    async () => {
      resetScenarioBindings();
      await expect(Effect.runPromise(scenario({ evidence: ["x"] }))).rejects.toMatchObject({
        _tag: "InvalidScenarioBindingError",
      });
    },
  );

  scenarioTest(
    "harness.validation.flags_unknown_scenario_bindings",
    "reports scenario bindings that do not match canonical promises",
    async () => {
      const workspace = await withTempWorkspace({
        "promise-registry.promises.yaml": validPromiseYaml,
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        const issues = validateScenarioBindings(records, [{ id: "unknown.promise" }]);
        expect(issues).toEqual([
          expect.objectContaining({
            code: "unknown_scenario_binding",
            severity: "error",
          }),
        ]);
      } finally {
        await workspace.cleanup();
      }
    },
  );
});

describe("seed reports", () => {
  scenarioTest(
    "harness.cli.report_renders_promise_status",
    "renders a readable report grouped by feature and promise",
    async () => {
      const workspace = await withTempWorkspace({
        "promise-registry.promises.yaml": validPromiseYaml,
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        const issues = validatePromiseRecords(records);
        const report = generateSeedReport(records, issues);
        const markdown = renderSeedReportMarkdown(report);

        expect(markdown).toContain("Seed Harness Report");
        expect(markdown).toContain("Feature: Seed Harness / Promise Registry");
        expect(markdown).toContain(
          "Purpose: Protect the seed Harness's reviewed behavior promises.",
        );
        expect(markdown).toContain("Given:");
        expect(markdown).toContain("Then:");
        expect(markdown).toContain("Lifecycle: accepted");
        expect(markdown).toContain("Run Status: unknown");
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.report.renders_in_requested_language",
    "renders localized promise text when a report language is requested",
    async () => {
      const workspace = await withTempWorkspace({
        "promise-registry.promises.yaml": validPromiseYaml,
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        const report = generateSeedReport(records, [], { language: "zh-CN" });
        const markdown = renderSeedReportMarkdown(report);

        expect(markdown).toContain("已接受的承诺会从 canonical YAML 文件中加载");
        expect(markdown).toContain("seed Harness 加载 promise records");
        expect(markdown).toContain("该 promise 会被解码成 PromiseRecord");
      } finally {
        await workspace.cleanup();
      }
    },
  );
});

describe("test results", () => {
  scenarioTest(
    "harness.protocol.results_are_versioned_adapter_outputs",
    "loads persisted YAML test results with Effect Schema",
    async () => {
      const workspace = await withTempRoot();

      try {
        await writeTestResultsFile(
          workspace.root,
          createTestResultsFile(
            [
              {
                file: "packages/core/tests/index.test.ts",
                promiseId: "harness.promise_registry.load_canonical_yaml_promises",
                status: "passing",
                testName: "loads canonical YAML promises with Effect Schema",
              },
            ],
            "2026-05-24T00:00:00.000Z",
          ),
        );

        const raw = await readFile(join(workspace.root, ".harness", "results.yaml"), "utf8");
        expect(raw).toContain("apiVersion: 1");
        await expect(Effect.runPromise(loadTestResults(workspace.root))).resolves.toEqual([
          {
            file: "packages/core/tests/index.test.ts",
            promiseId: "harness.promise_registry.load_canonical_yaml_promises",
            status: "passing",
            testName: "loads canonical YAML promises with Effect Schema",
          },
        ]);
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.protocol.schemas_define_language_agnostic_contract",
    "keeps protocol schema files outside the TypeScript implementation packages",
    async () => {
      const files = await Promise.all(
        [
          "promise.schema.yaml",
          "promises-file.schema.yaml",
          "results.schema.yaml",
          "report.schema.yaml",
          "cli.yaml",
        ].map((name) => readFile(join(process.cwd(), "protocol", "v1", name), "utf8")),
      );

      const apiVersionBearingFiles = files.filter(
        (_, index) => index !== 0, // promise.schema.yaml is the per-record schema; apiVersion lives at the wrapper level
      );
      for (const content of apiVersionBearingFiles) {
        expect(content).toContain("apiVersion");
      }
      expect(files.join("\n")).toContain("const: 1");
      expect(files.join("\n")).toContain("harness-cli-contract");
    },
  );

  scenarioTest(
    "harness.results.schema_defines_required_fields",
    "returns no test results when the result file does not exist",
    async () => {
      const workspace = await withTempRoot();

      try {
        await expect(Effect.runPromise(loadTestResults(workspace.root))).resolves.toEqual([]);
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.protocol.results_are_versioned_adapter_outputs",
    "fails with a typed error when result YAML cannot be decoded",
    async () => {
      const workspace = await withTempRoot();
      await mkdir(join(workspace.root, ".harness"), { recursive: true });
      await writeFile(
        join(workspace.root, ".harness", "results.yaml"),
        `
apiVersion: 1
generatedAt: "2026-05-24T00:00:00.000Z"
results:
  - file: packages/core/tests/index.test.ts
    promiseId: harness.promise_registry.load_canonical_yaml_promises
    status: done
    testName: broken result
`,
      );

      try {
        await expect(Effect.runPromise(loadTestResults(workspace.root))).rejects.toMatchObject({
          _tag: "TestResultsSchemaDecodeError",
        });
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.report.computes_promise_run_status_from_results",
    "derives promise run status from collected results",
    () => {
      const promiseId = "harness.promise_registry.load_canonical_yaml_promises";

      expect(getPromiseRunStatus(promiseId, [])).toBe("unknown");
      expect(
        getPromiseRunStatus(promiseId, [
          { file: "a.test.ts", promiseId, status: "passing", testName: "passes" },
        ]),
      ).toBe("passing");
      expect(
        getPromiseRunStatus(promiseId, [
          { file: "a.test.ts", promiseId, status: "passing", testName: "passes" },
          { file: "b.test.ts", promiseId, status: "failing", testName: "fails" },
        ]),
      ).toBe("failing");
      expect(
        getPromiseRunStatus(promiseId, [
          { file: "a.test.ts", promiseId, status: "skipped", testName: "skips" },
        ]),
      ).toBe("skipped");
      expect(
        getPromiseRunStatus(promiseId, [
          { file: "a.test.ts", promiseId, status: "passing", testName: "passes" },
          { file: "b.test.ts", promiseId, status: "skipped", testName: "skips" },
        ]),
      ).toBe("skipped");
    },
  );

  scenarioTest(
    "harness.cli.report_renders_promise_status",
    "renders collected result status in reports",
    async () => {
      const workspace = await withTempWorkspace({
        "promise-registry.promises.yaml": validPromiseYaml,
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        const report = generateSeedReport(records, [], {
          results: [
            {
              file: "packages/core/tests/index.test.ts",
              promiseId: "harness.promise_registry.load_canonical_yaml_promises",
              status: "passing",
              testName: "loads canonical YAML promises with Effect Schema",
            },
          ],
        });
        const markdown = renderSeedReportMarkdown(report);

        expect(markdown).toContain("Run Status: passing");
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.validation.flags_promises_without_test_results",
    "flags implemented promises without collected test results",
    async () => {
      const workspace = await withTempWorkspace({
        "promise-registry.promises.yaml": validPromiseYaml.replace(
          "lifecycle: accepted",
          "lifecycle: implemented",
        ),
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        const issues = validateTestResults(records, []);
        expect(issues).toEqual([
          expect.objectContaining({
            code: "missing_test_result",
            promiseId: "harness.promise_registry.load_canonical_yaml_promises",
            severity: "warning",
          }),
        ]);
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.validation.flags_promises_without_test_results",
    "does not flag accepted promises that are still waiting for implementation",
    async () => {
      const workspace = await withTempWorkspace({
        "promise-registry.promises.yaml": validPromiseYaml,
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        expect(validateTestResults(records, [])).toEqual([]);
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.validation.flags_promises_without_test_results",
    "reports result bindings that do not match canonical promises",
    async () => {
      const workspace = await withTempWorkspace({
        "promise-registry.promises.yaml": validPromiseYaml,
      });

      try {
        await writeTestResultsFile(
          workspace.root,
          createTestResultsFile([
            {
              file: "packages/core/tests/index.test.ts",
              promiseId: "unknown.promise",
              status: "passing",
              testName: "unknown binding",
            },
          ]),
        );

        const report = await Effect.runPromise(buildSeedReport(workspace.root));
        expect(report.summary.errors).toBe(1);
        expect(report.summary.warnings).toBe(0);
        expect(report.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "unknown_result_binding",
              promiseId: "unknown.promise",
              severity: "error",
            }),
          ]),
        );
      } finally {
        await workspace.cleanup();
      }
    },
  );
});

const validModuleYaml = `
apiVersion: 1
id: test-module
title:
  en: Test Module
  zh-CN: 测试 module
summary:
  en: A module fixture used by registry and coverage tests.
  zh-CN: registry 和 coverage 测试使用的 module fixture。
purpose:
  en: Exercise the module registry loader and the coverage validator without touching real project modules.
  zh-CN: 在不动真实项目 module 的前提下，演练 module registry loader 和 coverage validator。
promises:
  - harness.promise_registry.load_canonical_yaml_promises
covers:
  - packages/core/src/promise-registry.ts
`;

const withTempModuleWorkspace = async (files: Record<string, string>) => {
  const root = await mkdtemp(join(tmpdir(), "seed-harness-modules-"));
  await mkdir(join(root, "modules"), { recursive: true });
  await Promise.all(
    Object.entries(files).map(([name, content]) => writeFile(join(root, "modules", name), content)),
  );
  return {
    async cleanup() {
      await rm(root, { force: true, recursive: true });
    },
    root,
  };
};

describe("module registry", () => {
  scenarioTest(
    "harness.module_registry.load_canonical_yaml_modules",
    "loads canonical YAML modules with Effect Schema",
    async () => {
      const workspace = await withTempModuleWorkspace({
        "test-module.module.yaml": validModuleYaml,
      });

      try {
        const modules = await Effect.runPromise(loadModuleRecords(workspace.root));
        expect(modules).toHaveLength(1);
        expect(modules[0]?.id).toBe("test-module");
        expect(modules[0]?.covers).toEqual(["packages/core/src/promise-registry.ts"]);
        expect(modules[0]?.promises).toEqual([
          "harness.promise_registry.load_canonical_yaml_promises",
        ]);
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.module_registry.load_canonical_yaml_modules",
    "rejects module files missing required fields",
    async () => {
      const malformed = validModuleYaml.replace(/covers:[\s\S]*$/, "");
      const workspace = await withTempModuleWorkspace({
        "missing-covers.module.yaml": malformed,
      });

      try {
        await expect(Effect.runPromise(loadModuleRecords(workspace.root))).rejects.toMatchObject({
          _tag: "ModuleRecordLoadErrors",
        });
      } finally {
        await workspace.cleanup();
      }
    },
  );
});

describe("results schema", () => {
  scenarioTest(
    "harness.results.schema_defines_required_fields",
    "rejects result files missing required fields",
    async () => {
      const workspace = await withTempRoot();

      try {
        await mkdir(join(workspace.root, ".harness"), { recursive: true });
        await writeFile(
          join(workspace.root, ".harness", "results.yaml"),
          "apiVersion: 1\nresults: []\n",
        );
        await expect(Effect.runPromise(loadTestResultsFile(workspace.root))).rejects.toMatchObject({
          _tag: "TestResultsSchemaDecodeError",
        });
      } finally {
        await workspace.cleanup();
      }
    },
  );

  scenarioTest(
    "harness.results.schema_defines_required_fields",
    "rejects result entries with non-protocol status values",
    async () => {
      const workspace = await withTempRoot();

      try {
        await mkdir(join(workspace.root, ".harness"), { recursive: true });
        await writeFile(
          join(workspace.root, ".harness", "results.yaml"),
          [
            "apiVersion: 1",
            'generatedAt: "2026-05-24T00:00:00Z"',
            "results:",
            '  - file: "packages/core/tests/index.test.ts"',
            '    promiseId: "harness.test"',
            '    status: "weird"',
            '    testName: "bad status"',
          ].join("\n"),
        );
        await expect(Effect.runPromise(loadTestResultsFile(workspace.root))).rejects.toMatchObject({
          _tag: "TestResultsSchemaDecodeError",
        });
      } finally {
        await workspace.cleanup();
      }
    },
  );
});

const buildModuleRecord = (
  overrides: Partial<ModuleRecord> & Pick<ModuleRecord, "id" | "covers">,
): ModuleRecord => ({
  apiVersion: 1,
  promises: ["harness.placeholder"],
  purpose: "purpose",
  summary: "summary",
  title: "title",
  ...overrides,
});

describe("module coverage", () => {
  scenarioTest(
    "harness.validation.flags_uncovered_source_files",
    "flags source files not matched by any module's covers list",
    () => {
      const modules: readonly ModuleRecord[] = [
        buildModuleRecord({ id: "foo", covers: ["packages/core/src/foo.ts"] }),
      ];
      const sourceFiles = ["packages/core/src/foo.ts", "packages/core/src/uncovered.ts"];

      const issues = validateModuleCoverage(modules, sourceFiles);

      expect(issues).toEqual([
        expect.objectContaining({
          code: "uncovered_source_file",
          path: "packages/core/src/uncovered.ts",
          severity: "error",
        }),
      ]);
    },
  );

  scenarioTest(
    "harness.validation.flags_uncovered_source_files",
    "treats `<dir>/**` covers entries as recursive prefix matches",
    () => {
      const modules: readonly ModuleRecord[] = [
        buildModuleRecord({ id: "tree", covers: ["packages/core/src/**"] }),
      ];
      const sourceFiles = [
        "packages/core/src/foo.ts",
        "packages/core/src/nested/bar.ts",
        "apps/cli/src/index.ts",
      ];

      const issues = validateModuleCoverage(modules, sourceFiles);

      expect(issues).toEqual([
        expect.objectContaining({
          code: "uncovered_source_file",
          path: "apps/cli/src/index.ts",
        }),
      ]);
    },
  );
});

describe("scenario binding validation", () => {
  scenarioTest(
    "harness.validation.flags_unknown_scenario_bindings",
    "flags scenario bindings whose id does not match any canonical promise",
    async () => {
      const workspace = await withTempWorkspace({
        "promise-registry.promises.yaml": validPromiseYaml,
      });

      try {
        const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
        const issues = validateScenarioBindings(records, [{ id: "harness.does_not_exist" }]);
        expect(issues).toEqual([
          expect.objectContaining({
            code: "unknown_scenario_binding",
            promiseId: "harness.does_not_exist",
            severity: "error",
          }),
        ]);
      } finally {
        await workspace.cleanup();
      }
    },
  );
});

describe("localized text fallback", () => {
  scenarioTest(
    "harness.report.falls_back_through_language_chain",
    "resolves a LocalizedText by walking the requested language, its base, then the default",
    () => {
      expect(resolveLocalizedText("hello", "zh-CN")).toBe("hello");
      expect(resolveLocalizedText({ en: "Hello", "zh-CN": "你好" }, "zh-CN")).toBe("你好");
      expect(resolveLocalizedText({ en: "Hello", zh: "你好(zh)" }, "zh-CN")).toBe("你好(zh)");
      expect(resolveLocalizedText({ en: "Hello" }, "fr")).toBe("Hello");
      expect(resolveLocalizedText({ "zh-CN": "只有中文" }, "fr")).toBe("只有中文");
    },
  );
});

describe("default-language coverage validation", () => {
  scenarioTest(
    "harness.validation.warns_when_default_language_missing",
    "warns when a localized field has no default-language (en) text",
    () => {
      const record: PromiseRecord = {
        boundary: "unit",
        failureMeaning: "fallback",
        feature: "Test",
        given: ["something"],
        id: "harness.test.example",
        lifecycle: "proposed",
        observes: ["packages/core/src/validation.ts"],
        priority: "P0",
        purpose: "purpose",
        review: {},
        // oxlint-disable-next-line unicorn/no-thenable -- Given / When / Then is project vocabulary.
        then: ["something"],
        title: { "zh-CN": "仅中文标题" },
        when: ["something"],
      };

      const issues = validatePromiseRecords([record]);

      expect(issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "missing_default_language",
            promiseId: "harness.test.example",
            severity: "warning",
          }),
        ]),
      );
    },
  );
});
