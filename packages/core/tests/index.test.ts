import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect, test } from "vite-plus/test";

import { validPromiseYaml } from "../../../tests/fixtures/promise-fixtures.ts";
import {
  createScenarioRegistry,
  generateSeedReport,
  loadPromiseRecords,
  renderSeedReportMarkdown,
  resetScenarioBindings,
  scenario,
  validatePromiseRecords,
  validateScenarioBindings,
} from "../src/index.ts";
import { findPromiseFiles } from "../src/promise-registry.ts";

const withTempWorkspace = async (files: Record<string, string>) => {
  const root = await mkdtemp(join(tmpdir(), "seed-harness-"));
  await mkdir(join(root, "promises", "test-harness"), { recursive: true });
  await Promise.all(
    Object.entries(files).map(([name, content]) =>
      writeFile(join(root, "promises", "test-harness", name), content),
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
  test("loads canonical YAML promises with Effect Schema", async () => {
    const workspace = await withTempWorkspace({
      "promise-registry.promise.yaml": validPromiseYaml,
    });

    try {
      const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
      expect(records).toHaveLength(1);
      expect(records[0]?.id).toBe("harness.promise_registry.load_canonical_yaml_promises");
      expect(records[0]?.lifecycle).toBe("accepted");
    } finally {
      await workspace.cleanup();
    }
  });

  test("returns an empty registry when the promises directory does not exist", async () => {
    const workspace = await withTempRoot();

    try {
      await expect(Effect.runPromise(findPromiseFiles(workspace.root))).resolves.toEqual([]);
      await expect(Effect.runPromise(loadPromiseRecords(workspace.root))).resolves.toEqual([]);
    } finally {
      await workspace.cleanup();
    }
  });

  test("keeps plain string natural language fields valid for untranslated promises", async () => {
    const workspace = await withTempWorkspace({
      "promise-registry.promise.yaml": `
id: harness.promise_registry.load_plain_string_promises
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
  - promises/test-harness/*.promise.yaml
failureMeaning: Translation became mandatory by accident.
review:
  approvedBy: xinyao
`,
    });

    try {
      const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
      expect(validatePromiseRecords(records)).toEqual([]);
    } finally {
      await workspace.cleanup();
    }
  });

  test("fails with a typed error when YAML cannot be parsed", async () => {
    const workspace = await withTempWorkspace({
      "broken.promise.yaml": "id: [",
    });

    try {
      await expect(Effect.runPromise(loadPromiseRecords(workspace.root))).rejects.toMatchObject({
        _tag: "PromiseRecordLoadErrors",
        errors: [expect.objectContaining({ _tag: "PromiseYamlParseError" })],
      });
    } finally {
      await workspace.cleanup();
    }
  });

  test("fails with a typed error when schema decoding fails", async () => {
    const workspace = await withTempWorkspace({
      "invalid.promise.yaml": validPromiseYaml.replace("lifecycle: accepted", "lifecycle: done"),
    });

    try {
      await expect(Effect.runPromise(loadPromiseRecords(workspace.root))).rejects.toMatchObject({
        _tag: "PromiseRecordLoadErrors",
        errors: [expect.objectContaining({ _tag: "PromiseSchemaDecodeError" })],
      });
    } finally {
      await workspace.cleanup();
    }
  });

  test("reports semantic field problems as validation issues", async () => {
    const workspace = await withTempWorkspace({
      "invalid-id.promise.yaml": validPromiseYaml.replace(
        "harness.promise_registry.load_canonical_yaml_promises",
        "Harness.Promise Registry",
      ),
    });

    try {
      const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
      const issues = validatePromiseRecords(records);
      expect(issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "invalid_promise_id",
            severity: "error",
          }),
        ]),
      );
    } finally {
      await workspace.cleanup();
    }
  });

  test("reports duplicate promise ids as validation issues", async () => {
    const workspace = await withTempWorkspace({
      "another-registry.promise.yaml": validPromiseYaml,
      "promise-registry.promise.yaml": validPromiseYaml,
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
  });

  test("reports blank observes items as validation issues", async () => {
    const workspace = await withTempWorkspace({
      "blank-observes.promise.yaml": validPromiseYaml.replace(
        "  - promises/test-harness/*.promise.yaml",
        '  - ""',
      ),
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
  });

  test("accumulates load errors across promise files", async () => {
    const workspace = await withTempWorkspace({
      "invalid-lifecycle.promise.yaml": validPromiseYaml.replace(
        "lifecycle: accepted",
        "lifecycle: done",
      ),
      "invalid-yaml.promise.yaml": "id: [",
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
  });

  test("warns when an accepted promise is missing review approval metadata", async () => {
    const workspace = await withTempWorkspace({
      "missing-review.promise.yaml": validPromiseYaml.replace("  approvedBy: xinyao\n", ""),
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
  });
});

describe("scenario bindings", () => {
  test("creates a scenario binding for a canonical promise id", async () => {
    resetScenarioBindings();
    const binding = await Effect.runPromise(
      scenario({
        evidence: ["promises/test-harness/*.promise.yaml"],
        id: "harness.promise_registry.load_canonical_yaml_promises",
      }),
    );

    expect(binding).toEqual({
      evidence: ["promises/test-harness/*.promise.yaml"],
      id: "harness.promise_registry.load_canonical_yaml_promises",
    });
  });

  test("supports explicit scenario registries for isolated binding collection", async () => {
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
  });

  test("fails with a typed error when scenario id is missing", async () => {
    resetScenarioBindings();
    await expect(Effect.runPromise(scenario({ evidence: ["x"] }))).rejects.toMatchObject({
      _tag: "InvalidScenarioBindingError",
    });
  });

  test("reports scenario bindings that do not match canonical promises", async () => {
    const workspace = await withTempWorkspace({
      "promise-registry.promise.yaml": validPromiseYaml,
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
  });
});

describe("seed reports", () => {
  test("renders a readable report grouped by feature and promise", async () => {
    const workspace = await withTempWorkspace({
      "promise-registry.promise.yaml": validPromiseYaml,
    });

    try {
      const records = await Effect.runPromise(loadPromiseRecords(workspace.root));
      const issues = validatePromiseRecords(records);
      const report = generateSeedReport(records, issues);
      const markdown = renderSeedReportMarkdown(report);

      expect(markdown).toContain("Seed Harness Report");
      expect(markdown).toContain("Feature: Seed Harness / Promise Registry");
      expect(markdown).toContain("Purpose: Protect the seed Harness's reviewed behavior promises.");
      expect(markdown).toContain("Given:");
      expect(markdown).toContain("Then:");
      expect(markdown).toContain("Lifecycle: accepted");
      expect(markdown).toContain("Run Status: unknown");
    } finally {
      await workspace.cleanup();
    }
  });

  test("renders localized promise text when a report language is requested", async () => {
    const workspace = await withTempWorkspace({
      "promise-registry.promise.yaml": validPromiseYaml,
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
  });
});
